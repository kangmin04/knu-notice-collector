import * as cheerio from "cheerio";
import { cleanText } from "./common.js";

// jobkorea.co.kr 홈페이지 채용 카드. /Recruit/GI_Read/{id} 형태, 카드 안 첫 번째
// .font-semibold 요소가 실제 공고 제목이다(그 뒤로 마감배지/경력조건 span이 이어짐).
export function parseJobkorea(html, baseUrl) {
  const $ = cheerio.load(html);
  const items = [];
  const seenIds = new Set();

  $("a[href*='/Recruit/GI_Read/']").each((_, el) => {
    const href = $(el).attr("href");
    const match = href?.match(/GI_Read\/(\d+)/);
    if (!match) return;
    const id = match[1];
    if (seenIds.has(id)) return;
    const title = cleanText($(el).find(".font-semibold").first().text());
    if (!title) return;
    seenIds.add(id);
    items.push({ id, title, url: new URL(href, baseUrl).toString() });
  });

  return items;
}
