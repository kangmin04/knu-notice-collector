import { loadEnv } from "./env.js";
import { sites } from "./sites.js";
import { parsers } from "./parsers/index.js";
import { loadStore, saveStore } from "./store.js";
import { addFeedItem } from "./notion.js";
import { fetchStaticText } from "./fetchers.js";
import { isRelevant } from "./relevance/index.js";

loadEnv();

const NOTION_TOKEN = process.env.NOTION_TOKEN;
const FEED_DATABASE_ID = process.env.NOTION_FEED_DATABASE_ID;
const DRY_RUN = process.env.DRY_RUN === "1";

if (!NOTION_TOKEN || !FEED_DATABASE_ID) {
  console.error(
    "NOTION_TOKEN / NOTION_FEED_DATABASE_ID가 설정되지 않았습니다. .env.example을 참고해 .env를 만들어주세요.",
  );
  process.exit(1);
}

// mode: "dynamic" 사이트가 하나도 없으면 src/browser.js(Playwright)를 아예 로드하지
// 않도록 동적 import로 지연시킨다. lazyload.
let usedBrowser = false;
async function fetchSiteContent(site) {
  // site.mode가 "dynamic"이면 Playwright로 렌더링, 아니면(기본값) 단순 fetch로 가져온다.
  // 파서(parsers/*)는 둘 중 어느 경로로 왔는지 몰라도 되도록 항상 HTML 문자열을 반환한다.
  if (site.mode === "dynamic") {
    usedBrowser = true;
    const { fetchDynamicHtml } = await import("./browser.js");
    return fetchDynamicHtml(site);
  }
  return fetchStaticText(site);
}

async function main() {
  // 1. seen.json(사이트별로 이미 본 글 id 목록)을 불러온다.
  const { data: store, isFirstRun } = await loadStore();
  let totalNew = 0;

  for (const site of sites) {
    // 3. 파서가 등록돼 있는지 먼저 확인 — 없으면 이 사이트만 건너뛴다.
    const parse = parsers[site.parser];
    if (!parse) {
      console.error(`[${site.name}] 알 수 없는 파서 종류: ${site.parser}`);
      continue;
    }

    // 9. 사이트 하나가 실패해도(네트워크 오류, 파싱 예외 등) 전체 실행이 멈추지 않도록
    //    사이트 단위로 try/catch를 건다.
    try {
      // 4. static이면 fetch, dynamic이면 Playwright로 콘텐츠를 가져온 뒤 파싱한다.
      const html = await fetchSiteContent(site);
      const items = parse(html, site.url);
      // 5. 파싱 결과가 0건이면 사이트 구조가 바뀌었을 가능성이 크므로 경고만 남기고 건너뛴다.
      if (items.length === 0) {
        console.warn(
          `[${site.name}] 게시글을 하나도 찾지 못했습니다. 사이트 구조가 바뀌었을 수 있습니다.`,
        );
        continue;
      }

      // 6. store에 저장된 "이미 본 id" 집합과 비교해 새 글만 골라낸다.
      const seenIds = new Set(store[site.id] ?? []);
      const newItems = items.filter((item) => !seenIds.has(item.id));

      // 7. 이 사이트를 한 번도 수집한 적이 없으면(store에 site.id가 없으면) 이 사이트만
      // 현재 글 전체를 기준선으로 저장하고 노션에는 올리지 않는다. 전역 isFirstRun(파일
      // 자체가 없는 진짜 최초 실행)으로 판단하면, sites.js에 새 사이트를 추가할 때마다
      // 그 사이트의 기존 글 전체가 "새 글"로 오인되어 노션에 쏟아지는 버그가 생긴다.
      const siteIsFirstRun = !(site.id in store);
      if (siteIsFirstRun) {
        store[site.id] = items.map((item) => item.id);
        console.log(`[${site.name}] 초기화 완료 (게시글 ${items.length}건을 기준선으로 저장)`);
        continue;
      }

      // 8. 새 글은 관련 여부와 무관하게 전부 노션에 올리되(사용자가 직접 걸러낼 수 있도록),
      //    관련성 필터 결과는 "IT 관련" 체크박스로 표시만 해둔다. 이 글의 id는 어느 경우든
      //    seenIds에 넣어 다음 실행에서 재검토되지 않게 한다.
      let addedCount = 0;
      let relevantCount = 0;
      for (const item of newItems) {
        const { relevant, score } = await isRelevant(item.title);
        if (relevant) relevantCount++;

        if (DRY_RUN) {
          console.log(
            `[DRY_RUN][${site.name}] 새 글 추가 예정(IT 관련: ${relevant}, score ${score?.toFixed(3) ?? "N/A"}): ${item.title}`,
          );
        } else {
          await addFeedItem({
            site,
            item,
            notionToken: NOTION_TOKEN,
            databaseId: FEED_DATABASE_ID,
            relevant,
          });
        }
        seenIds.add(item.id);
        addedCount++;
      }
      store[site.id] = Array.from(seenIds);

      if (addedCount > 0) {
        totalNew += addedCount;
        console.log(
          `[${site.name}] 새 글 ${addedCount}건 노션에 추가 (IT 관련 ${relevantCount}건 / 무관 ${addedCount - relevantCount}건)`,
        );
      } else {
        console.log(`[${site.name}] 새 글 없음`);
      }
    } catch (err) {
      console.error(`[${site.name}] 수집 실패: ${err.message}`);
    }
  }

  // 10. 동적(Playwright) 파서를 하나라도 썼으면 실행 끝에 브라우저를 정리한다.
  if (usedBrowser) {
    const { closeBrowser } = await import("./browser.js");
    await closeBrowser();
  }

  // 11. DRY_RUN이면 상태 파일을 건드리지 않고, 아니면 이번 실행 결과를 seen.json에 반영한다.
  if (DRY_RUN) {
    console.log("[DRY_RUN] data/seen.json 저장을 건너뜁니다.");
  } else {
    await saveStore(store);
  }

  // 12. 전체 최초 실행(파일 자체가 없었던 경우)이었는지에 따라 마무리 메시지를 분기한다.
  if (isFirstRun) {
    console.log("모든 소스의 초기 기준선을 저장했습니다. 다음 실행부터 새 글이 노션에 쌓입니다.");
  } else {
    console.log(`완료. 이번 실행에서 새로 추가된 글: 총 ${totalNew}건`);
  }
}

main();
