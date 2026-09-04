# HTTP 요청 리버스엔지니어링 (DevTools Network 탭)

## 2026-09-03 — `src/fetchers.js`의 POST 분기와 `ccei-daegu` 사이트 사례를 계기로

### fetch는 GET 전용이 아니다 — method는 옵션일 뿐
`fetch(url, options)`의 `method`는 안 주면 기본값이 GET일 뿐, fetch API 자체가 GET에
묶여 있는 게 아니다. 이 프로젝트는 `site.requestBody` 유무로 메서드를 자동 유추한다.

```js
// src/fetchers.js:20-24
const isFormBody = typeof site.requestBody === "string";
const doFetch = site.insecureTLS ? undiciFetch : fetch;
const res = await doFetch(site.url, {
  method: site.requestBody ? "POST" : "GET",
```

`Content-Type`도 `requestBody`가 문자열(form-urlencoded)인지 객체(JSON)인지로 갈린다
(`src/fetchers.js:27-31`). 서버의 body-parser는 `Content-Type`을 보고 파싱 전략을
고르므로, 이 헤더가 실제 요청과 안 맞으면 서버가 body를 못 읽고 조용히 실패할 수 있다.

실제로 이 패턴을 쓰는 사이트:
```js
// src/sites.js:111-117
{
  id: "ccei-daegu",
  name: "대구창조경제혁신센터",
  url: "https://ccei.creativekorea.or.kr/daegu/main/public_notice_list.json",
  parser: "ccei",
  requestBody: "sPtime=now&kind=my",
}
```
URL이 `.json`으로 끝나지만 실제로는 화면용 HTML이 아니라 프론트엔드 JS가 별도로
호출하는 데이터 API다. 이런 값(파라미터명·값)은 서버 소스 없이는 브라우저에서
관찰해서 알아내는 수밖에 없다.

### DevTools Network 탭으로 숨겨진 API 찾는 절차
1. **타이밍 이해**: CSR(Client-Side Rendering) 사이트는 HTML을 먼저 받고, 그 안의
   `<script>`가 실행되면서 뒤늦게 데이터 요청을 쏜다. 즉 "페이지 로드"와 "데이터 요청"이
   분리되어 있다 — 정적 HTML을 cheerio로 바로 파싱할 수 없는 사이트는 대개 이 구조.
2. **필터링**: DevTools Network 탭의 `Fetch/XHR` 필터는 파일 확장자가 아니라
   **리소스 타입**(그 요청이 `fetch()`나 `XMLHttpRequest`로 만들어졌는지) 기준으로
   분류된다. 이미지/CSS/폰트 요청 수십 개 사이에서 실제 데이터 API만 걸러낼 때 씀.
   레거시 사이트(관공서·오래된 시스템)는 `fetch()`가 아니라 구식 `XHR`(jQuery `$.ajax`
   등)을 쓰는 경우가 많다.
3. **요청 해부** — 클릭 후 서브탭:
   - `Headers → General`: method, URL, status
   - `Headers → Request Headers`: `Content-Type`, 그리고 종종 `X-Requested-With:
     XMLHttpRequest` 같은 헤더 — 일부 사이트는 이 헤더 유무로 "정상 AJAX 요청인지
     직접 접근인지" 구분해서 없으면 403을 준다.
   - `Payload`: GET이면 Query String Parameters, POST면 Form Data(urlencoded) 또는
     Request Payload(JSON raw) — `site.requestBody`에 그대로 옮겨 적는 값.
   - `Preview`/`Response`: 실제 응답 데이터 구조 — 파서(`parser: "ccei"` 같은) 설계 근거.
4. **지름길 — "Copy as cURL"**: 요청 우클릭 → Copy as cURL 하면 method/url/headers/
   body를 통째로 실행 가능한 curl 명령으로 직렬화해준다. 터미널에서 그대로 실행해
   브라우저에서 본 응답과 같은지 확인하면, 세션 쿠키·Referer 같은 숨은 조건이 더
   있는지 없는지 빠르게 검증할 수 있다.
5. **파라미터 의미 추론**: `sPtime=now&kind=my` 같은 값의 의미는 요청/응답만 봐서는
   확신할 수 없다(서버 코드가 없으므로). 값을 하나씩 바꿔가며 응답 변화를 관찰하는
   블랙박스 프로빙으로 추론한다.

### CDP(Chrome DevTools Protocol)와의 연결
DevTools Network 탭은 CDP의 `Network` 도메인을 사람이 보기 좋게 그린 것뿐이다.
Playwright/Puppeteer도 같은 CDP를 통해 프로그래밍적으로 네트워크를 가로챌 수 있다
(`page.on('response', ...)`). 이 프로젝트가 SPA 사이트에 Playwright로 DOM 렌더링 후
파싱하는 방식을 쓰는데(`docs/adr/0002`), 만약 그 사이트에도 CCEI처럼 숨은 JSON API가
있다면 브라우저 렌더링 없이 그 API를 직접 호출하는 `mode: "static"`으로 훨씬 가볍게
바꿀 여지가 있다 — 새 사이트를 붙이기 전에 먼저 Network 탭으로 숨은 API가 있는지
확인해볼 가치가 있다는 뜻.

### 이 방식이 깨지는 시나리오 (설계에 남기는 이유)
- 서버가 세션 기반 CSRF 토큰을 요구하도록 바뀌면 고정 `requestBody`로는 안 통함
- `Referer`/`Origin` 검사 추가되면 헤더 안 보내는 요청이 막힘
- 서버가 파라미터명 자체를 바꾸면(`sPtime` → 다른 이름) 조용히 빈 응답/에러로 바뀜

이게 CLAUDE.md에서 "폴링 부하와 사이트 구조 변경 리스크"를 언급하고, watchdog
워크플로우(`105cb20`)로 실패를 감지하도록 만든 이유와 맞닿아 있다.



+ add


fetch의 res.body는 ReadableStream이지 문자열/Buffer가 아니에요. writeFile에 그대로 넘기면 에러가 나거나(Node 버전에 따라 다름), 운 좋게 안 터져도 [object ReadableStream] 같은 의미 없는 값이 써질 거예요. 에러 응답 본문을 실제로 보고 싶으면 await res.text()로 읽어야 함