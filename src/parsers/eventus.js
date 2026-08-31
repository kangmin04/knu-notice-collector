import * as cheerio from "cheerio";
import { cleanText } from "./common.js";

// 이벤터스(event-us.kr) — Vue CSR라 Playwright 렌더링이 필요하다(mode: "dynamic").
// IT/프로그래밍 카테고리 검색 결과 페이지를 사용한다. 썸네일(빈 텍스트) 앵커와 제목
// 앵커가 같은 URL로 중복 노출되므로 URL로 dedupe한다.
export function parseEventus(html, baseUrl) {
  const $ = cheerio.load(html);
  const items = [];
  const seenIds = new Set();

  $("a[href*='/event/']").each((_, el) => {
    const href = $(el).attr("href");
    const match = href?.match(/\/event\/(\d+)/);
    if (!match) return;
    const id = match[1];
    if (seenIds.has(id)) return;
    const title = cleanText($(el).text());
    if (!title) return;
    seenIds.add(id);
    const cleanUrl = href.split("?")[0];
    items.push({ id, title, url: new URL(cleanUrl, baseUrl).toString() });
  });

  return items;
}
