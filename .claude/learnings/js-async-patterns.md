# JS/Node 비동기 패턴

## 2026-08-31 — knu-notice-collector(src/collect.js, browser.js, fetchers.js) 코드 설명 중 정리

### 지연 초기화 싱글턴: `x ??= asyncFn()`
모듈 스코프 변수에 **Promise 자체**를 캐싱해두면, 별도 락이나 클래스 없이도 "최초 호출 시에만
실행하고 이후엔 같은 Promise를 재사용"하는 싱글턴을 만들 수 있음. ES 모듈이 파일당 한 번만
평가되는 특성(모듈 캐싱)을 그대로 이용하는 것.

```js
// src/browser.js:7-11
let browserPromise = null;

function getBrowser() {
  return (browserPromise ??= chromium.launch({ headless: true }));
}
```

`??=`는 `browserPromise`가 `null`일 때만 오른쪽 값을 대입하므로, `getBrowser()`가 여러 번
호출돼도 `chromium.launch()`는 딱 한 번만 실행되고 이후 호출은 같은 Promise를 그대로 돌려줌.
**주의**: `launch()`가 실패해서 reject되면 `browserPromise`엔 rejected Promise가 그대로 남아
이후 호출도 계속 실패함 — 재시도가 필요하면 실패 시 `browserPromise = null`로 되돌리는 로직을
추가해야 함.

### 동적 import로 조건부 의존성 로딩
무거운 의존성(Playwright/Chromium)을 "실제로 필요한 실행 경로에서만" 로드하고 싶을 때,
정적 `import` 대신 함수 안에서 `await import(...)`를 쓰면 그 시점까지 모듈 평가 자체를 미룰 수 있음.

```js
// src/collect.js:24-33
let usedBrowser = false;
async function fetchSiteContent(site) {
  // site.mode가 "dynamic"이면 Playwright로 렌더링, 아니면(기본값) 단순 fetch로 가져온다.
  if (site.mode === "dynamic") {
    usedBrowser = true;
    const { fetchDynamicHtml } = await import("./browser.js");
    return fetchDynamicHtml(site);
  }
  return fetchStaticText(site);
}
```

`sites.js`에 `mode: "dynamic"` 사이트가 하나도 없는 실행 경로에서는 `./browser.js`(→ `playwright`)가
아예 로드되지 않음. 번들러가 해주는 코드 스플리팅과 같은 개념을 순수 Node 스크립트에서
직접 구현한 것 — CLI 툴이나 배치 스크립트에서 시작 비용을 줄이는 데 흔히 쓰는 관용구.

### AbortController + setTimeout으로 fetch 타임아웃 걸기
Node 표준 `fetch`엔 타임아웃 옵션이 없어서, `AbortController`를 타이머와 묶는 조합이 사실상
표준 관용구로 쓰임.

```js
// src/fetchers.js:17-19, 48-50
export async function fetchStaticText(site) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), site.timeoutMs ?? 15000);
  // ... fetch(site.url, { signal: controller.signal, ... }) ...
  } finally {
    clearTimeout(timeout);
  }
}
```

`setTimeout`이 실행되면 `controller.abort()`가 호출돼 진행 중인 `fetch`가 `AbortError`로 거부됨.
`finally`에서 `clearTimeout`을 꼭 호출해야 하는 이유: 응답이 타임아웃 전에 정상적으로 끝나도
타이머를 정리하지 않으면 그 타이머가 살아남아 Node 프로세스 종료를 미묘하게 지연시키거나
불필요하게 메모리에 남을 수 있음.

### 순차 `for-of await` vs 동시 실행(`Promise.all`/`allSettled`)
여러 개의 독립적인 비동기 작업을 순회할 때, `for...of` 안에서 매번 `await`하면 **한 번에
하나씩 순차** 처리됨(다음 반복은 이전 `await`가 끝나야 시작).

```js
// src/collect.js:40, 50 (구조만 발췌)
for (const site of sites) {
  // ...
  try {
    const html = await fetchSiteContent(site);
    // ...
  } catch (err) {
    console.error(`[${site.name}] 수집 실패: ${err.message}`);
  }
}
```

`Promise.all`로 병렬화하면 21개 사이트를 훨씬 빨리 돌 수 있지만, 이 코드는 의도적으로
순차를 택한 것으로 보임 — ① 대상 서버에 동시다발적 부하를 주지 않기 위함(매너 있는
크롤링), ② `usedBrowser` 플래그나 `store` 객체 같은 공유 가변 상태를 여러 async 흐름이
동시에 건드릴 때 생기는 경쟁 상태를 피하기 위함, ③ 로그 출력 순서가 사이트 순서와
일치해 디버깅이 쉬움. **더 공부해볼 것**: `Promise.allSettled`를 쓰면 병렬화하면서도 각
작업의 성공/실패를 개별적으로 받아 지금처럼 "한 사이트 실패가 전체를 막지 않는" 특성을
유지할 수 있는데, 언제 순차가 여전히 더 나은 선택인지(레이트 리밋, 공유 리소스, 정렬된
로그 등) 판단 기준을 정리해볼 가치가 있음.

### 고정 시간 대기(sleep)로 렌더링 레이스 컨디션을 땜빵하는 패턴의 한계
`waitForSelector`는 "찾는 요소가 DOM에 하나라도 나타나면" 통과하는데, 목록형 페이지에서는
그게 "첫 항목"일 뿐 전체 목록이 다 그려졌다는 보장이 아님.

```js
// src/browser.js:29-36
if (site.waitForSelector) {
  await page.waitForSelector(site.waitForSelector, { timeout: site.timeoutMs ?? 30000 });
}
// waitForSelector는 목록의 "첫" 항목이 뜨는 순간 통과한다 — 나머지 목록이 이어서
// 렌더링될 시간을 벌기 위해 항상 추가 그레이스 타임을 둔다(실측: 이 텀이 없으면
// 이벤터스에서 11건 중 1건만 잡히는 레이스 컨디션이 발생함).
await page.waitForTimeout(2000);
return await page.content();
```

동작은 하지만 "얼마나 기다려야 충분한지"를 추측하는 방식이라 네트워크/서버 상태에 따라
여전히 깨질 수 있는 휴리스틱임. **더 공부해볼 것**: Playwright의 `waitForFunction`(예: "카드
개수가 N번 연속 안정될 때까지 폴링"), `page.waitForLoadState("networkidle")`, 또는 API 응답
자체를 가로채는(`page.on("response")`) 방식처럼, 고정 sleep보다 결정적인 대기 조건을
구성하는 법.

## 2026-09-05 — knu-notice-collector `src/relevance/embed.js` lazy singleton 구현 중 정리

### boolean 플래그로 "이미 호출했는지" 체크하면, *언제* 세팅하느냐에 따라 다르게 깨짐
동시에 두 번 호출되는 상황(`Promise.all([embed(a), embed(b)])`)을 안전하게 처리하려면
"중복 실행 방지"와 "다른 호출자가 결과를 기다리기" 두 요구사항이 **동시에** 지켜져야 하는데,
플래그를 언제 true로 바꾸느냐에 따라 둘 중 하나씩 깨지는 걸 직접 겪으며 확인함.

```js
// src/relevance/embed.js:19-27 (사용자가 직접 시행착오를 남긴 주석 원문)
// 아래 로직의 문제: promise.all()로 두개가 동시에 오면, A는 false여서 모델 생성할거고,
// await떄문에 실행권이 B로 넘어갈텐데, 이떄 B도 아직은 false라 모델이 두번 호출됨.
// let alreadyCalled = false;
// if(!alreadyCalled){
//     alreadyCalled = true;
//     extractor = await pipeline("feature-extraction", "Xenova/paraphrase-multilingual-MiniLM-L12-v2");
// }

// Nodejs design pattern에서 배운 lazy promise !!!!!!
let extractorPromise;

export async function embed(text) {
  if (!extractorPromise) {
    extractorPromise = pipeline(/* ... */); // await 없이 즉시(동기적으로) 대입
  }
  const extractor = await extractorPromise; // 모든 호출자가 '같은' Promise를 기다림
  // ...
}
```

두 가지 실패 패턴을 실제로 구분해봄:
- **결과값(`extractor = await pipeline(...)`)을 캐시**하면: 대입이 `await` **뒤**에 일어나서,
  A가 await 중일 때 B가 체크해도 여전히 비어있는 상태 → B도 또 `pipeline()`을 호출(중복 실행).
- **boolean 플래그를 `await` 전에 동기적으로 set**하면: 중복 호출은 막히지만, B는 "이미
  처리 중이구나" 하고 그냥 지나쳐버려서 아직 준비 안 된 값을 그대로 쓰려 함(TOCTOU 버그 —
  check와 use 사이에 다른 코드가 끼어들 수 있는 게 핵심 원인).
- **Promise 자체를 `await` 전에 캐시**하면: 대입이 동기적이라 중복 호출도 안 막히는 문제가
  없고, 모든 호출자가 `await`로 "진짜 완료"까지 기다리므로 두 문제 다 해결됨. Promise가
  "이미 시작했다는 신호"와 "결과가 준비될 때까지 기다릴 대상"을 동시에 겸하는 게 핵심.

### `for...of`는 루프 변수를 감소시켜도 되감을 수 없음
(라벨링 CLI에 "이전 응답으로 되돌아가기" 기능을 설계하다 나온 논의 — 프로젝트에 실제로
구현되진 않았고, 아래는 개념 설명용 최소 예시.)

```js
// 프로젝트 코드 아님 — for...of의 일반적인 동작을 보여주는 최소 예시
const items = ["a", "b", "c"];
for (const [i, item] of items.entries()) {
  if (조건) {
    i--; // 아무 효과 없음 — i는 이번 반복 스코프의 새 지역 변수일 뿐
    continue;
  }
}
```

`for...of`는 매 반복마다 이터레이터에서 **다음 값을 새로 뽑아** 루프 변수에 새 바인딩을
만든다. 그 지역 변수를 반복문 안에서 감소시켜도 이터레이터 자체의 내부 위치는 전혀 영향을
안 받아서, 다음 반복은 그냥 원래 순서대로 진행됨. "이전 항목으로 되돌아가기"처럼 되감기가
필요하면 `for...of`가 아니라 **직접 관리하는 인덱스로 도는 `while`/`for` 루프**를 써야 함
(`let i = 0; while (i < arr.length) { ...; i--; continue; }` 형태).
