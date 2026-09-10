import * as cheerio from "cheerio";
import { cleanText } from "./common.js";

// href는 서버 템플릿이 치환되지 않은 깨진 값이고, 실제 이동은
// onclick="doRead(docNo, applNo, bbsCde, noteDiv);return false;"가 담당한다.
// 레거시 자바/JSP 게시판(.action 확장자)은 실제 이동을 JS onclick 핸들러에
// 위임하고 href는 깨진 값으로 두는 경우가 많다 — onclick에 return false가
// 붙어있으면 href는 죽은 값이라고 봐도 된다.

export function parseKnuWbbs(html, baseUrl) {
  const $ = cheerio.load(html);
  const items = [];
  const seenIds = new Set();
  const menuIdx = new URL(baseUrl).searchParams.get("menu_idx");

  $("[onclick*='doRead(']").each((_, el) => {
    // doRead( 를 찾음!
    const onclick = $(el).attr("onclick") ?? "";
    const match = onclick.match(/doRead\('([^']+)',\s*'([^']+)',\s*'([^']+)'/);
    if (!match) return;
    const [, docNo, applNo, bbsCde] = match; //match[0] = 매치된 전체 문자열, match[1],match[2], match[3]에 실제 필요한 값이 있음. match(regex)(글로벌 플래그 없을 때)는 항상 [전체매치, 그룹1, 그룹2, ...] 형태를 반환한다. 그래서 destructuring할 땐 그룹 개수 + 1을 항상 의식해야 한다
    if (seenIds.has(docNo)) return;
    const title = cleanText($(el).text());
    if (!title) return;
    seenIds.add(docNo);
    const url = new URL(
      `/wbbs/wbbs/bbs/btin/viewBtin.action?btin.bbs_cde=${bbsCde}&btin.doc_no=${docNo}&btin.appl_no=${applNo}&menu_idx=${menuIdx}`,
      baseUrl,
    ).toString();
    items.push({ id: docNo, title, url });
  });

  return items;
}
