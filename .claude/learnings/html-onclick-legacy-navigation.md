# onclick 기반 레거시 게시판 파싱과 정규식 캡처 그룹

## 2026-09-10 — `src/parsers/knuWbbs.js` 리팩토링(경북대 wbbs 게시판 URL이 깨져서 나오던 버그) 계기로

### href가 죽은 값이고 실제 이동은 onclick이 담당하는 패턴
KNU 통합공지(`www.knu.ac.kr/wbbs/wbbs/bbs/btin/list.action`)의 목록 페이지를 실제로
떼어보면, 게시글 링크가 이렇게 생겼다.

```html
<!-- 실측 HTML, 파일로 존재하지 않음(서버 응답을 curl로 확인) -->
<a href="/wbbs/wbbs/bbs/btin/viewBtin.action?bbs_cde=&btin.bbs_cde=&btin.doc_no=1338340&btin.appl_no=000000&btin.page=/>&btin.search_type=&btin.search_text=&popupDeco=&btin.note_div=row&menu_idx=73"
   onclick="doRead('1338340', '000000', '11', 'row');return false;">
  [로봇부트캠프사업단]2026학년도 2학기 로봇부트캠프사업단 사업설명회 안내
</a>
```

`href`는 서버 템플릿(`${btin.page}` 등)이 치환되지 않고 방치된 **깨진 값**이다
(`btin.page=` 뒤에 `/>` 라는 글자 그대로가 남아있음). 실제 네비게이션은
`onclick="doRead(docNo, applNo, bbsCde, noteDiv);return false;"`가 전담한다 —
`return false`가 href 클릭 자체를 무효화한다.

**왜 이런 구조가 됐는가**: `.action` 확장자(Struts 계열 레거시 Java/JSP 프레임워크)
게시판은 목록→상세→"목록으로" 이동 시 페이지 번호·검색조건 같은 상태를 유지해야
했는데, 이걸 매 링크마다 서버가 정확한 href로 렌더링하기보다 "클릭 시 JS 함수가
파라미터를 채워 이동"하는 코드젠 템플릿이 당시 기본값이었다. 개발자 입장에서
href는 "JS 꺼진 환경 대비용" formality였고 실제 로직은 onclick에 있었기 때문에,
href 템플릿 버그가 몇 년째 방치돼도 실사용에 지장이 없어 아무도 몰랐을 것으로 추정.

```js
// src/parsers/knuWbbs.js:11-32
export function parseKnuWbbs(html, baseUrl) {
  const $ = cheerio.load(html);
  const items = [];
  const seenIds = new Set();
  const menuIdx = new URL(baseUrl).searchParams.get("menu_idx");

  $("[onclick*='doRead(']").each((_, el) => {
    const onclick = $(el).attr("onclick") ?? "";
    const match = onclick.match(/doRead\('([^']+)',\s*'([^']+)',\s*'([^']+)'/);
    if (!match) return;
    const [, docNo, applNo, bbsCde] = match;
    ...
    const url = new URL(
      `/wbbs/wbbs/bbs/btin/viewBtin.action?btin.bbs_cde=${bbsCde}&btin.doc_no=${docNo}&btin.appl_no=${applNo}&menu_idx=${menuIdx}`,
      baseUrl,
    ).toString();
```

고친 방식: `href` 대신 `onclick` 문자열에서 `doRead`의 인자 3개(docNo, applNo,
bbsCde)를 정규식으로 뽑아 URL을 직접 재조립. `menu_idx`는 href 안이 아니라 목록
페이지 자체의 쿼리스트링(`baseUrl`)에 있어서 거기서 재사용. 실제로 필요한 최소
파라미터가 뭔지는 curl로 하나씩 빼보며 실측 확인(`btin.page`, `btin.search_type`,
`btin.note_div`는 없어도 200 + 정상 콘텐츠).

같은 패턴을 쓰는 다른 파서:
```js
// src/parsers/egov.js:13-17 (대구테크노파크, eGov 표준프레임워크)
$("[onclick*='fn_egov_inqire_notice']").each((_, el) => {
  const onclick = $(el).attr("onclick") ?? "";
  const match = onclick.match(/fn_egov_inqire_notice\('([^']+)',\s*'([^']+)'/);
  if (!match) return;
  const [, nttId, bbsId] = match;
```

`src/parsers/dip.js`도 동일 계열. 이 프로젝트의 파서 19개 중 onclick 방식이
필요한 건 3개(`dip.js`, `egov.js`, `knuWbbs.js`)뿐이고, 나머지 16개는 `href`를
그대로 쓴다 — 같은 경북대 안에서도 `home.knu.ac.kr` CMS(`src/parsers/knuHome.js`,
`<a href='...mode=view&mv_data=...'>`)는 이미 정상적인 href를 쓴다. **레거시
시스템(`.action`/`.do` 확장자, 옛날 게시판 코드 스타일 URL)일수록 onclick
패턴이 나올 확률이 높다**는 경험칙.

### 왜 최신 사이트는 이 패턴을 점점 안 쓰는가
세 가지 흐름이 겹쳐서 일어난 변화:

1. **URL이 "진짜 리소스 주소"여야 한다는 인식** — `doRead(...)` 방식은 클릭 전까지
   실제 목적지를 브라우저/검색엔진/사람 모두 알 수 없다. 링크 공유, 새 탭, 즐겨찾기,
   크롤링이 전부 불안정해진다. SEO·접근성 표준이 자리잡으며 `href`에 실제 파라미터를
   넣는 쪽이 상식이 됨.
2. **SPA(React/Vue 등)의 클라이언트 라우팅** — 요즘도 JS가 클릭을 가로채긴 하지만
   `history.pushState()`로 주소창 URL 자체를 실제 목적지로 갱신한다. `doRead`+
   `return false`처럼 href를 죽은 값으로 방치하지 않고, JS가 개입해도 URL은 항상
   유효한 상태를 유지한다.
3. **인라인 이벤트 핸들러 회피** — `onclick="..."`처럼 태그 속성에 JS 코드 문자열을
   박는 방식은 관심사 분리 원칙에 안 맞고, CSP(Content-Security-Policy)로 인라인
   스크립트를 차단하는 게 보안 표준 관행이 되면서 `addEventListener`로 분리하는
   쪽이 사실상 강제됨.

### 정규식 캡처 그룹과 `match()` 반환값
```
/doRead\('([^']+)',\s*'([^']+)',\s*'([^']+)'/
```
- `doRead\(` — `(`는 정규식에서 "그룹 시작"이라는 특수 의미가 있어, 리터럴 괄호
  한 글자를 찾으려면 `\(`로 이스케이프해야 한다.
- `'([^']+)'` — 작은따옴표로 감싸인 값 하나. `[^']`는 "작은따옴표가 아닌 문자
  아무거나", `+`는 1개 이상 반복. `(...)`로 감싸면 **캡처 그룹**이 되어 나중에
  값만 따로 꺼낼 수 있다.
- `,\s*` — 콤마 뒤 공백 유무가 들쭉날쭉해도(`'1338340', '000000'`) 매칭되게
  `\s*`(공백 0개 이상)로 여유를 둠.

`문자열.match(정규식)`을 호출하면(글로벌 플래그 `g` 없을 때) 배열이 나오는데:
- `match[0]` = 매치된 전체 문자열 (`"doRead('1338340', '000000', '11'"`)
- `match[1]`, `match[2]`, `match[3]` = 각 캡처 그룹 값

**흔한 함정**: `const [docNo, applNo, bbsCde] = match;`처럼 `match[0]`(전체 매치
문자열)을 건너뛰지 않고 구조분해하면, 캡처 그룹 값들이 한 칸씩 밀려서 `docNo`에
전체 매치 문자열이 들어가는 조용한 버그가 생긴다. `const [, docNo, applNo, bbsCde]
= match;`처럼 맨 앞을 빈 자리로 비워 `match[0]`을 건너뛰어야 한다 — 에러가 나지
않아서 캡처 그룹 개수를 늘릴 때마다 destructuring 변수 개수(그룹 수 + 1)를 맞췄는지
매번 의식해서 확인해야 하는 유형의 버그다.
