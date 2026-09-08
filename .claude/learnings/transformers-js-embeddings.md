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

## 2026-09-08 — "문장 벡터 실험실" 대화에서 정리한 self-attention/코사인 유사도 원리

### 파이프라인 개념: 토큰화 → self-attention → mean pooling → normalize
`embed.js:29-41`(위 섹션 코드 참고)이 실제로 하는 일을 개념 단계로 풀면 4단계임.

1. **토큰화**: 문장을 단어 조각(subword)으로 쪼갬. 예: `"2025 대구 AI 해커톤 참가팀 모집"`
   → `["2025", "대구", "AI", "해커톤", "참가팀", "모집"]` 유사 토큰들.
2. **self-attention**: 각 토큰이 **같은 문장 안 다른 토큰을 얼마나 참고할지** 가중치를 계산해서,
   토큰마다 "문맥이 반영된" 벡터를 만듦. "해커톤" 토큰은 "AI", "참가팀"과의 가중치가 높게 형성돼
   그 벡터에 "IT 채용성 이벤트"라는 의미가 스며듦 — **같은 단어라도 문장이 다르면 벡터가 달라지는
   이유**가 바로 이 단계 때문(정적 임베딩과의 핵심 차이 — 아래 "더 근본적인 원리 1" 참고).
3. **mean pooling** (`{ pooling: "mean" }`): 토큰마다 하나씩 나온 벡터를 **차원별 평균**내서 문장
   전체를 벡터 하나로 압축. 토큰이 6개든 20개든 결과는 항상 같은 길이(이 모델은 384차원).
4. **normalize** (`{ normalize: true }`): 벡터 길이(norm)를 1로 맞춤 — 아래 "코사인 유사도" 절 참고.

관련성 필터가 실제로 비교하는 예시(`src/relevance/prototypes.js`의 프로토타입과 비교):
- 기준 문장: `"백엔드 개발 경험을 쌓을 수 있는 대외활동을 찾고 있다"`
- 공지 A(관련 있음): `"2025 대구 AI 해커톤 참가팀 모집 — 백엔드/AI 개발자 우대"` — 겹치는 단어는
  "백엔드" 하나뿐이지만 의미 벡터 방향은 가까움
- 공지 B(관련 없음): `"2025학년도 2학기 국제처 교환학생 파견 신청 안내"` — 오히려 "2025"가
  겹치지만 의미 벡터 방향은 멂

키워드 매칭(TF-IDF 등)으로는 공지 B가 더 관련 있어 보이는 역전이 일어나는데, transformer
임베딩은 "단어의 겉모습"이 아니라 "의미"를 벡터 방향으로 비교하므로 이 역전이 안 일어남.

### 코사인 유사도는 스케일 불변 — `normalize: true`가 정답 자체를 바꾸진 않음
`cosineSimilarity()`는 분모에서 각 벡터를 자기 norm으로 나누기 때문에, 입력 벡터를 미리
정규화했든 안 했든 **수학적으로 결과가 동일**함.

```js
// src/relevance/similarity.js:11-20
const innerProduct = a.reduce((sum, ai, i) => sum + ai * b[i], 0);
const norm_A = Math.sqrt(a.reduce((sumA, ai, _) => sumA + Math.pow(ai, 2), 0));
const norm_B = Math.sqrt(b.reduce((sumB, bi, _) => sumB + Math.pow(bi, 2), 0));
// ...
return innerProduct / (norm_A * norm_B);
```

이미 테스트로도 검증돼 있음:

```js
// src/relevance/similarity.test.js:18
assert.ok(Math.abs(cosineSimilarity([1, 2, 3], [2, 4, 6]) - 1) < 1e-9);
```

`[2,4,6]`은 `[1,2,3]`을 2배 늘린 것뿐(방향 동일)인데 유사도는 정확히 1.0 — **코사인 유사도는
정의상 벡터 크기(scale)에 무관**함(`a·b/(|a||b|)` = `(a/|a|)·(b/|b|)`와 동치이기 때문).

그럼에도 `embed.js`에서 `normalize: true`를 쓰는 게 여전히 맞는 실질적 이유:
- **방어적 설계**: 나중에 성능 때문에 `cosineSimilarity()`를 "이미 정규화됐으니까"라며 내적
  (dot product)만 계산하는 함수로 바꿔도, 저장 단계에서 이미 정규화해뒀으면 안전함. 반대로
  정규화 안 된 벡터를 저장해뒀다가 이런 최적화가 들어가면 에러 없이 숫자만 조용히 틀려짐 —
  발견하기 아주 어려운 버그가 됨.
- **벡터DB/ANN 라이브러리와의 관습 호환**: FAISS/HNSW 같은 라이브러리는 보통 "내적(inner
  product) 인덱스"를 쓰는데, 벡터가 이미 단위 길이라는 전제로 나눗셈/제곱근 계산을 생략하는
  최적화임. `normalize: true`는 SBERT 계열 모델의 표준 관습을 따른 것 — 지금은 프로토타입
  몇 개와만 비교(`src/relevance/index.js:24-29`)해서 이득이 없지만, 나중에 검색 방식을 바꿀 때
  재정규화 마이그레이션을 피하게 해줌.

### 더 근본적인 원리 1 — 왜 애초에 단어를 벡터로 표현할 수 있는가 (분포 가설)
언어학자 J.R. Firth의 "You shall know a word by the company it keeps"(단어는 함께 나타나는
단어로 알 수 있다) — **분포 가설(distributional hypothesis)**임. "해커톤"과 "공모전"은 같은
단어가 아니지만 둘 다 "참가", "모집", "팀", "시상" 같은 단어들과 자주 함께 나타남 → 이 "함께
나타나는 패턴"을 좌표로 옮기면 두 단어의 벡터가 가까워짐.

**정적 임베딩(word2vec, GloVe)**은 이 아이디어를 가장 단순하게 구현한 것 — 단어 하나당 벡터
하나를 학습해서 고정해둠. 문제는 "배 먹었다"의 "배"(과일)와 "배 아프다"의 "배"(신체)가
**문맥이 완전히 달라도 같은 벡터**를 갖게 됨(다의어 문제).

**Contextual 임베딩(BERT/transformer)**은 self-attention으로 이 문제를 품. 위 "파이프라인
2단계"에서 봤듯, 같은 토큰이라도 문장 속 다른 토큰들과의 관계에 따라 매번 다른 벡터가 나옴 —
"배"가 "먹었다"와 강하게 attention하면 과일 쪽 벡터로, "아프다"와 강하게 attention하면 신체
쪽 벡터로 움직임.

### 더 근본적인 원리 2 — self-attention의 Query/Key/Value를 직관적으로
self-attention은 각 토큰마다 세 가지 역할의 벡터를 만듦(모델이 학습한 가중치로 변환):
- **Query(질문)**: "나(이 토큰)는 지금 무엇을 찾고 있는가"
- **Key(색인)**: "나는 이런 정보를 갖고 있다"고 다른 토큰에게 알려주는 값
- **Value(내용물)**: 실제로 참고할 때 가져갈 내용

도서관 검색에 비유하면: Query는 내가 입력하는 검색어, Key는 각 책의 색인 태그, Value는 그
책의 실제 내용. "해커톤" 토큰의 Query가 "AI" 토큰의 Key와 잘 맞아떨어지면(내적값이 크면),
"AI" 토큰의 Value를 많이 끌어와 "해커톤" 자신의 벡터에 섞음 — 이게 "AI 해커톤" 전체의 의미가
"해커톤" 벡터 하나에 녹아드는 과정임. 인터랙티브 데모(문장 벡터 실험실, 아래 참고)에서 토큰을
클릭했을 때 나온 "가중치 %"가 바로 이 Query·Key 매칭 결과(softmax를 거쳐 합이 1이 되도록
정규화된 값)임.

### 더 근본적인 원리 3 — 왜 하필 코사인 유사도인가 (고차원에서는 "방향"이 의미를 담음)
저차원(2~3차원)에서는 벡터 크기(norm)도 어느 정도 의미 있는 정보일 수 있지만, 384차원 같은
고차원 공간에서는 사정이 다름:
- **크기(norm)는 주로 "얼마나 강하게/많이 활성화됐는가" 같은 잡음성 정보**를 담기 쉬움 —
  문장이 길거나 짧을 때 mean pooling 결과 벡터의 크기가 미묘하게 달라질 수 있는데, 이건
  "의미"와는 무관한 부수 효과임.
- **방향(각도)은 "어떤 의미 성분 조합을 얼마나 갖고 있는가"라는 상대적 비율 정보**를 담음 —
  384개 차원 각각이 학습 과정에서 저절로 형성된 어떤 의미 축이라고 생각하면, 두 벡터가 "같은
  방향"이라는 건 "같은 의미 축 조합을 같은 비율로 갖고 있다"는 뜻이 됨.
- 그래서 크기 차이를 무시하고 방향만 비교하는 코사인 유사도가, 유클리드 거리(크기까지 반영)
  보다 의미 비교에 더 안정적으로 잘 맞는다고 경험적으로 알려져 있음(SBERT가 채택한 이유).

### 참고
이 파이프라인/self-attention을 직접 클릭해보며 이해하는 인터랙티브 페이지를 만들어둠:
"문장 벡터 실험실" — https://claude.ai/code/artifact/7ef89204-1812-40f9-9a8b-3f4ec12b5c7c
(원형 토큰 배치에서 클릭 시 attention 가중치 시각화, mean pooling 평균 연산, 코사인 유사도
2D 각도 비교를 직접 조작 가능. attention 가중치는 실제 모델 출력이 아니라 개념 이해용 예시값).

Andrew Ng Coursera 강의 중 이 내용을 다루는 곳: 지금 듣는 Machine Learning Specialization은
다루지 않음. Deep Learning Specialization Course 5(Sequence Models) Week 3~4가 Andrew Ng이
직접 가르치는 attention/transformer 정식 강의고, 더 빠르게 감을 잡으려면 DeepLearning.AI
단기강좌 "Understanding and Applying Text Embeddings"·"How Transformer LLMs Work"가 이 파이프
라인을 거의 그대로 다룸.
