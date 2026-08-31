import * as cheerio from "cheerio";
import { cleanText } from "./common.js";

// 인크루트(incruit.com) 홈페이지는 EUC-KR로 서비스된다(site.encoding: "euc-kr" 필요).
// 홈페이지의 새소식/공지 목록(help.incruit.com/news/newsview.asp?newsno=NNNN)을 사용한다.
export function parseIncruit(html, baseUrl) {
  const $ = cheerio.load(html);
  const items = [];
  const seenIds = new Set();

  $("a[href*='newsno=']").each((_, el) => {
    const href = $(el).attr("href");
    const match = href?.match(/newsno=(\d+)/);
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
