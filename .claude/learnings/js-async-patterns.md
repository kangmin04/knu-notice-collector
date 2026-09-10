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

## 2026-09-09 — `scripts/tune-threshold.js` 순차 루프를 병렬화하는 논의 중 정리 (/deep-dive)

### `await`는 "그 함수의 이후 실행"만 멈춘다 — `.map(async fn)`이 즉시 Promise 배열을 반환하는 이유
`async function`은 호출되는 즉시 첫 `await`까지 완전히 동기 실행되고, 그 지점에서 pending
Promise를 반환하며 호출자에게 제어권을 돌려준다. `.map()`으로 여러 async 콜백을 돌리면,
콜백 하나가 끝나길 기다리지 않고 여러 개를 거의 즉시 "시작"만 시킨 배열이 나온다.

```js
// 프로젝트 코드 아님 — .map(async fn)의 일반적인 동작을 보여주는 최소 예시
const promises = labels.map((entry) => scoreTitle(entry.title));
// 이 시점에 promises는 [Promise{pending}, Promise{pending}, ...] — 아직 아무 결과도 없음
const scores = await Promise.all(promises); // 여기서 전부 끝날 때까지 한 지점에서 기다림
```

위쪽 "순차 `for-of await` vs 동시 실행" 절과 결정적으로 다른 지점: 순차 버전은 N+1번째
작업이 N번째 작업의 **완료**를 기다렸다가 비로소 **호출(디스패치)**되지만, `.map()` 버전은
여러 호출이 서로의 완료를 기다리지 않고 마이크로초 단위로 다 끝나버림 — 아래 "디스패치 vs
완료" 절 참고.

### `Promise.all`의 순서 보장 — 완료 순서가 뒤섞여도 결과 배열은 원래 인덱스 순서
`Promise.all`은 입력 배열을 인덱스와 함께 순회하며, 각 프로미스가 fulfill되면 완료 순서가
아니라 **그 원래 인덱스 자리**에 결과를 써넣는다(내부적으로 남은 개수를 세다가 0이 되면
전체를 resolve). 그래서 137번째 작업이 0번째보다 먼저 끝나도 `scores[0]`엔 항상
`labels[0]`의 결과가 들어감 — "인덱스를 기억해뒀다가 그 자리에 쓴다"는 명시적 메커니즘
덕분이지, 우연이 아님.

### run-to-completion 원자성 — lazy singleton이 병렬 호출에서도 안전한 이유(트레이스)
위쪽 2026-09-05 섹션에서 다룬 `extractorPromise`/`prototypeEmbeddingsPromise` lazy
singleton이 여러 호출이 한꺼번에 몰려도 안전한 이유를 실행 순서로 직접 추적:

```
[index 0] scoreTitle(labels[0].title) 호출
   → loadPrototypeEmbeddings() 호출 (동기 함수)
      → if (!prototypeEmbeddingsPromise)  // true
      → prototypeEmbeddingsPromise = Promise.all([...])   // 즉시 채워짐
   → await 그 promise   // ★ 여기서 처음으로 제어권을 내놓음

[index 1] scoreTitle(labels[1].title) 호출   ← index 0이 await로 넘긴 다음에야 실행
   → loadPrototypeEmbeddings() 호출
      → if (!prototypeEmbeddingsPromise)  // 이미 채워져 있음 → false, 캐시 재사용
```

JS는 싱글 스레드 + 이벤트 루프라 **`await`가 없는 동기 코드 구간은 절대 다른 코드가
끼어들 수 없다**(run-to-completion). `if(!x) x = ...` 체크와 대입 사이에 `await`가 없으므로,
아무리 많은 호출이 "동시에" 몰려도 이 체크-대입은 항상 원자적으로 실행됨 — OS 스레드처럼
언제든 선점(preemption)될 수 있는 환경이었다면 뮤텍스 없이는 안전하지 않았을 코드.

### 청크(chunk) 분할 vs 워커 풀(worker pool) — 대량 데이터로 늘어날 때의 병렬화 패턴
라벨이 수만 건으로 늘어나면 `Promise.all`을 한 번에 통짜로 돌리는 대신 동시 실행 개수를
제한해야 하는데, 두 가지 방식이 있고 효율이 다르다.

```js
// 프로젝트 코드 아님 — 청크 분할(단순하지만 "배치 장벽" 비효율 있음)
const CHUNK_SIZE = 15;
const scored = [];
for (let i = 0; i < labels.length; i += CHUNK_SIZE) {
  const chunk = labels.slice(i, i + CHUNK_SIZE);
  const chunkResults = await Promise.all(
    chunk.map(async (entry) => ({
      title: entry.title, label: entry.label, score: await scoreTitle(entry.title),
    })),
  );
  scored.push(...chunkResults);
}
```

청크 안에서 가장 느린 항목 하나가 다음 청크 시작을 막는 "배치 장벽" 비효율이 있음 — 15개 중
14개가 빨리 끝나도 1개가 느리면 그 1개를 기다리는 동안 나머지 자리는 논다.

```js
// 프로젝트 코드 아님 — 워커 풀(항상 N개 동시 유지, 하나 끝나면 즉시 다음 항목 투입)
async function scoreAllConcurrently(labels, concurrency = 15) {
  const scored = new Array(labels.length);
  let cursor = 0;
  async function worker() {
    while (cursor < labels.length) {
      const i = cursor++; // await 없는 동기 한 줄 — 위 원자성 원리 그대로 적용, race 없음
      const entry = labels[i];
      scored[i] = { title: entry.title, label: entry.label, score: await scoreTitle(entry.title) };
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return scored;
}
```

`concurrency`개의 "워커"가 공유 `cursor`에서 다음 인덱스를 하나씩 뽑아가며 일하다가, 하나가
끝나면 그 워커가 즉시 다음 항목을 집어듦 — 배치 장벽이 없음. `p-limit` 같은 npm 패키지이
내부적으로 하는 것도 본질적으로 이 패턴임.

### 실측: `@xenova/transformers`가 Node에서 쓰는 실제 백엔드 — 네이티브 addon
Node 환경에서 실제 텐서 연산이 "가짜 async"(메인 스레드를 계속 막는 동기 코드를 Promise로만
감싼 것)인지 "진짜 오프로드"인지 실제 소스를 확인해봄.

```js
// node_modules/@xenova/transformers/src/backends/onnx.js:7-8, 19-22
//   - When running in node, we use `onnxruntime-node`.
//   - When running in the browser, we use `onnxruntime-web` ...
// NOTE: Import order matters here. We need to import `onnxruntime-node` before `onnxruntime-web`.
import * as ONNX_NODE from 'onnxruntime-node';
import * as ONNX_WEB from 'onnxruntime-web';
```

`onnxruntime-node`는 컴파일된 네이티브 addon(`onnxruntime_binding.node`, N-API)임. 이
바인딩의 `session.run()`은 N-API의 AsyncWorker 방식으로 구현돼 있다고 공개적으로 알려져
있어(컴파일된 바이너리 내부까지 직접 검증한 건 아님 — caveat), 실제 행렬 연산을 **libuv
스레드풀**로 진짜 오프로드함. JS 메인 스레드는 안 막힘 — Promise로 감싸기만 하고 실제로는
동기 실행되는 흔한 함정과는 다름.

### libuv 스레드풀 크기 제한 — 병렬화 효과의 진짜 상한
libuv 스레드풀 기본 크기는 `UV_THREADPOOL_SIZE=4`(fs/crypto/DNS 등 다른 네이티브 비동기
작업과 공유). `Promise.all`로 250개를 동시에 "시작"해도 실제로 물리적으로 연산 중인 건
최대 4개뿐 — 나머지는 스레드가 빌 때까지 대기열에 머무름. 그러므로 병렬화의 실질적 상한은
`min(concurrency 설정값, UV_THREADPOOL_SIZE, 실제 CPU 코어 수)`이지 항목 개수가 아님.
`require("node:os").cpus().length`로 코어 수 확인 가능, `UV_THREADPOOL_SIZE` 환경변수로
스레드풀을 늘릴 수 있지만 코어 수 이상 늘려봐야 의미 없음(컨텍스트 스위칭만 늘어남).

### "디스패치 시점" vs "완료 시점" — 순차/병렬의 진짜 차이
`await`가 코드에 있다고 해서 그 작업 전체가 "동기적으로 실행"되는 게 아님 — `await`는 딱
"이 콜백이 자기 결과를 완성하는 시점"만 그 프로미스에 묶어둘 뿐, "이 콜백이 언제
시작(디스패치)되는지"는 이미 그 전에 끝나 있음. 100ms짜리 작업 250개, 스레드풀 4개
기준으로 비교하면:

```
순차(for + await): N+1번째 작업은 N번째가 "완료"돼야 "호출"조차 됨 → 250 × 100ms = 25,000ms
병렬(map + Promise.all): 250개 디스패치가 거의 동시에 끝나고, 실제 연산만 스레드풀
                          자리(4개)가 빌 때마다 채워짐 → 250/4 × 100ms ≈ 6,250ms (4배)
```

순차 버전은 디스패치가 이전 항목의 **완료**에 1:1로 묶여 있고(직렬), 병렬 버전은 디스패치
자체는 거의 즉시 다 끝나버리고 그 뒤로는 오직 "실제 연산"만 스레드풀 병목을 받음 — 이
구분이 "await 있는데 왜 병렬이 되냐"는 혼동을 푸는 핵심.

### 이론을 직접 벤치마크로 검증하는 법
```js
// 프로젝트 코드 아님 — 순차 vs 병렬 실측 비교용 최소 예시
console.time("sequential-20");
for (const t of titles.slice(0, 20)) await scoreTitle(t);
console.timeEnd("sequential-20");

console.time("parallel-20");
await Promise.all(titles.slice(0, 20).map((t) => scoreTitle(t)));
console.timeEnd("parallel-20");
```
병렬이 순차보다 3~4배 근처로 빠르면 위 스레드풀 오프로드 이론이 맞다는 실증이고, 거의
차이가 없으면 다른 병목(프로토타입 로딩 겹침 등)이 있다는 뜻이니 그때 다시 파봐야 함.

## 2026-09-11 — `data/delete-counts.json` 기능을 직접 구현하며 반복해서 만난 `await` 실수 정리

`cleanup-apply.js`에 사이트별 삭제 누적 카운트를 저장하는 기능을 처음부터 짜보면서, 겉보기엔
서로 다른 증상이었던 버그 세 개가 사실 전부 **같은 원인**(`async` 함수를 `await` 없이 호출)
이었다는 걸 하나씩 겪으며 확인함.

### 같은 "await 누락"이 왜 매번 다른 얼굴로 나타났는가

**1번째: 구조분해가 조용히 `undefined`로 무너짐**
```js
// 당시 실제 코드(지금은 await가 붙어 고쳐짐) — src/cleanup-apply.js
let {data, isFirstRun} = loadStoreDeleted();   // await 없음
// ... 이후 site in data 에서 TypeError: Cannot use 'in' operator ...
```
`loadStoreDeleted`(store.js:29, `async function`)는 항상 Promise를 반환하는데, `{data,
isFirstRun}`으로 구조분해하면 Promise 객체엔 그런 프로퍼티가 없으니 둘 다 `undefined`가 됨.
**에러가 터지는 줄(`site in data`)과 진짜 원인(await 누락)이 몇 줄 떨어져 있어서** 처음엔
원인 파악이 헷갈렸음.

**2번째: 같은 실수, 하지만 에러 없이 값만 이상해짐**
```js
// 당시 실제 코드 — collectDeletedSites가 그때는 async function이었음
const modifiedData = collectDeletedSites(data, current);  // await 없음
console.debug('수정 반영 : ', modifiedData);  // Promise { <pending> } 가 찍힘
```
이번엔 즉시 에러가 안 남 — `console.debug`가 `Promise` 객체를 그대로 찍어버려서, "코드는
도는데 왜 값이 이상하지"라는 형태로 드러남. **같은 버그가 어디서 터지느냐가 아니라 그 결과를
어떻게 소비하느냐(구조분해 vs 그냥 출력 vs 나중에 `for...of`로 순회)에 따라 증상이 완전히
달라진다**는 걸 실감함.

**3번째: 에러도 없고 값도 멀쩡해 보이지만 잠재적 위험만 남는 경우**
`saveStoreDeleted(modifiedData)`처럼 반환값을 안 쓰고 그냥 실행만 시키는 호출은 `await`가
없어도 당장 아무 문제가 안 보임(파일도 결국 써짐). 근데 이 경우는 에러 핸들링이 안 되고,
"이 쓰기가 다른 동작(예: GitHub 이슈를 닫는 `execFileSync`)보다 먼저 끝난다는 보장"이 코드에
없는 상태로 남음 — 세 경우 중 가장 늦게, 가장 알아채기 어려운 형태.

### 근본 해법은 "await를 어디에 붙일까"가 아니라 "이 함수가 애초에 async여야 하는가"
`collectDeletedSites`를 최종적으로 고친 방법은 호출부마다 `await`를 챙기는 게 아니라,
함수 자체에서 `async`를 뗀 것. 상태 로드(`await loadStoreDeleted()`)를 `main()` 쪽으로
옮기고 나니 `collectDeletedSites`는 배열을 순회하며 `data` 객체를 mutate만 하는 순수 동기
함수가 됐고, `await`할 대상 자체가 없어지니 "호출부가 await를 깜빡할 여지"가 **구조적으로
사라짐**. 버그를 하나씩 고치는 것과, 그 버그가 애초에 나올 수 없는 모양으로 함수를 설계하는
것의 차이.

### 프로세스 종료와 "pending 파일 쓰기"의 인과관계 — 처음 설명이 틀렸던 지점
"`await` 안 하면 프로세스가 함수 끝나자마자 죽어서 파일 쓰기가 씹힐 수 있다"고 처음엔
설명했는데, 이건 인과관계가 반대였음. 정정한 내용:

- Node 프로세스는 **이벤트 루프에 아직 처리 중인 요청(pending libuv request)이 있으면 자연
  종료하지 않는다.** `fs.writeFile`은 libuv 스레드풀에 작업을 큐잉하는데, 이 pending 상태
  자체가 이벤트 루프를 "할 일이 남아있다"고 붙잡아둠 — `await`로 그 결과를 기다렸는지와
  무관하게, 그냥 "발사하고 잊은" 쓰기도 보통은 프로세스가 살아있는 동안 끝까지 완료됨.
  즉 위쪽 "디스패치 시점 vs 완료 시점" 절의 연장선 — **작업이 디스패치되는 순간 이미
  이벤트 루프에 등록되고**, `await`는 그걸 "언제 내 코드가 그 완료를 알아차리느냐"만
  결정함.
- 그런데도 `await`가 필요한 진짜 이유는 두 가지: ① **에러를 `try/catch`로 못 잡음** —
  쓰기가 실패하면(디스크 꽉 참, 권한 문제 등) unhandled rejection이 되고, Node 15+ 기본
  설정에서는 이게 프로세스를 **비동기적으로**(현재 실행 흐름이 다 끝난 뒤에) 크래시시킴.
  즉 "이슈는 이미 닫혔는데 카운트 저장은 실패하고 크래시 로그만 남는" 애매한 상태가 될 수
  있음. ② **"런타임이 알아서 기다려줄 것"이라는 암묵적 동작에 기대는 것 자체가 위험** —
  이 스크립트에 나중에 `process.exit()`가 하나 추가되거나, 이 함수가 다른 컨텍스트에서
  재사용되면 이 "자동으로 기다려짐" 가정이 깨질 수 있음. `await`는 이 순서를 코드가
  명시적으로 보장하는 사실로 바꿔주는 것.
