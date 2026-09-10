import * as cheerio from "cheerio";
import { cleanText } from "./common.js";

// 그누보드 계열 게시판 (cse.knu.ac.kr, startup.knu.ac.kr, iact.or.kr 등).
// <a href="...wr_id=NNNN">제목</a> 패턴을 공통으로 사용한다.
export function parseGnuboard(html, baseUrl) {
  const $ = cheerio.load(html);
  const baseHost = new URL(baseUrl).hostname;
  const items = [];
  const seenIds = new Set();

  $("a[href*='wr_id=']").each((_, el) => {
    const href = $(el).attr("href");
    const match = href?.match(/wr_id=(\d+)/);
    if (!match) return;
    const wrId = match[1];
    const url = new URL(href, baseUrl);
    // 페이지 내 배너/위젯으로 삽입된 다른 도메인의 게시판 링크는 이 소스의 글이 아니므로 제외한다.
    if (url.hostname !== baseHost) return;
    if (seenIds.has(wrId)) return;
    const title = cleanText($(el).text());
    if (!title) return;
    seenIds.add(wrId);
    items.push({ id: wrId, title, url: url.toString() });
  });

  return items;
}
