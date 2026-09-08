import { execFileSync } from "node:child_process";
import { loadEnv } from "./env.js";
import { queryStaleUnrelatedItems } from "./notion.js";
import { STALE_DAYS } from "./cleanup-config.js";

loadEnv();

const NOTION_TOKEN = process.env.NOTION_TOKEN;
const FEED_DATABASE_ID = process.env.NOTION_FEED_DATABASE_ID;
const DRY_RUN = process.env.DRY_RUN === "1" || process.argv.includes("--dry-run");
const ISSUE_TITLE = "🧹 정리 대상 후보";

if (!NOTION_TOKEN || !FEED_DATABASE_ID) {
  console.error(
    "NOTION_TOKEN / NOTION_FEED_DATABASE_ID가 설정되지 않았습니다. .env.example을 참고해 .env를 만들어주세요.",
  );
  process.exit(1);
}

// 사람이 읽는 목록과, cleanup-apply.js가 승인 시점에 다시 파싱할 page id 배열을
// 이슈 본문 하나에 함께 담음. 매번 오늘자 전체 후보로 덮어써야(append 아님)
// 그 사이 사용자가 Notion에서 IT 관련 체크를 고친 글이 자연히 목록에서 빠진다.
function buildIssueBody(candidates) {
  const list = candidates.map((c) => `- [${c.title}](${c.url}) (\`${c.id}\`)`).join("\n");
  const idsJson = JSON.stringify(candidates.map((c) => c.id));

  return [
    `IT 관련 미체크 상태로 ${STALE_DAYS}일 이상 지난 글 ${candidates.length}건입니다.`,
    "",
    "Notion에서 오분류(사실은 관련 있는 글)를 먼저 정정한 뒤, 남은 글을 정리해도 괜찮으면",
    "이 이슈에 `approved` 라벨을 붙여주세요. 라벨이 붙는 순간 아래 목록을 Notion에서",
    "다시 확인해 그때도 여전히 무관한 것만 삭제(휴지통 이동)합니다.",
    "",
    list,
    "",
    `<!-- CLEANUP_CANDIDATES ${idsJson} -->`,
  ].join("\n");
}

function findOpenIssueNumber() {
  const out = execFileSync(
    "gh",
    ["issue", "list", "--state", "open", "--json", "number,title", "--limit", "50"],
    { encoding: "utf-8" },
  );
  return JSON.parse(out).find((issue) => issue.title === ISSUE_TITLE)?.number;
}

async function main() {
  const candidates = await queryStaleUnrelatedItems({
    notionToken: NOTION_TOKEN,
    databaseId: FEED_DATABASE_ID,
    olderThanMs: STALE_DAYS * 24 * 60 * 60 * 1000,
  });

  if (candidates.length === 0) {
    console.log("정리 대상 후보 없음");
    return;
  }

  if (DRY_RUN) {
    console.log(`[DRY_RUN] 정리 대상 후보 ${candidates.length}건 (이슈 생성/수정 생략)`);
    for (const c of candidates) console.log(`  - ${c.title} (${c.url})`);
    return;
  }

  const body = buildIssueBody(candidates);
  const issueNumber = findOpenIssueNumber();

  if (issueNumber) {
    execFileSync("gh", ["issue", "edit", String(issueNumber), "--body", body]);
    console.log(`이슈 #${issueNumber} 갱신 완료 (후보 ${candidates.length}건)`);
  } else {
    execFileSync("gh", ["issue", "create", "--title", ISSUE_TITLE, "--body", body]);
    console.log(`새 이슈 생성 완료 (후보 ${candidates.length}건)`);
  }
}

main();
