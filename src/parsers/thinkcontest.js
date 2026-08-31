import * as cheerio from "cheerio";
import { cleanText } from "./common.js";

// 씽굿(thinkcontest.com) — 목록 <a>가 href="javascript:void(0)"라 상세 URL이 없다.
// data-contest_pk 속성과, 페이지에 포함된 JSON-LD(ItemList)의 실제 상세 URL 패턴
// (/thinkgood/user/contest/view.do?contest_pk={id})을 실측으로 확인해 재구성한다.
export function parseThinkContest(html, baseUrl) {
  const $ = cheerio.load(html);
  const items = [];
  const seenIds = new Set();

  $("[data-contest_pk]").each((_, el) => {
    const id = $(el).attr("data-contest_pk");
    if (!id || seenIds.has(id)) return;
    const title = cleanText($(el).text()).replace(/^\d+\.\s*/, "");
    if (!title) return;
    seenIds.add(id);
    const url = new URL(`/thinkgood/user/contest/view.do?contest_pk=${id}`, baseUrl).toString();
    items.push({ id, title, url });
  });

  return items;
}
