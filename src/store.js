import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STORE_PATH = path.join(__dirname, "..", "data", "seen.json");

export async function loadStore() {
  try {
    const raw = await fs.readFile(STORE_PATH, "utf-8");
    return { data: JSON.parse(raw), isFirstRun: false };
  } catch (err) {
    if (err.code === "ENOENT") return { data: {}, isFirstRun: true };
    throw err;
  }
}

export async function saveStore(data) {
  await fs.mkdir(path.dirname(STORE_PATH), { recursive: true });
  await fs.writeFile(STORE_PATH, JSON.stringify(data, null, 2), "utf-8");
}
