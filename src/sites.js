// 자동 수집 대상. 경북대 공식 게시판 9곳 + 대구/전국 정적 파싱 가능 사이트 12곳.
// 새 소스를 추가하려면 parser 종류에 맞는 파서가 src/parsers/ 에 있는지 확인하고
// (없으면 새로 작성 후 src/parsers/index.js에 등록) 이 배열에 항목을 추가하면 된다.
// 스키마: mode(기본 "static"), encoding("euc-kr" 등), requestBody(문자열=form,
// 객체=JSON으로 POST), userAgent, waitForSelector(dynamic 전용), timeoutMs — 전부 선택 필드.
// 자세한 설계는 docs/architecture.md, docs/adr/ 참고.
//
// 제외 대상 (자동수집 안 함, 노션 "정보 소스 모음" DB에서만 수동 확인):
//   - 로켓펀치: Cloudflare 챌린지 403 차단, 일반 브라우저 UA로도 차단됨
//   - 대티즌: 게시판이 아니라 AI 챗봇 랜딩페이지, 수집할 목록 자체가 없음
//   - 데보션(SK): 롤링 게시판이 아니라 단일 이벤트 소개 페이지
//   - 경북대 진로취업과 채용정보/인턴십: 실제 목록이 로그인 필요한 knucube.knu.ac.kr에만 존재
//   - 대구창업허브 DASH: 홈페이지/게시판 엔드포인트 모두 2021~2023년 고정 인기글 위젯만
//     반환하고 실제 "지원사업공고" 게시판을 찾지 못함(재조사 필요, docs/PRD.md 참고)
//   - 경북대 LINC3.0 사업단: linc.knu.ac.kr 443 포트 연결 자체가 거부됨(재조사 필요)
//   - DGFEZ: 실제 공지 게시판이 AJAX로 채워져 배후 API를 찾지 못함(재조사 필요)
//   - 대구시 일자리사업정보 포털: 배후 AJAX 엔드포인트를 찾지 못함(재조사 필요)

export const sites = [
  {
    id: "knu-global",
    name: "경북대 국제교류처 - 국제화프로그램 공지",
    url: "https://home.knu.ac.kr/HOME/global/sub.htm?nav_code=glo1729572883",
    parser: "knuHome",
    category: ["교환학생"],
    target: "경북대",
  },
  {
    id: "knu-job-notice",
    name: "경북대 진로취업과 - 공지사항",
    url: "https://home.knu.ac.kr/HOME/knujob/sub.htm?nav_code=knu1623817159",
    parser: "knuHome",
    category: ["진로취업"],
    target: "경북대",
  },
  {
    id: "cse-notice",
    name: "컴퓨터학부 - 학부 공지사항",
    url: "https://cse.knu.ac.kr/bbs/board.php?bo_table=sub6_1_a&lang=kor",
    parser: "gnuboard",
    category: ["기타"],
    target: "경북대",
  },
  {
    id: "cse-job",
    name: "컴퓨터학부 - 취업정보(학부인재모집)",
    url: "https://cse.knu.ac.kr/bbs/board.php?bo_table=sub6_3_b&lang=kor",
    parser: "gnuboard",
    category: ["진로취업"],
    target: "경북대",
  },
  {
    id: "cse-seminar",
    name: "컴퓨터학부 - 세미나 및 행사",
    url: "https://cse.knu.ac.kr/bbs/board.php?bo_table=sub6_4&lang=kor",
    parser: "gnuboard",
    category: ["공모전", "해커톤"],
    target: "경북대",
  },
  {
    id: "it-news",
    name: "IT대학 NEWS 게시판",
    url: "https://home.knu.ac.kr/HOME/it/sub.htm?nav_code=it1623310437",
    parser: "knuHome",
    category: ["기타"],
    target: "경북대",
  },
  {
    id: "startup-notice",
    name: "경북대 창업지원단 - 공지사항",
    url: "https://startup.knu.ac.kr/bbs/board.php?bo_table=noti",
    parser: "gnuboard",
    category: ["공모전", "프로젝트"],
    target: "경북대",
  },
  {
    id: "iact-notice",
    name: "첨단정보통신융합산업기술원(IACT) 공지",
    url: "https://iact.or.kr/module/board/board.php?bo_id=notice",
    parser: "gnuboard",
    category: ["일경험"],
    target: "경북대",
  },
  {
    id: "knu-wbbs-notice",
    name: "경북대 홈페이지 - 학사(행사) 공지 게시판",
    url: "https://www.knu.ac.kr/wbbs/wbbs/bbs/btin/list.action?bbs_cde=11&menu_idx=73",
    parser: "knuWbbs",
    category: ["공모전"],
    target: "경북대",
  },
  {
    id: "dgtp-notice",
    name: "대구테크노파크",
    url: "https://dgtp.or.kr/",
    parser: "dgtp",
    category: ["일경험"],
    target: "대구",
    // 서버가 TLS 중간 인증서를 완전히 보내지 않아 Node fetch 기본 검증에 실패함(실측 확인).
    insecureTLS: true,
  },
  {
    id: "dip-notice",
    name: "대구디지털혁신진흥원(DID) 공지사항",
    url: "https://www.dip.or.kr/home/notice/noticebbs/boardList.ubs?fboardcd=notice",
    parser: "dip",
    category: ["기타"],
    target: "대구",
  },
  {
    id: "ccei-daegu",
    name: "대구창조경제혁신센터",
    url: "https://ccei.creativekorea.or.kr/daegu/main/public_notice_list.json",
    parser: "ccei",
    category: ["공모전", "해커톤"],
    target: "대구",
    requestBody: "sPtime=now&kind=my",
  },
  {
    id: "incruit",
    name: "인크루트",
    url: "https://www.incruit.com/",
    parser: "incruit",
    category: ["일경험", "진로취업"],
    target: "전국",
    encoding: "euc-kr",
  },
  {
    id: "contestkorea",
    name: "콘테스트코리아",
    url: "https://www.contestkorea.com/sub/list.php?int_gbn=1&Txt_bcode=030310001",
    parser: "contestkorea",
    category: ["공모전", "해커톤"],
    target: "전국",
  },
  {
    id: "saramin",
    name: "사람인",
    url: "https://www.saramin.co.kr/",
    parser: "saramin",
    category: ["일경험", "진로취업"],
    target: "전국",
  },
  {
    id: "allcon",
    name: "올콘",
    url: "https://www.all-con.co.kr/",
    parser: "allcon",
    category: ["공모전"],
    target: "전국",
    // 서버가 TLS 중간 인증서를 완전히 보내지 않아 Node fetch 기본 검증에 실패함(실측 확인).
    insecureTLS: true,
  },
  {
    id: "jobkorea",
    name: "잡코리아",
    url: "https://www.jobkorea.co.kr/",
    parser: "jobkorea",
    category: ["일경험", "진로취업"],
    target: "전국",
  },
  {
    id: "linkareer",
    name: "링커리어",
    url: "https://linkareer.com/",
    parser: "linkareer",
    category: ["공모전", "일경험", "진로취업"],
    target: "전국",
  },
  {
    id: "okky-it-events",
    name: "OKKY IT행사",
    url: "https://okky.kr/events/it",
    parser: "okky",
    category: ["해커톤", "기타"],
    target: "전국",
  },
  {
    id: "wevity",
    name: "위비티(Wevity)",
    url: "https://www.wevity.com/",
    parser: "wevity",
    category: ["공모전", "프로젝트"],
    target: "전국",
  },
  {
    id: "thinkcontest",
    name: "씽굿",
    // 루트 URL(/)의 302 리다이렉트가 Node fetch와 curl에서 서로 다른 경로로 해석돼
    // Node에서는 404가 나는 것을 확인해, 리다이렉트 최종 목적지를 직접 지정한다.
    url: "https://www.thinkcontest.com/thinkgood/index.do",
    parser: "thinkcontest",
    category: ["공모전"],
    target: "전국",
  },
  // mode: "dynamic" — Playwright로 렌더링 후 static과 동일한 파서 계층을 재사용한다.
  {
    id: "eventus",
    name: "이벤터스",
    url: "https://event-us.kr/search?category=IT%2F%ED%94%84%EB%A1%9C%EA%B7%B8%EB%9E%98%EB%B0%8D&order=score&date=%EB%AA%A8%EB%93%A0%EB%82%A0&page=1",
    parser: "eventus",
    category: ["해커톤", "공모전"],
    target: "전국",
    mode: "dynamic",
    waitForSelector: "a[href*='/event/']",
  },
  {
    id: "dacon",
    name: "데이콘(DACON)",
    url: "https://dacon.io/competitions",
    parser: "dacon",
    category: ["공모전", "프로젝트"],
    target: "전국",
    mode: "dynamic",
    waitForSelector: "a[href*='/competitions/']",
  },
];
