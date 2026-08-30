import crypto from "node:crypto";

function decodeEntities(text) {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function cleanTitle(rawHtml) {
  const noTags = rawHtml.replace(/<[^>]*>/g, " ");
  return decodeEntities(noTags).replace(/\s+/g, " ").trim();
}

function shortHash(input) {
  return crypto.createHash("md5").update(input).digest("hex").slice(0, 12);
}

// 그누보드 계열 게시판 (cse.knu.ac.kr, startup.knu.ac.kr, iact.or.kr 등).
// <a href="...wr_id=NNNN">제목</a> 패턴을 공통으로 사용한다.
export function parseGnuboard(html, baseUrl) {
  const items = [];
  const seenIds = new Set();
  const baseHost = new URL(baseUrl).hostname;
  const re = /<a\s+href="([^"]*(?:\?|&(?:amp;)?)wr_id=(\d+)[^"]*)"[^>]*>([\s\S]*?)<\/a>/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const [, hrefRaw, wrId, titleRaw] = m;
    const url = new URL(decodeEntities(hrefRaw), baseUrl);
    // 페이지 내 배너/위젯으로 삽입된 다른 도메인의 게시판 링크는 이 소스의 글이 아니므로 제외한다.
    if (url.hostname !== baseHost) continue;
    if (seenIds.has(wrId)) continue;
    const title = cleanTitle(titleRaw);
    if (!title) continue;
    seenIds.add(wrId);
    items.push({ id: wrId, title, url: url.toString() });
  }
  return items;
}

// home.knu.ac.kr 계열 CMS (국제교류처/진로취업과/IT대학 등).
// <a href='...mode=view&mv_data=BASE64'>제목</a> 패턴을 사용한다.
export function parseKnuHome(html, baseUrl) {
  const items = [];
  const seenIds = new Set();
  const re = /<a\s+href='([^']*mode=view[^']*)'[^>]*>([\s\S]*?)<\/a>/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const [, hrefRaw, titleRaw] = m;
    const title = cleanTitle(titleRaw);
    if (!title) continue;
    const id = shortHash(hrefRaw);
    if (seenIds.has(id)) continue;
    seenIds.add(id);
    items.push({
      id,
      title,
      url: new URL(decodeEntities(hrefRaw), baseUrl).toString(),
    });
  }
  return items;
}

// www.knu.ac.kr wbbs 게시판. <a href="...doc_no=NNNN...">제목</a> 패턴을 사용한다.
export function parseKnuWbbs(html, baseUrl) {
  const items = [];
  const seenIds = new Set();
  const re = /<a\s+href="([^"]*doc_no=(\d+)[^"]*)"[^>]*>([\s\S]*?)<\/a>/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const [, hrefRaw, docNo, titleRaw] = m;
    if (seenIds.has(docNo)) continue;
    const title = cleanTitle(titleRaw);
    if (!title) continue;
    seenIds.add(docNo);
    items.push({
      id: docNo,
      title,
      url: new URL(decodeEntities(hrefRaw), baseUrl).toString(),
    });
  }
  return items;
}

export const parsers = {
  gnuboard: parseGnuboard,
  knuHome: parseKnuHome,
  knuWbbs: parseKnuWbbs,
};
