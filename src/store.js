import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STORE_PATH = path.join(__dirname, "..", "data", "seen.json");
const STORE_PATH_DELETE = path.join(__dirname, "..", "data", "delete-counts.json");

/* seen.json도 첫 시작이었다면 Json.parse에 빈 문자열이 가서 에러가 나왔을것 -> trim으로 파악해서 없으면 빈 객체 반환  
  catch(err)에서 syntaxerr이면 {} 리턴하는 건 "만약 실제로 프로세스 중단으로 데이터가 있는데 syntaxerr인경우에 기존의 데이터가 다 사라져버리는 대참사가 생김"!@
*/
export async function loadStore() {
  try {
    const raw = await fs.readFile(STORE_PATH, "utf-8");
    const trimmed = raw.trim();
    return { data: trimmed ? JSON.parse(trimmed) : {}, isFirstRun: false };
  } catch (err) {
    if (err.code === "ENOENT") return { data: {}, isFirstRun: true };
    throw err;
  }
}

export async function saveStore(data) {
  await fs.mkdir(path.dirname(STORE_PATH), { recursive: true });
  await fs.writeFile(STORE_PATH, JSON.stringify(data, null, 2), "utf-8");
}

//DELETE COUNTS 목적
export async function loadStoreDeleted() {
  try {
    const raw = await fs.readFile(STORE_PATH_DELETE, "utf-8");
    const trimmed = raw.trim();
    return { data: trimmed ? JSON.parse(trimmed) : {}, isFirstRun: false };
  } catch (err) {
    if (err.code === "ENOENT") {
      return { data: {}, isFirstRun: true };
    }

    throw err;
  }
}

export async function saveStoreDeleted(data) {
  await fs.mkdir(path.dirname(STORE_PATH_DELETE), { recursive: true });
  await fs.writeFile(STORE_PATH_DELETE, JSON.stringify(data, null, 2), "utf-8");
}
