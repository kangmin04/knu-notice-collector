import * as cheerio from "cheerio";
import { cleanText } from "./common.js";

// www.knu.ac.kr wbbs 게시판. <a href="...doc_no=NNNN...">제목</a> 패턴을 사용한다.
export function parseKnuWbbs(html, baseUrl) {
  const $ = cheerio.load(html);
  const items = [];
  const seenIds = new Set();

  $("a[href*='doc_no=']").each((_, el) => {
    const href = $(el).attr("href");
    const match = href?.match(/doc_no=(\d+)/);
    if (!match) return;
    const docNo = match[1];
    if (seenIds.has(docNo)) return;
    const title = cleanText($(el).text());
    if (!title) return;
    seenIds.add(docNo);
    items.push({ id: docNo, title, url: new URL(href, baseUrl).toString() });
  });

  return items;
}
