import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sites } from "../src/sites.js";
import { parseKnuHome } from "../src/parsers/knuHome.js";
import { fetchStaticText } from "../src/fetchers.js";

/*
 * knuHome 파서의 id 체계를 href 해시 -> mv_data 안의 idx로 바꾸면서 필요한 1회성 스크립트.
 * knuHome 파서를 쓰는 사이트들은 data/seen.json에 예전 해시 id로 기록돼 있어서, 그대로 두면
 * 다음 collect.js 실행에서 지금 페이지에 있는 글 전체가 "새 글"로 노션에 다시 올라간다.
 * 이를 막기 위해 지금 페이지를 새 파서로 한 번 긁어서 나온 id를 기존 목록에 합쳐(union) 둔다.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STORE_PATH = path.join(__dirname, "..", "data", "seen.json");

async function main() {
  const raw = await fs.readFile(STORE_PATH, "utf-8");
  const store = JSON.parse(raw);

  const targets = sites.filter((site) => site.parser === "knuHome");

  for (const site of targets) {
    const before = new Set(store[site.id] ?? []);
    const html = await fetchStaticText(site);
    const items = parseKnuHome(html, site.url);
    const newIds = items.map((item) => item.id).filter((id) => !before.has(id));

    store[site.id] = [...before, ...newIds];
    console.log(`[${site.name}] 현재 글 ${items.length}건 중 ${newIds.length}건을 기존 목록에 백필`);
  }

  await fs.writeFile(STORE_PATH, JSON.stringify(store, null, 2), "utf-8");
  console.log("data/seen.json 저장 완료");
}

main();
