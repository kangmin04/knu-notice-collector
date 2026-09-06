# transformers.js(@xenova/transformers)로 문장 임베딩 다루기

## 2026-09-05 — knu-notice-collector `src/relevance/embed.js` 구현 중 정리

### pooling/normalize 옵션은 `pipeline()`이 아니라 `extractor()` 호출 시점에 넘겨야 함
`pipeline(task, model, options)`의 세 번째 인자는 파이프라인 **생성** 옵션(양자화 여부 등)이라,
여기 `{ pooling: "mean", normalize: true }`를 넣으면 조용히 무시되고 pooling이 전혀 안 먹힘.
실제 pooling/normalize는 **extractor를 텍스트에 적용하는 호출**에 넘겨야 함.

```js
// src/relevance/embed.js:29-41
export async function embed(text) {
  if (!extractorPromise) {
    extractorPromise = pipeline(
      "feature-extraction",
      "Xenova/paraphrase-multilingual-MiniLM-L12-v2",
    );
  }
  const extractor = await extractorPromise;
  const tensorObj = await extractor(text, { pooling: "mean", normalize: true }); // ← 여기
  const flat_number = Array.from(tensorObj.data);

  return flat_number;
}
```

실측으로 확인한 차이: `pipeline()` 생성 시 옵션을 넘기면 `dims`가 `[1, 토큰수, 384]`(문장
길이마다 벡터 개수가 달라짐)로 나오고, `extractor()` 호출 시 넘기면 `dims`가 `[1, 384]`(문장
전체가 고정 길이 벡터 하나로 압축됨)로 나옴. 문장마다 길이가 다른 텍스트를 비교하려면
후자가 필수 — 전자로 하면 코사인 유사도 계산에서 벡터 길이가 안 맞아 깨진다.

### `Tensor.data`는 dims와 무관하게 항상 flat — `Array.from(tensor)` ≠ `Array.from(tensor.data)`
ONNX 계열 Tensor는 내부적으로 **1차원 flat 버퍼(`data`, TypedArray) + shape 메타데이터(`dims`)**
조합으로 구현됨. `dims`가 `[1, 384]`든 `[1, 5, 384]`든 `.data`는 항상 이미 펼쳐진 배열이라
`Array.from(tensor.data)` 한 번이면 원하는 `number[]`가 바로 나온다 — 별도 reshape/flatten 불필요.

반면 `Array.from(tensor)`(Tensor 객체 자체에 적용)는 다름. Tensor는 반복 가능하게 구현돼
있는데 **가장 바깥(배치) 차원만 반복**하므로, `dims: [1, 384]`인 Tensor를 `Array.from()`하면
숫자 384개가 아니라 **"384짜리 하위 Tensor 객체가 하나 든 배열"**(length 1)이 나온다. 반드시
`.data`를 거쳐야 진짜 숫자 배열이 됨.

### JS엔 numpy식 row/column vector·reshape 개념이 없음
numpy에서 벡터 방향(행/열)이 중요한 이유는 `@`/`np.dot`이 **행렬곱 규칙**(m×n · n×p)을 따르기
때문. 반면 `cosineSimilarity`는 인덱스를 하나씩 도는 순수 elementwise 연산(`reduce`)이라
애초에 "방향"이라는 개념 자체가 없다 — 그냥 길이가 같은 `number[]` 두 개면 충분함.
실제로 이 프로젝트가 쓰는 `@xenova/transformers` v2.17.2의 Tensor 클래스엔 `.reshape()` 메서드
자체가 없다는 것도 실측으로 확인됨(`typeof tensor.reshape === "undefined"`).

### `env.cacheDir` 기본값은 `node_modules` 안 — CI 캐싱하려면 명시적으로 옮겨야 함
기본 캐시 경로가 `node_modules/@xenova/transformers/.cache/`라서(패키지 자신의 `__dirname`
기준), `npm install`로 `node_modules`가 재설치되면 다운로드해둔 모델도 함께 사라진다.

```js
// src/relevance/embed.js:1-10
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline, env } from "@xenova/transformers";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
env.cacheDir = path.join(__dirname, "..", "..", ".cache", "transformers");
```

GitHub Actions `actions/cache`로 안정적으로 캐싱하려면 프로젝트 내 고정 경로로 `env.cacheDir`을
먼저 옮겨두고 그 경로를 캐시 대상으로 잡아야 함(`.github/workflows/collect.yml` 참고).
