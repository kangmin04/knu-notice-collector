import * as cheerio from "cheerio";
import { cleanText } from "./common.js";

// contestkorea.com — 커스텀 PHP 게시판. /sub/view.php?...&str_no=NNNN 형태.
// 같은 항목이 "D-N" 남은일수 배지 앵커와 실제 제목 앵커 두 개로 중복 노출되므로
// str_no로 dedupe하고 "D-N" 형태의 텍스트는 제목으로 취급하지 않는다.
export function parseContestKorea(html, baseUrl) {
  const $ = cheerio.load(html);
  const items = [];
  const seenIds = new Set();

  $("a[href*='view.php'][href*='str_no=']").each((_, el) => {
    const href = $(el).attr("href");
    const match = href?.match(/str_no=(\d+)/);
    if (!match) return;
    const id = match[1];
    if (seenIds.has(id)) return;
    const title = cleanText($(el).text());
    if (!title || /^D-?\d+$/.test(title)) return;
    seenIds.add(id);
    items.push({ id, title, url: new URL(href, baseUrl).toString() });
  });

  return items;
}
