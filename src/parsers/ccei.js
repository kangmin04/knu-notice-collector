// 대구창조경제혁신센터(ccei.creativekorea.or.kr) — 홈페이지 HTML은 $.ajax로 채워지는
// 빈 위젯이라, 배후 JSON API(POST /daegu/main/public_notice_list.json, body:
// "sPtime=now&kind=my")를 직접 호출해 얻은 JSON을 그대로 사용한다. HTML 파싱 없음.
//
// 개별 공지의 고유 상세 URL 패턴은 실측으로 찾지 못했다(사이트가 JS로 모달/상세를
// 렌더링하며, 정적으로 재구성 가능한 규칙을 확인하지 못함) — 우선 목록 페이지로 링크한다.
export function parseCcei(jsonText, baseUrl) {
  const data = JSON.parse(jsonText);
  const list = data.allem_list ?? [];
  const items = [];

  for (const row of list) {
    const id = row.SEQ;
    const title = (row.TITLE ?? "").trim();
    if (!id || !title) continue;
    items.push({ id, title, url: new URL(baseUrl).origin + "/daegu/" });
  }

  return items;
}
