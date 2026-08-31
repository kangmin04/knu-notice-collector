# 0002 — 동적(SPA) 사이트 렌더링에 Playwright 사용

## 상태
승인됨

## 맥락
이벤터스, 데이콘, 캠퍼스픽, 슥삭 등은 목록이 클라이언트 JS(React/Vue/Next.js CSR)로만 렌더링되어 정적 `fetch`로는 목록을 얻을 수 없다. 헤드리스 브라우저로 실제 페이지를 렌더링한 뒤 완성된 DOM을 읽어야 한다. 후보는 Playwright와 Puppeteer.

## 결정
Playwright(Chromium만 설치)를 채택한다.

## 근거
- GitHub Actions `ubuntu-latest`에서 `npx playwright install --with-deps chromium` 한 줄로 필요한 OS 공유 라이브러리(apt 패키지)까지 공식적으로 설치해주는 경로가 잘 문서화되어 있다.
- `chromium`만 지정하면 webkit/firefox 바이너리를 받지 않아 설치 용량·시간을 최소화할 수 있다.
- Puppeteer는 최근 Chrome for Testing 다운로드 호스트 변경으로 CI 설치가 종종 깨지는 사례가 보고됐고, Playwright 쪽이 `actions/cache`로 브라우저 바이너리를 캐싱하는 패턴이 더 표준화되어 있다.

## 결과
- `playwright` 의존성 추가로 CI 실행 시간이 늘어난다 — 브라우저 바이너리 캐시(`~/.cache/ms-playwright`)로 완화한다([[0004-fetch-parse-separation]]의 `src/browser.js` 설계 참고).
- 브라우저 인스턴스는 전체 실행에서 1개만 띄우고 사이트마다 새 `BrowserContext`만 생성/종료해 리소스를 아낀다.
- Cloudflare 챌린지로 차단되는 사이트(로켓펀치)는 Playwright로도 우회하지 않는다 — 스코프 밖([[../PRD]] 제외 목록 참고).
- 실제로는 이벤터스(IT/프로그래밍 카테고리 검색 결과 페이지)와 데이콘(`/competitions`)에만 적용했다. 두 사이트 모두 `waitForSelector`로 실제 목록 앵커가 등장할 때까지 기다린 뒤 cheerio로 파싱하며, 로컬 실행 기준 사이트당 3~5초 정도의 렌더링 지연이 추가됐다. 캠퍼스픽·슥삭·원티드·프로그래머스는 이번 범위에서 보류했다.
