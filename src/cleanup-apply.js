import { execFileSync } from "node:child_process";
import { loadEnv } from "./env.js";
import { queryStaleUnrelatedItems, archiveItems } from "./notion.js";
import { STALE_DAYS } from "./cleanup-config.js";
import { loadStoreDeleted, saveStoreDeleted } from "./store.js";

loadEnv();

const NOTION_TOKEN = process.env.NOTION_TOKEN;
const FEED_DATABASE_ID = process.env.NOTION_FEED_DATABASE_ID;
const ISSUE_NUMBER = process.env.ISSUE_NUMBER;
const DRY_RUN = process.env.DRY_RUN === "1" || process.argv.includes("--dry-run");

if (!NOTION_TOKEN || !FEED_DATABASE_ID) {
  console.error(
    "NOTION_TOKEN / NOTION_FEED_DATABASE_ID가 설정되지 않았습니다. .env.example을 참고해 .env를 만들어주세요.",
  );
  process.exit(1);
}

function getIssueBody() {
  return execFileSync("gh", ["issue", "view", ISSUE_NUMBER, "--json", "body", "--jq", ".body"], {
    encoding: "utf-8",
  });
}

function parseApprovedIds(body) {
  const match = body.match(/<!-- CLEANUP_CANDIDATES (\[.*?\]) -->/s);
  return match ? JSON.parse(match[1]) : [];
}

/* item : 객체 {id, title, url, site} */
function collectDeletedSites(data, current) {
  for (const c of current) {
    const { site } = c;

    if (DRY_RUN) {
      console.log(`  - ${c.title} (${c.url})[${c.site}]`);
    }
    //처음일때
    if (!(site in data)) {
      data[site] = { count: 1 };
    } else {
      data[site].count++;
    }
  }
  return data;
}
async function main() {
  const current = await queryStaleUnrelatedItems({
    notionToken: NOTION_TOKEN,
    databaseId: FEED_DATABASE_ID,
    olderThanMs: STALE_DAYS * 24 * 60 * 60 * 1000,
  });
  const { data, _isFirstRun } = await loadStoreDeleted();

  // ISSUE_NUMBER가 없는 수동 실행(workflow_dispatch, 이슈 지정 없이)은 승인 절차를
  // 건너뛰고 지금 시점의 재조회 결과를 그대로 정리.
  if (!ISSUE_NUMBER) {
    if (DRY_RUN) {
      console.log(
        `[DRY_RUN] 수동 실행: ${current.length}건 삭제(휴지통 이동) 예정 (실제 삭제 생략)`,
      );

      const modifiedData = collectDeletedSites(data, current);
      console.debug("수정 반영 : ", modifiedData);
      return;
    }

    const archivedCount =
      current.length > 0
        ? await archiveItems({ notionToken: NOTION_TOKEN, pageIds: current.map((c) => c.id) })
        : 0;
    const modifiedData = collectDeletedSites(data, current);
    await saveStoreDeleted(modifiedData);
    console.log(`수동 실행: ${archivedCount}건 삭제(휴지통 이동) 완료`);
    return;
  }

  // 이슈 기반 실행: 승인 당시 목록(approvedIds) ∩ 지금도 여전히 무관한 것(current)만
  // 삭제한다. 그 사이 사용자가 Notion에서 체크를 고친 글은 current에서 빠져 자동 제외되고,
  // 승인 범위 밖의 새 후보가 섞여 들어가는 일도 없다.

  const approvedIds = parseApprovedIds(getIssueBody());
  if (approvedIds.length === 0) {
    execFileSync("gh", [
      "issue",
      "comment",
      ISSUE_NUMBER,
      "--body",
      "승인된 후보 목록을 이슈 본문에서 찾지 못해 삭제를 건너뛰었습니다.",
    ]);
    process.exit(1);
  }

  const currentIds = new Set(current.map((c) => c.id));
  const toArchive = approvedIds.filter((id) => currentIds.has(id));
  const skipped = approvedIds.length - toArchive.length;
  const currentById = new Map(current.map((c) => [c.id, c]));
  const archivedItems = toArchive.map((id) => currentById.get(id));

  if (DRY_RUN) {
    console.log(
      `[DRY_RUN] ${toArchive.length}건 삭제(휴지통 이동) 예정, ${skipped}건 제외 예정 (실제 삭제/이슈 갱신 생략)`,
    );
    // for (const id of toArchive) {
    //   const item = current.find((c) => c.id === id);
    //   // console.log(`  - ${item?.title ?? id} (${item?.url ?? ""})`);
    // }

    const modifiedData = collectDeletedSites(data, archivedItems);
    console.log("수정내용: ", modifiedData);
    return;
  }

  const archivedCount =
    toArchive.length > 0
      ? await archiveItems({ notionToken: NOTION_TOKEN, pageIds: toArchive })
      : 0;

  execFileSync("gh", [
    "issue",
    "comment",
    ISSUE_NUMBER,
    "--body",
    `${archivedCount}건 삭제(휴지통 이동) 완료. ${skipped}건은 승인 이후 상태가 바뀌어 제외됨.`,
  ]);
  execFileSync("gh", ["issue", "close", ISSUE_NUMBER]);

  const modifiedData = collectDeletedSites(data, archivedItems);
  await saveStoreDeleted(modifiedData);
}

main();
