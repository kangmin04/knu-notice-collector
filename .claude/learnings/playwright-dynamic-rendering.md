# Playwright를 이용한 동적(SPA) 사이트 렌더링 수집

## 2026-08-31 — 이벤터스/데이콘 등 SPA 목록 페이지를 수집기에 추가하며 정리

### E2E 테스트에서의 Playwright와 무엇이 다른가
E2E 테스트에서는 보통 "브라우저를 띄우고 → 사용자처럼 클릭/입력하고 → 결과를 assert"까지 다 쓴다.
여기서는 그중 앞부분, 즉 **"페이지를 실제로 렌더링시켜 완성된 DOM을 얻는다"**는 절반만 쓴다.
클릭·입력 같은 상호작용은 없고 목적은 오직 JS 실행이 끝난 뒤의 최종 HTML을 뽑아내는 것.

### 왜 정적 fetch로는 안 되는가
`fetch(url)`은 서버가 최초로 응답한 원본 HTML만 가져온다. React/Vue/Next.js CSR로 만든 SPA는
이 원본 HTML에 `<div id="root"></div>` 같은 빈 껍데기만 있고, 실제 목록은 브라우저가 그 페이지에서
JS를 실행해 API를 호출하고 DOM을 채운 *다음에야* 나타난다. 그래서 fetch로 받으면 목록이 텅 빈다.
Playwright는 실제 headless Chromium을 띄워 브라우저가 하는 일(JS 실행, API 응답 대기, DOM 렌더링)을
그대로 수행하고, 그 결과 DOM을 `page.content()`로 뽑아 cheerio 같은 정적 파서에 넘긴다.

### 구현 패턴 (레이스 컨디션 방지가 핵심)
```js
const browser = await getBrowser();                  // 헤드리스 Chromium, 전체 실행에 1개만 띄워 재사용
const context = await browser.newContext({...});      // 사이트마다 격리된 컨텍스트(쿠키/세션 분리)
const page = await context.newPage();
await page.goto(url, { waitUntil: "domcontentloaded" }); // "load"보다 이른 시점 — 아직 JS의 API 호출이 안 끝났을 수 있음
await page.waitForSelector(waitForSelector);           // 목록의 "첫 항목"이 나타날 때까지 폴링 대기
await page.waitForTimeout(2000);                       // waitForSelector는 첫 항목만 뜨면 통과 — 나머지가
                                                         // 마저 그려질 시간을 벌기 위한 grace time
return await page.content();
```
`waitForSelector`만 믿고 grace time을 생략하면, 목록 전체가 아니라 일부만 잡히는 레이스 컨디션이
생길 수 있다(실측 사례: 11건 중 1건만 잡힘). "셀렉터 등장"과 "목록 전체 렌더링 완료"는 다른 시점이라는
점이 핵심 포인트.

### static/dynamic 라우팅과 지연 로딩
수집기는 사이트 설정(`site.mode === "dynamic"`)에 따라 Playwright 경로와 평범한 fetch 경로를 분기하되,
파서 쪽은 결과가 어느 경로에서 왔는지 몰라도 되도록 항상 "완성된 HTML 문자열"이라는 동일 인터페이스로
통일한다(fetch/parse 책임 분리). 또한 `dynamic` 사이트가 하나도 없을 때는 브라우저 모듈을
`await import(...)`로 지연 로드해서 Chromium 자체를 아예 띄우지 않게 만들 수 있다 — 정적 사이트만
쓰는 경우 Playwright 오버헤드를 완전히 피하는 패턴.
