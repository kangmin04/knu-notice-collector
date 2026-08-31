import * as cheerio from "cheerio";
import { cleanText } from "./common.js";

// 대구테크노파크(dgtp.or.kr) — 전자정부(eGov) 표준프레임워크. 목록 항목이
// onclick="fn_egov_inqire_notice(nttId, bbsId, ...)" 폼 제출 방식이라 실제 상세 URL이
// HTML에 없다. BoardControllView.do가 GET 쿼리 파라미터도 그대로 받아준다는 걸
// 실측으로 확인해 URL을 직접 재구성한다.
export function parseDgtp(html, baseUrl) {
  const $ = cheerio.load(html);
  const items = [];
  const seenIds = new Set();

  $("[onclick*='fn_egov_inqire_notice']").each((_, el) => {
    const onclick = $(el).attr("onclick") ?? "";
    const match = onclick.match(/fn_egov_inqire_notice\('([^']+)',\s*'([^']+)'/);
    if (!match) return;
    const [, nttId, bbsId] = match;
    if (seenIds.has(nttId)) return;
    const title = cleanText($(el).find("._subject").first().text() || $(el).text());
    if (!title) return;
    seenIds.add(nttId);
    const url = new URL(`/bbs/BoardControllView.do?bbsId=${bbsId}&nttId=${nttId}`, baseUrl).toString();
    items.push({ id: nttId, title, url });
  });

  return items;
}

// 대구창업허브 DASH(startup.daegu.go.kr)는 같은 eGov 계열로 조사됐으나, 홈페이지와
// bbsId=BBS_00189 목록 엔드포인트 모두 "지원사업공고"가 아니라 2021~2023년 고정된
// 인기글(most-viewed) 위젯만 반환함을 실측으로 확인했다. 실제 지원사업공고 게시판의
// bbsId를 찾으려면 사이트를 더 깊이 탐색해야 해서 이번 범위에서는 보류한다.
// (docs/PRD.md 재확인 대상 참고)
