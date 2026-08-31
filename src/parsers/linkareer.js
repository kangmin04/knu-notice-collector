import { extractItemsByLinkPrefix } from "./nextSsr.js";

// 링커리어(linkareer.com) — Next.js SSR. /activity/{id} 카드 목록.
export function parseLinkareer(html, baseUrl) {
  return extractItemsByLinkPrefix(html, baseUrl, {
    linkPrefix: "/activity/",
    idPattern: /^\/activity\/(\d+)/,
  });
}
