# 0004 — 콘텐츠 가져오기와 파싱의 분리

## 상태
승인됨

## 맥락
정적 사이트는 `fetch`로, 동적(SPA) 사이트는 Playwright로 콘텐츠를 가져와야 한다([[0002-playwright-for-dynamic-sites]]). 이 둘을 파서 함수 안에서 분기하면 파서가 "어떻게 가져왔는지"와 "무엇을 추출하는지"를 동시에 알아야 해서 파서 수가 늘어날수록 복잡도가 커진다.

## 결정
"가져오기"(`src/fetchers.js`의 정적 fetch, `src/browser.js`의 Playwright 렌더링)와 "파싱"(`src/parsers/*`)을 완전히 분리한다. 동적 경로도 최종적으로 `page.content()`로 **완성된 HTML 문자열**을 반환하므로, 파서 함수는 항상 동일한 시그니처 `(text: string, baseUrl: string) => items[]`를 갖는다.

`src/collect.js`는 `site.mode`를 보고 `fetchSiteContent(site)`가 정적/동적 중 어느 경로를 탈지만 결정하고, 그 결과 문자열을 그대로 `parsers[site.parser](text, site.url)`에 넘긴다.

```js
async function fetchSiteContent(site) {
  return site.mode === "dynamic" ? fetchDynamicHtml(site) : fetchStaticText(site);
}
```

## 결과
- "동적 전용 파서"라는 별도 카테고리가 필요 없다 — 이벤터스를 예로 들면, 나중에 이 사이트가 SSR로 바뀌어 정적 파싱이 가능해지더라도 `sites.js`의 `mode`만 `"static"`으로 바꾸면 되고 파서는 그대로 재사용된다.
- `src/browser.js`의 브라우저 인스턴스는 동적 사이트가 하나도 없으면 아예 실행되지 않는 지연 초기화로 설계해, 정적 사이트만 있던 기존 흐름에 불필요한 오버헤드를 주지 않는다.
- `main()` 종료 시 `closeBrowser()`를 반드시 호출해야 Node 프로세스가 살아있는 헤드리스 브라우저 때문에 종료되지 않는 문제를 막을 수 있다 — 구현 시 유의.
