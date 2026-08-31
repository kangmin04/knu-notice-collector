import * as cheerio from "cheerio";
import { cleanText } from "./common.js";

// all-con.co.kr — /hit/contest/{id} 형태. 썸네일 이미지 앵커(텍스트 없음)와 제목 앵커가
// 같은 id로 중복 노출되므로 id로 dedupe하고 텍스트가 있는 앵커만 채택한다.
export function parseAllcon(html, baseUrl) {
  const $ = cheerio.load(html);
  const items = [];
  const seenIds = new Set();

  $("a[href*='/hit/contest/']").each((_, el) => {
    const href = $(el).attr("href");
    const match = href?.match(/\/hit\/contest\/(\d+)/);
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
