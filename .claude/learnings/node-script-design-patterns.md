# Node 스크립트/배치 잡 설계 패턴

## 2026-08-31 — knu-notice-collector 코드 설명 중 정리

### Strategy + Registry 패턴 (문자열 키 → 함수 매핑)
사이트별로 다른 파싱 로직(전략)이 필요할 때, if/else나 switch로 분기를 하드코딩하는 대신
**"이름 → 함수" 매핑 객체(레지스트리)** 하나만 두고 그 이름을 데이터(설정)로 넘겨받는 방식.

```js
// src/parsers/index.js:19-37
export const parsers = {
  gnuboard: parseGnuboard,
  knuHome: parseKnuHome,
  knuWbbs: parseKnuWbbs,
  // ... (사이트 종류만큼 계속)
  dacon: parseDacon,
};
```

```js
// src/collect.js:41-46
const parse = parsers[site.parser];
if (!parse) {
  console.error(`[${site.name}] 알 수 없는 파서 종류: ${site.parser}`);
  continue;
}
```

`site.parser`라는 문자열 하나로 실제 실행할 전략(파서 함수)을 런타임에 조회함. "새 사이트 =
새 파서 함수 작성 + `parsers` 객체에 한 줄 등록"으로 확장 지점이 한 곳에 모임. 이 패턴이
성립하려면 **모든 전략이 동일한 함수 시그니처를 지켜야 함** — 여기서는 파서 전부가
`(html, baseUrl) => [{id, title, url}, ...]` 계약을 따르기 때문에 레지스트리 하나로 통합 가능.

### 수집(fetch) 계층과 해석(parse) 계층의 분리
"데이터를 어떻게 가져왔는지"와 "가져온 데이터를 어떻게 해석하는지"를 완전히 분리해두면,
수집 방식이 늘어나도 해석 계층은 손댈 필요가 없음.

```js
// src/browser.js:20-23
// mode: "dynamic" 사이트의 콘텐츠를 렌더링해서 완성된 HTML을 반환한다. 반환값은
// 정적 fetch와 동일하게 순수 HTML 문자열이므로, 이후 파서(src/parsers/*)는
// static/dynamic 여부를 몰라도 된다.
export async function fetchDynamicHtml(site) {
```

`fetchers.js`의 `fetchStaticText`(정적 fetch)와 `browser.js`의 `fetchDynamicHtml`(Playwright
렌더링)은 반환 타입이 똑같이 "순수 HTML 문자열"임. 그래서 SPA라서 브라우저 렌더링이 필요한
이벤터스·데이콘도, 결과물을 받는 `parsers/eventus.js` · `parsers/dacon.js` 코드는 cheerio 기반
정적 파서와 완전히 같은 패턴으로 작성돼 있음 — 파서 입장에서는 인풋이 어디서 왔는지 알
필요가 없는, 관심사 분리(Separation of Concerns)의 구체적인 예.

### 배치 잡에서 항목 단위 에러 격리 (try/catch를 루프 몸통 안에 두기)
여러 개의 독립적인 외부 자원(사이트)을 순회하며 처리할 때, try/catch를 **어디에 두느냐**가
"실패 하나가 전체를 멈추는지, 그 항목만 건너뛰는지"를 가름.

```js
// src/collect.js:40-96 (구조만 발췌)
for (const site of sites) {
  const parse = parsers[site.parser];
  if (!parse) { /* ... */ continue; }

  try {
    const html = await fetchSiteContent(site);
    const items = parse(html, site.url);
    // ... 새 글 판별 + 노션 적재 ...
  } catch (err) {
    console.error(`[${site.name}] 수집 실패: ${err.message}`);
  }
}
```

try/catch가 `for` 루프 **안쪽**에 있어서, 사이트 하나가 네트워크 오류나 파싱 예외로 실패해도
`catch`가 그 자리에서 로그만 남기고 다음 반복(다음 사이트)으로 넘어감. 만약 이 try/catch를
루프 **바깥**에 뒀다면 사이트 하나의 실패로 나머지 20개 사이트 수집이 전부 중단됐을 것.
여러 독립 작업을 순회하는 배치/ETL 스크립트 전반에 적용 가능한 내결함성(fault isolation)
패턴 — 실패를 전체 실행 단위가 아니라 가장 작은 작업 단위로 국한시킴.

### 안정적인 id가 없을 때 컨텐츠 해시로 아이덴티티 만들기
게시판에 안정적인 숫자 id가 없을 때, 그 대신 **내용(문자열)을 해시한 값**을 id로 씀.

```js
// src/parsers/common.js:3-5
export function shortHash(input) {
  return crypto.createHash("md5").update(input).digest("hex").slice(0, 12);
}
```

```js
// src/parsers/knuHome.js:12-20
$("a[href*='mode=view']").each((_, el) => {
  const href = $(el).attr("href");
  if (!href) return;
  const title = cleanText($(el).text());
  if (!title) return;
  const id = shortHash(href);        // href 문자열 자체를 md5 해시해 id로 사용
  if (seenIds.has(id)) return;
  seenIds.add(id);
  items.push({ id, title, url: new URL(href, baseUrl).toString() });
});
```

"새 글인지 판단"이라는 목적에는 완벽한 유일성보다 **같은 입력이면 항상 같은 출력**이라는
안정성만 있으면 충분하다는 관점. **더 공부해볼 것**: 12자(48비트) md5 절단본의 충돌 확률이
이 프로젝트 규모(사이트당 글 수백~수천 건)에서 실질적으로 무시 가능한 수준인지 감(생일
문제/birthday paradox)을 잡아두면, 비슷한 "안정 id 없는 데이터에 식별자 붙이기" 문제를
만났을 때 판단 기준이 됨.
