import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { scoreTitle } from "../src/relevance/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LABELS_PATH = path.join(__dirname, "..", "data", "labels.json");
const THRESHOLD_STEPS = 40;

function fBeta(precision, recall, beta) {
  if (precision + recall === 0) return 0;
  const beta2 = beta * beta;
  return ((1 + beta2) * precision * recall) / (beta2 * precision + recall);
}

function evaluate(scored, threshold) {
  let tp = 0;
  let fp = 0;
  let fn = 0;
  let tn = 0;
  for (const item of scored) {
    const predicted = item.score >= threshold;
    if (predicted && item.label) tp++;
    else if (predicted && !item.label) fp++;
    else if (!predicted && item.label) fn++;
    else tn++;
  }
  const precision = tp + fp === 0 ? 0 : tp / (tp + fp);
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
  const raw = await fs.readFile(LABELS_PATH, "utf-8");
  const labels = JSON.parse(raw).filter((entry) => entry.label !== null);

  if (labels.length === 0) {
    console.error("라벨링된 항목이 없습니다. npm run label로 먼저 라벨링해주세요.");
    process.exit(1);
  }

  console.log(`${labels.length}건의 margin을 계산합니다...`);
  const scored = [];
  for (const [i, entry] of labels.entries()) {
    const score = await scoreTitle(entry.title);
    scored.push({ title: entry.title, label: entry.label, score });
    if ((i + 1) % 50 === 0 || i === labels.length - 1) {
      console.log(`  ${i + 1}/${labels.length}`);
    }
  }

  const scores = scored.map((item) => item.score);
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const thresholds = Array.from(
    { length: THRESHOLD_STEPS + 1 },
    (_, i) => min + ((max - min) * i) / THRESHOLD_STEPS,
  );
  const rows = thresholds.map((threshold) => evaluate(scored, threshold));

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

  // "무관한 글이 섞이는 게 싫다"는 원래 동기(계획 §5) — precision을 우선하는 F0.5로 추천.
  const best = rows.reduce((a, b) => (b.f05 > a.f05 ? b : a));
  console.log(
    `\n추천 threshold (F0.5 기준): ${best.threshold.toFixed(4)}` +
      `  (precision=${best.precision.toFixed(3)}, recall=${best.recall.toFixed(3)})`,
  );
  console.log("이 값을 .env의 RELEVANCE_THRESHOLD에 반영하세요.");
}

main();
