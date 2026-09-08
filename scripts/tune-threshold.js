import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { scoreTitle } from "../src/relevance/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LABELS_PATH = path.join(__dirname, "..", "data", "labels.json");
const THRESHOLD_STEPS = 40;

/*
 * 이 파일 전체 흐름: data/labels.json(사람이 참/거짓으로 직접 매긴 라벨)을 읽어, 각 제목을
 * scoreTitle()로 임베딩 margin 점수로 바꾼 뒤, 후보 threshold 41개를 스윕하며 각각의
 * precision/recall/F1/F0.5를 계산해 표로 출력하고, F0.5가 가장 높은 threshold를 추천한다.
 * 이 스크립트 자체는 .env를 자동으로 고치지 않음 — 추천값은 사람이 보고 직접 반영해야 함.
 */

// F-beta 점수: precision과 recall의 가중 조화평균(harmonic mean).
// beta가 1보다 작으면(예: 0.5) precision에 더 큰 가중치, beta가 1보다 크면 recall에 더 큰 가중치.
// beta를 0에 가깝게 보내면 이 식은 precision 값으로 수렴하고, beta를 아주 크게 보내면 recall로
// 수렴함(분자/분모를 beta^2으로 나눠보면, beta가 커질수록 recall 항만 남는 형태가 되는 걸 확인 가능).
function fBeta(precision, recall, beta) {
  if (precision + recall === 0) return 0;
  const beta2 = beta * beta;
  return ((1 + beta2) * precision * recall) / (beta2 * precision + recall);
}

// 후보 threshold 하나를 놓고, 라벨링된 전체 항목에 대해 confusion matrix(TP/FP/FN/TN)를 세고
// precision/recall/F1/F0.5를 계산한다. 여기서 "positive"는 "관련 있는 공지"를 뜻함.
function evaluate(scored, threshold) {
  let tp = 0; // True Positive: 실제 관련 있음 + 필터도 관련 있다고 예측 (제대로 잡음)
  let fp = 0; // False Positive: 실제 무관 + 필터는 관련 있다고 오판 (노이즈 — precision을 깎음)
  let fn = 0; // False Negative: 실제 관련 있음 + 필터는 무관하다고 오판 (놓침 — recall을 깎음)
  let tn = 0; // True Negative: 실제 무관 + 필터도 무관하다고 예측 (제대로 걸러냄)
  for (const item of scored) {
    const predicted = item.score >= threshold;
    if (predicted && item.label) tp++;
    else if (predicted && !item.label) fp++;
    else if (!predicted && item.label) fn++;
    else tn++;
  }
  // precision = "관련 있다고 예측한 것 중 실제로 맞은 비율" = TP/(TP+FP) — 필터를 얼마나 믿을 수 있는가
  const precision = tp + fp === 0 ? 0 : tp / (tp + fp);
  // recall = "실제 관련 있는 것 중 필터가 잡아낸 비율" = TP/(TP+FN) — 얼마나 안 놓치는가
  const recall = tp + fn === 0 ? 0 : tp / (tp + fn);
  return {
    threshold,
    tp,
    fp,
    fn,
    tn,
    precision,
    recall,
    f1: fBeta(precision, recall, 1),
    f05: fBeta(precision, recall, 0.5), // precision을 더 우대하는 F-score (계획 §5)
  };
}

async function main() {
  // 1. 라벨 로드 — label이 null인(아직 안 매긴) 항목은 평가 대상에서 제외
  const raw = await fs.readFile(LABELS_PATH, "utf-8");
  const labels = JSON.parse(raw).filter((entry) => entry.label !== null);

  if (labels.length === 0) {
    console.error("라벨링된 항목이 없습니다. npm run label로 먼저 라벨링해주세요.");
    process.exit(1);
  }

  // 2. 라벨링된 제목마다 scoreTitle()(임베딩 + 프로토타입 margin 계산)을 호출해 점수를 매김.
  //    for...of + await라 한 건씩 순차 실행됨(병렬 아님) — 항목 수만큼 시간이 걸리는 이유.
  console.log(`${labels.length}건의 margin을 계산합니다...`);

  const scored = await Promise.all(
    labels.map(async (entry) => ({
      title: entry.title,
      label: entry.label,
      score: await scoreTitle(entry.title),
    }))
  )
  // const scored = [];
  // for (const [i, entry] of labels.entries()) { // 각 제목마다. 
  //   const score = await scoreTitle(entry.title);
  //   scored.push({ title: entry.title, label: entry.label, score });
    // if ((i + 1) % 50 === 0 || i === labels.length - 1) {
    //   console.log(`  ${i + 1}/${labels.length}`);
    // }
  //}

  // 3. threshold 후보 생성 — 0~1 같은 고정 범위가 아니라, 실제 관측된 점수의 최소~최대 구간을
  //    41등분(THRESHOLD_STEPS=40 간격)해서 만듦. margin 값의 실제 분포 구간 안에서만 후보를
  //    뽑아야 무의미한 threshold(항상 전부 통과/전부 차단)를 줄이고 탐색이 촘촘해짐.
  const scores = scored.map((item) => item.score);
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const thresholds = Array.from(
    { length: THRESHOLD_STEPS + 1 },
    (_, i) => min + ((max - min) * i) / THRESHOLD_STEPS,
  );
  // 4. 후보 threshold마다 evaluate()로 confusion matrix/precision/recall/F1/F0.5를 계산
  const rows = thresholds.map((threshold) => evaluate(scored, threshold));

  // 5. 결과를 표로 출력 — threshold가 커질수록(더 엄격) 보통 precision↑ recall↓ 경향을 보임
  console.log("\nthreshold | precision | recall | F1    | F0.5  | TP  FP  FN  TN");
  for (const row of rows) {
    console.log(
      `${row.threshold.toFixed(4).padStart(9)} | ` +
        `${row.precision.toFixed(3).padStart(9)} | ` +
        `${row.recall.toFixed(3).padStart(6)} | ` +
        `${row.f1.toFixed(3)} | ${row.f05.toFixed(3)} | ` +
        `${String(row.tp).padStart(2)}  ${String(row.fp).padStart(2)}  ${String(row.fn).padStart(2)}  ${String(row.tn).padStart(2)}`,
    );
  }

  // 6. "무관한 글이 섞이는 게 싫다"는 원래 동기(계획 §5) — precision을 우선하는 F0.5가 가장
  //    높은 threshold를 추천. 이 스크립트는 .env를 직접 고치지 않으니, 아래 안내대로 사람이
  //    RELEVANCE_THRESHOLD 값을 수동으로 반영해야 함.
  const best = rows.reduce((a, b) => (b.f05 > a.f05 ? b : a));
  console.log(
    `\n추천 threshold (F0.5 기준): ${best.threshold.toFixed(4)}` +
      `  (precision=${best.precision.toFixed(3)}, recall=${best.recall.toFixed(3)})`,
  );
  console.log("이 값을 .env의 RELEVANCE_THRESHOLD에 반영하세요.");
}

main();
