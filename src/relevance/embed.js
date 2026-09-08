import path from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline, env } from "@xenova/transformers";

// 기본 캐시 경로(node_modules/@xenova/transformers/.cache/)는 npm install로
// node_modules가 재설치되면 함께 사라져 CI 캐싱이 불안정해진다 — 프로젝트 내 고정 경로로
// 명시적으로 옮겨서 .github/workflows/collect.yml의 actions/cache가 이 경로를 캐싱하게 한다
// (docs/adr/0008 참고).
const __dirname = path.dirname(fileURLToPath(import.meta.url));
env.cacheDir = path.join(__dirname, "..", "..", ".cache", "transformers");

// TODO(human): embed(text) 구현
//
// 1. 모델은 한 번만 로드해야 한다(수십 MB짜리 가중치를 매 호출마다 새로 불러오면 안 됨).
//    모듈 레벨 변수에 pipeline() 호출의 Promise를 캐싱해두고, 이미 있으면 재사용해라.
//    (pipeline("feature-extraction", "Xenova/paraphrase-multilingual-MiniLM-L12-v2")는
//    두 번째 인자로 모델 이름을 받는 비동기 함수다.)

// 아래 로직의 문제: promise.all()로 두개가 동시에 오면, A는 false여서 모델 생성할거고, await떄문에 실행권이 B로 넘어갈텐데, 이떄 B도 아직은 false라 모델이 두번 호출됨.
// let alreadyCalled = false;
// if(!alreadyCalled){
//     alreadyCalled = true;
//     extractor = await pipeline("feature-extraction", "Xenova/paraphrase-multilingual-MiniLM-L12-v2");
// }

// Nodejs design pattern에서 배운 lazy promise !!!!!!
let extractorPromise;

export async function embed(text) {
  if (!extractorPromise) {
    extractorPromise = pipeline(
      "feature-extraction",
      "Xenova/paraphrase-multilingual-MiniLM-L12-v2",
    );
  }
  const extractor = await extractorPromise;
  const tensorObj = await extractor(text, { pooling: "mean", normalize: true }); // normalize : true로 벡터의 길이가 유사도 계산에 영향 못미치게함. 
  const flat_number = Array.from(tensorObj.data);

  return flat_number;
}
// 2. 로드한 extractor를 text에 적용하면 임베딩을 담은 tensor 형태 객체가 나온다.
//    이 객체를 콘솔에 한번 찍어보고 실제로 어떤 shape/필드를 가졌는지 확인해봐 —
//    cosineSimilarity가 기대하는 "숫자 배열"로 바꾸려면 어떤 필드를 꺼내야 할지 보일 거다.
//    pipeline 호출 시 옵션으로 { pooling: "mean", normalize: true }를 넘기면
//    문장 전체를 하나의 고정 길이 벡터로 압축해준다(옵션 없이 호출하면 무슨 일이 일어나는지도
//    비교해보면 좋다).

// 3. 최종적으로 cosineSimilarity(a, b)에 그대로 넣을 수 있는 number[]를 반환해야 한다.
