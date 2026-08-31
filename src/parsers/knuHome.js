import * as cheerio from "cheerio";
import { shortHash, cleanText } from "./common.js";

// home.knu.ac.kr 계열 CMS (국제교류처/진로취업과/IT대학 등).
// <a href='...mode=view&mv_data=BASE64'>제목</a> 패턴을 사용한다.
// 이 게시판은 안정적인 숫자 id가 없어 href 문자열을 md5 해시해 id로 쓴다.
export function parseKnuHome(html, baseUrl) {
  const $ = cheerio.load(html);
  const items = [];
  const seenIds = new Set();

  $("a[href*='mode=view']").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    const title = cleanText($(el).text());
    if (!title) return;
    const id = shortHash(href);
    if (seenIds.has(id)) return;
    seenIds.add(id);
    items.push({ id, title, url: new URL(href, baseUrl).toString() });
  });

  return items;
}
