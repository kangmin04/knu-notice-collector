import * as cheerio from "cheerio";
import { cleanText } from "./common.js";

// 데이콘(dacon.io/competitions) — Vue CSR라 Playwright 렌더링이 필요하다(mode: "dynamic").
// 카드 안 p.name이 실제 대회 제목이다(그 아래 info2는 태그 배지라 제외).
export function parseDacon(html, baseUrl) {
  const $ = cheerio.load(html);
  const items = [];
  const seenIds = new Set();

  $("a[href*='/competitions/']").each((_, el) => {
    const href = $(el).attr("href");
    const match = href?.match(/\/competitions\/[^/]+\/(\d+)/);
    if (!match) return;
    const id = match[1];
    if (seenIds.has(id)) return;
    const title = cleanText($(el).find("p.name").first().text());
    if (!title) return;
    seenIds.add(id);
    items.push({ id, title, url: new URL(href, baseUrl).toString() });
  });

  return items;
}
