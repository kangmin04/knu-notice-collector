import * as cheerio from "cheerio";
import { cleanText } from "./common.js";

// saramin.co.kr 홈페이지 채용 카드. rec_idx가 고유 id, 카드 안의 .title/.c_name 스팬에
// 실제 공고 제목/회사명이 서버렌더링되어 있다(카드 전체 텍스트를 쓰면 배지/마감일 등이 섞여 지저분해짐).
export function parseSaramin(html, baseUrl) {
  const $ = cheerio.load(html);
  const items = [];
  const seenIds = new Set();

  $("a[href*='rec_idx=']").each((_, el) => {
    const href = $(el).attr("href");
    const match = href?.match(/rec_idx=(\d+)/);
    if (!match) return;
    const id = match[1];
    if (seenIds.has(id)) return;
    const company = cleanText($(el).find(".c_name").first().text());
    const titleText = cleanText($(el).find(".title").first().text());
    if (!titleText) return;
    const title = company ? `${company} - ${titleText}` : titleText;
    seenIds.add(id);
    items.push({ id, title, url: new URL(href, baseUrl).toString() });
  });

  return items;
}
