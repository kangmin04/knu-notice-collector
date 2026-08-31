import crypto from "node:crypto";

export function shortHash(input) {
  return crypto.createHash("md5").update(input).digest("hex").slice(0, 12);
}

export function cleanText(text) {
  return text.replace(/\s+/g, " ").trim();
}

export function absolutize(href, baseUrl) {
  return new URL(href, baseUrl).toString();
}

// cheerio(DOM 파서)를 쓸 수 없을 만큼 마크업이 깨진 페이지에서 정규식으로 직접
// 추출할 때만 사용한다. cheerio의 attr()/text()는 엔티티를 자동으로 디코딩해준다.
export function decodeEntities(text) {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, " ");
}
