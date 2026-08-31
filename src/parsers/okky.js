import { extractItemsByLinkPrefix } from "./nextSsr.js";

// OKKY IT행사(okky.kr/events/it) — Next.js SSR. /articles/{id} 카드 목록.
export function parseOkky(html, baseUrl) {
  return extractItemsByLinkPrefix(html, baseUrl, {
    linkPrefix: "/articles/",
    idPattern: /^\/articles\/(\d+)/,
  });
}
