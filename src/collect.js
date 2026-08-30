import { loadEnv } from "./env.js";
import { sites } from "./sites.js";
import { parsers } from "./parsers.js";
import { loadStore, saveStore } from "./store.js";
import { addFeedItem } from "./notion.js";

loadEnv();

const NOTION_TOKEN = process.env.NOTION_TOKEN;
const FEED_DATABASE_ID = process.env.NOTION_FEED_DATABASE_ID;

if (!NOTION_TOKEN || !FEED_DATABASE_ID) {
  console.error(
    "NOTION_TOKEN / NOTION_FEED_DATABASE_ID가 설정되지 않았습니다. .env.example을 참고해 .env를 만들어주세요."
  );
  process.exit(1);
}

async function fetchHtml(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; KNUNoticeCollector/1.0)" },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timeout);
  }
}

async function main() {
  const { data: store, isFirstRun } = await loadStore();
  let totalNew = 0;

  for (const site of sites) {
    const parse = parsers[site.parser];
    if (!parse) {
      console.error(`[${site.name}] 알 수 없는 파서 종류: ${site.parser}`);
      continue;
    }

    try {
      const html = await fetchHtml(site.url);
      const items = parse(html, site.url);
      if (items.length === 0) {
        console.warn(`[${site.name}] 게시글을 하나도 찾지 못했습니다. 사이트 구조가 바뀌었을 수 있습니다.`);
        continue;
      }

      const seenIds = new Set(store[site.id] ?? []);
      const newItems = items.filter((item) => !seenIds.has(item.id));

      if (isFirstRun) {
        // 최초 실행에서는 현재 시점의 글을 기준선으로만 기록하고 노션에는 올리지 않는다.
        store[site.id] = items.map((item) => item.id);
        console.log(`[${site.name}] 초기화 완료 (게시글 ${items.length}건을 기준선으로 저장)`);
        continue;
      }

      for (const item of newItems) {
        await addFeedItem({ site, item, notionToken: NOTION_TOKEN, databaseId: FEED_DATABASE_ID });
        seenIds.add(item.id);
      }
      store[site.id] = Array.from(seenIds);

      if (newItems.length > 0) {
        totalNew += newItems.length;
        console.log(`[${site.name}] 새 글 ${newItems.length}건 노션에 추가`);
      } else {
        console.log(`[${site.name}] 새 글 없음`);
      }
    } catch (err) {
      console.error(`[${site.name}] 수집 실패: ${err.message}`);
    }
  }

  await saveStore(store);

  if (isFirstRun) {
    console.log("모든 소스의 초기 기준선을 저장했습니다. 다음 실행부터 새 글이 노션에 쌓입니다.");
  } else {
    console.log(`완료. 이번 실행에서 새로 추가된 글: 총 ${totalNew}건`);
  }
}

main();
