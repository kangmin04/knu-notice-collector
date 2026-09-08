import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client, collectPaginatedAPI } from "@notionhq/client";
import { loadEnv } from "../src/env.js";

loadEnv();

const NOTION_TOKEN = process.env.NOTION_TOKEN;
const FEED_DATABASE_ID = process.env.NOTION_FEED_DATABASE_ID;

if (!NOTION_TOKEN || !FEED_DATABASE_ID) {
  console.error(
    "NOTION_TOKEN / NOTION_FEED_DATABASE_ID가 설정되지 않았습니다. .env를 만들어주세요.",
  );
  process.exit(1);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LABELS_PATH = path.join(__dirname, "..", "data", "labels.json");

const notion = new Client({ auth: NOTION_TOKEN });

// 전체를 한 번에 다 라벨링하기엔 부담이 커서, 최근 것부터 이 개수만 뽑는다.
// 200 → 400으로 늘려도 이미 라벨링된 앞쪽 200건은 main()의 병합 로직이 그대로 보존
const RECENT_LIMIT = 400;

// database_id로는 바로 query할 수 없어(docs/adr/0007), data_source_id를 먼저 조회
async function fetchLabelCandidates() {
  /* 
    notion.database.retrive
      - return : object, id, title(새글피드), description(nodejs 수집기) 등등..  
  */
  const database = await notion.databases.retrieve({ database_id: FEED_DATABASE_ID });
  const dataSourceId = database.data_sources[0].id;

  // collectPaginatedAPI가 has_more/next_cursor 루프를 대신 처리해 전체 결과 줌,
  const pages = await collectPaginatedAPI(notion.dataSources.query, {
    data_source_id: dataSourceId,
  });

  const recentPages = pages
    .sort((a, b) => new Date(b.created_time) - new Date(a.created_time))
    .slice(0, RECENT_LIMIT);

  return recentPages.map((page) => ({
    id: page.id,
    title: page.properties.제목.title[0]?.plain_text ?? "",
    url: page.properties.URL.url,
  }));
}

// 이미 라벨링된 항목은 재실행해도 label 값이 덮어써지지 않도록, 기존 파일과 병합. 
async function loadExistingLabels() {
  try {
    const raw = await fs.readFile(LABELS_PATH, "utf-8");
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === "ENOENT") return [];
    throw err;
  }
}

async function main() {
  const candidates = await fetchLabelCandidates(); 
  const existing = await loadExistingLabels(); // 기존에 label한 값들 또한 가져옴. (현재 labels_path임)
  const existingById = new Map(existing.map((entry) => [entry.id, entry])); // 가져온 json형식을 map형식으로. -> get(id)로 바로 entry 가져올수있게 !

  const unlabeledData = candidates
  .filter((item) => ( !existingById.get(item.id)))
  .map(unlabeled => ({
      id: unlabeled.id,
      title: unlabeled.title,
      url: unlabeled.url,
      label : null
  }))

  // 배열은 반드시 배열 스프레드([...a, ...b])로 이어붙여야 함.
  // {...existing, ...unlabeledData}로 쓰면 배열이 인덱스를 키로 하는 객체로 변환돼서
  // (existing[0]→{0:..}, unlabeledData[0]→{0:..}) 서로 같은 인덱스가 충돌 — existing 앞부분이
  // unlabeledData로 조용히 덮어써지고, 결과도 배열이 아닌 객체가 돼 이후 .map()/.filter() 호출이 다 깨짐.
  const merged = [...existing, ...unlabeledData]
  await fs.mkdir(path.dirname(LABELS_PATH), { recursive: true });
  await fs.writeFile(LABELS_PATH, JSON.stringify(merged, null, 2), "utf-8");

  console.log(`data/labels.json에 ${unlabeledData.length + existing.length}건 기록 (라벨링 필요: ${unlabeledData.length}건)`);
}

main();

// 이런 코드 어케짜노,
// let existing = await loadExistingLabels();
// let existingMAP = existing.map((item) => [item.id, item]);

// let merged = candidates.map((item) => ({

//   id : item.id,
//   title,
//   url,
//   label : existingMAP.get(item.id)?.label ?? null
// }))
