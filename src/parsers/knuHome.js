import * as cheerio from "cheerio";
import { cleanText } from "./common.js";

// home.knu.ac.kr 계열 CMS (국제교류처/진로취업과/IT대학 등).
// <a href='...mode=view&mv_data=BASE64'>제목</a> 패턴을 사용한다.
// mv_data(base64)를 디코딩하면 "idx=6166&startPage=0&...&code=..." 형태의
// 쿼리스트링이 나오는데, idx가 게시글의 진짜 안정적인 고유 id다. 예전엔 href
// 문자열 전체를 md5 해시해 id로 썼지만, href 안에 idx와 무관한 휘발성
// 파라미터(code 등)가 섞여 있어 같은 글인데도 해시값이 달라지는 문제가 있었음. 
// (특히 상단 고정 "공지" 글이 몇 년째 재파싱되며 이 문제에 계속 노출됨).
export function parseKnuHome(html, baseUrl) {
  const $ = cheerio.load(html);
  const items = [];
  const seenIds = new Set();

  $("a[href*='mode=view']").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    const title = cleanText($(el).text());
    if (!title) return;

    const mvData = new URL(href, baseUrl).searchParams.get("mv_data");
    if (!mvData) return;

    const decoded = Buffer.from(mvData, "base64").toString();
    const id = new URLSearchParams(decoded).get("idx");
    if (!id) return;

    if (seenIds.has(id)) return;
    seenIds.add(id);
    items.push({ id, title, url: new URL(href, baseUrl).toString() });
  });

  return items;
}

