import { cleanText, decodeEntities } from "./common.js";

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Next.js SSR로 서버렌더링되는 대외활동 플랫폼(링커리어, OKKY 등)이 공유하는 순회 헬퍼.
// cheerio(htmlparser2)로 파싱하면 "placeholder svg <img alt=''/> 바로 뒤에 실제 썸네일
// <img alt='제목'/>이 이어지는" 이 사이트들의 중첩 구조에서 텍스트 노드가 깨지는 것을
// 실측으로 확인해, 카드 앵커 블록은 정규식으로 직접 추출한다. 카드 안 마지막(=실제
// 썸네일) img의 alt 속성을 제목으로 우선 채택하고, 없으면 앵커의 순수 텍스트를 쓴다.
export function extractItemsByLinkPrefix(html, baseUrl, { linkPrefix, idPattern }) {
  const items = [];
  const seenIds = new Set();
  const anchorRe = new RegExp(
    `<a[^>]*href="(${escapeRegex(linkPrefix)}[^"#]*)"[^>]*>([\\s\\S]*?)<\\/a>`,
    "g",
  );

  let m;
  while ((m = anchorRe.exec(html)) !== null) {
    const [, href, inner] = m;
    const idMatch = href.match(idPattern);
    if (!idMatch) continue;
    const id = idMatch[1];
    if (seenIds.has(id)) continue;

    const alts = [...inner.matchAll(/alt="([^"]*)"/g)].map((am) => am[1]).filter(Boolean);
    const textOnly = cleanText(inner.replace(/<[^>]*>/g, " "));
    const title = decodeEntities(alts[alts.length - 1] || textOnly);
    if (!title) continue;

    seenIds.add(id);
    items.push({ id, title, url: new URL(decodeEntities(href), baseUrl).toString() });
  }

  return items;
}
