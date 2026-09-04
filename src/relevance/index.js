import { embed } from "./embed.js";
import { cosineSimilarity } from "./similarity.js";
import { POSITIVE_PROTOTYPES, NEGATIVE_PROTOTYPES } from "./prototypes.js";

// 프로토타입 문장 임베딩은 요청마다 다시 계산할 필요가 없으므로, embed.js의 extractorPromise와
// 같은 lazy singleton 패턴으로 한 번만 계산해 재사용한다.
let prototypeEmbeddingsPromise;

function loadPrototypeEmbeddings() {
  if (!prototypeEmbeddingsPromise) {
    prototypeEmbeddingsPromise = Promise.all([
      Promise.all(POSITIVE_PROTOTYPES.map((sentence) => embed(sentence))),
      Promise.all(NEGATIVE_PROTOTYPES.map((sentence) => embed(sentence))),
    ]);
  }
  return prototypeEmbeddingsPromise;
}

// margin = maxPosSim - maxNegSim. 양수일수록 "관련 있음" 프로토타입에 더 가깝다는 뜻.
export async function scoreTitle(title) {
  const [positiveEmbeddings, negativeEmbeddings] = await loadPrototypeEmbeddings();
  const titleEmbedding = await embed(title);

  const maxPosSim = Math.max(
    ...positiveEmbeddings.map((prototype) => cosineSimilarity(titleEmbedding, prototype)),
  );
  const maxNegSim = Math.max(
    ...negativeEmbeddings.map((prototype) => cosineSimilarity(titleEmbedding, prototype)),
  );

  return maxPosSim - maxNegSim;
}

// RELEVANCE_FILTER_DISABLED=1이면 필터를 완전히 우회하고, 판단 중 예외(모델 로딩 실패 등)가
// 나면 fail-open으로 관련 글로 간주한다 — 필터 오류로 하루치 공지가 통째로 유실되는 걸 막기 위함
// (계획 §3).
export async function isRelevant(title) {
  if (process.env.RELEVANCE_FILTER_DISABLED === "1") {
    return { relevant: true, score: null };
  }

  try {
    const score = await scoreTitle(title);
    const threshold = Number(process.env.RELEVANCE_THRESHOLD ?? 0);
    return { relevant: score >= threshold, score };
  } catch (err) {
    console.warn(`[relevance] 판단 실패, fail-open으로 관련 글 처리: ${err.message}`);
    return { relevant: true, score: null };
  }
}
