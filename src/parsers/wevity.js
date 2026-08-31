import * as cheerio from "cheerio";
import { cleanText } from "./common.js";

// 위비티(wevity.com) — 봇 식별 User-Agent는 403, 일반 브라우저 UA는 200(site.userAgent
// 불필요, 기본 UA가 이미 브라우저형이라 그대로 통과). 같은 ix(공모전 id)가 썸네일(빈 텍스트),
// 깨끗한 제목, "전략 참고" 부가텍스트가 붙은 버전까지 최대 3개 앵커로 중복 노출되므로
// id로 dedupe해 문서에서 처음 만나는 비어있지 않은 텍스트(=깨끗한 제목)를 채택한다.
export function parseWevity(html, baseUrl) {
  const $ = cheerio.load(html);
  const items = [];
  const seenIds = new Set();

  $("a[href*='gbn=view'][href*='ix=']").each((_, el) => {
    const href = $(el).attr("href");
    const match = href?.match(/ix=(\d+)/);
    if (!match) return;
    const id = match[1];
    if (seenIds.has(id)) return;
    const title = cleanText($(el).text());
    if (!title) return;
    seenIds.add(id);
    items.push({ id, title, url: new URL(href, baseUrl).toString() });
  });

  return items;
}
