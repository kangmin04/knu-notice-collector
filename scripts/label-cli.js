import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LABELS_PATH = path.join(__dirname, "..", "data", "labels.json");

async function loadLabels() {
  const raw = await fs.readFile(LABELS_PATH, "utf-8");
  return JSON.parse(raw);
}

async function saveLabels(labels) {
  await fs.writeFile(LABELS_PATH, JSON.stringify(labels, null, 2), "utf-8");
}

async function main() {
  const labels = await loadLabels();
  const unlabeledIndexes = labels
    .map((entry, i) => (entry.label === null ? i : -1))
    .filter((i) => i !== -1);

  if (unlabeledIndexes.length === 0) {
    console.log("라벨링할 항목이 없습니다.");
    return;
  }

  const rl = readline.createInterface({ input, output });
  let quit = false;

  // Ctrl+C로 중단해도 그때까지 답한 것들은 이미 매번 저장돼 있으니 안내만 하고 종료한다.
  rl.on("SIGINT", () => {
    console.log("\n중단됨 — 지금까지 답한 내용은 이미 저장되어 있습니다.");
    rl.close();
    process.exit(0);
  });

  /*  되돌리기 로직 추가하려면 for of에선 불가함. 
    내 첫 생각은 for of 내애서 뒤로가기가 눌러지면 idx를 하나 decrease하고 continue로 label 저장안하면 될거라 생각했는데
    생각해보니 결국 for of면 다음 for iteration에선 항상 올라감 
    즉, while 문으로 수정해야함 ! 
    while이면 i의 증감을 우리가 설정 ㄱㄴ, 
  */

  for (const [progress, idx] of unlabeledIndexes.entries()) {
    const item = labels[idx];
    console.log(`\n[${progress + 1}/${unlabeledIndexes.length}]`);
    console.log(`제목: ${item.title}`);
    console.log(`URL:  ${item.url}`);

    const raw = await rl.question("관련 있음(y) / 없음(n) / 건너뛰기(엔터) / 종료(q): ");
    const answer = raw.trim().toLowerCase();

    if (answer === "q") {
      quit = true;
      break;
    }
    if (answer === "y") {
      labels[idx].label = true;
    } else if (answer === "n") {
      labels[idx].label = false;
    }
    // 그 외 입력(빈 값 등)은 건너뛰고 label을 null로 남겨둠 

    await saveLabels(labels); // 매 응답마다 저장 — 중간에 종료돼도 진행 상황이 보존
  }

  rl.close();

  const trueCount = labels.filter((entry) => entry.label === true).length;
  const falseCount = labels.filter((entry) => entry.label === false).length;
  const remaining = labels.filter((entry) => entry.label === null).length;
  console.log(
    `\n${quit ? "종료" : "완료"} — 관련 있음: ${trueCount}건, 무관: ${falseCount}건, 미라벨: ${remaining}건`,
  );
}

main();
