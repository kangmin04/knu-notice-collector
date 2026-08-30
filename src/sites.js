// 자동 수집 대상: 실제 HTML을 확인해 파싱 규칙을 검증한 경북대 공식 게시판만 우선 포함했다.
// 링커리어/위비티 등 전국·대구 아카이브 플랫폼은 JS 렌더링/구조 변경이 잦아 v1 범위에서 제외했다.
// 진로취업과 "채용정보"/"인턴십" 페이지는 목록이 서버 HTML에 없고 클라이언트 스크립트로만 채워져
// (정적 fetch로는 파싱 불가) 제외했다 — 노션 소스 목록 DB에는 남겨두고 수동으로만 확인.
// 새 소스를 추가하려면 parser 종류에 맞는 파서가 src/parsers.js 에 있는지 확인하고 이 배열에 항목을 추가하면 된다.

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
];
