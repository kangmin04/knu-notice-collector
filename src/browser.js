import { chromium } from "playwright";
import { DEFAULT_UA } from "./fetchers.js";

// 헤드리스 Chromium 인스턴스를 전체 실행에서 하나만 띄우고 재사용한다(지연 초기화).
// mode: "dynamic" 사이트가 하나도 없으면 이 모듈은 아예 import되지 않으므로
// Chromium도 실행되지 않는다(src/collect.js의 fetchSiteContent 참고).
let browserPromise = null;

function getBrowser() {
  return (browserPromise ??= chromium.launch({ headless: true }));
}

export async function closeBrowser() {
  if (!browserPromise) return;
  const browser = await browserPromise;
  await browser.close();
  browserPromise = null;
}

// mode: "dynamic" 사이트의 콘텐츠를 렌더링해서 완성된 HTML을 반환한다. 반환값은
// 정적 fetch와 동일하게 순수 HTML 문자열이므로, 이후 파서(src/parsers/*)는
// static/dynamic 여부를 몰라도 된다(docs/adr/0004-fetch-parse-separation.md 참고).
export async function fetchDynamicHtml(site) {
  const browser = await getBrowser();
  const context = await browser.newContext({ userAgent: site.userAgent ?? DEFAULT_UA });
  try {
    const page = await context.newPage();
    await page.goto(site.url, { waitUntil: "domcontentloaded", timeout: site.timeoutMs ?? 30000 });
    if (site.waitForSelector) {
      await page.waitForSelector(site.waitForSelector, { timeout: site.timeoutMs ?? 30000 });
    }
    // waitForSelector는 목록의 "첫" 항목이 뜨는 순간 통과한다 — 나머지 목록이 이어서
    // 렌더링될 시간을 벌기 위해 항상 추가 그레이스 타임을 둔다(실측: 이 텀이 없으면
    // 이벤터스에서 11건 중 1건만 잡히는 레이스 컨디션이 발생함).
    await page.waitForTimeout(2000);
    return await page.content();
  } finally {
    await context.close();
  }
}
