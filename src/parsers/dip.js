import * as cheerio from "cheerio";
import { cleanText } from "./common.js";

// 대구디지털혁신진흥원(dip.or.kr) — 관공서 커스텀 게시판(ubs). 목록의 <a>가
// javascript:read('writer','idx')로 클릭을 가로채, 실제 상세 URL이 HTML에 없다.
// 페이지에 포함된 read()/searchForm 정의를 실측해 boardRead.ubs?sfpsize=10&fboardcd=notice
// &fboardnum={idx}&sfpage=1 로 재구성 가능함을 확인했다.
export function parseDip(html, baseUrl) {
  const $ = cheerio.load(html);
  const items = [];
  const seenIds = new Set();

  $("td.title a").each((_, el) => {
    const onclick = $(el).attr("href") ?? $(el).attr("onclick") ?? "";
    const match = onclick.match(/read\('[^']*','(\d+)'\)/);
    if (!match) return;
    const idx = match[1];
    if (seenIds.has(idx)) return;
    const title = cleanText($(el).text());
    if (!title) return;
    seenIds.add(idx);
    const url = new URL(
      `boardRead.ubs?sfpsize=10&fboardcd=notice&fboardnum=${idx}&sfpage=1`,
      baseUrl
    ).toString();
    items.push({ id: idx, title, url });
  });

  return items;
}
