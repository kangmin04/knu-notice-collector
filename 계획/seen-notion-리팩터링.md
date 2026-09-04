# seen.json / Notion 무한 누적 리팩터링

## Context

지금 두 가지가 끝없이 커지는 구조다:

1. **`data/seen.json`** — `src/collect.js:63-93`에서 사이트별 "본 글 id"를 `Set`에 계속 `add`만 하고 절대 지우지 않는다(`store.js`가 매번 파일 전체를 덮어쓰긴 하지만, 그 안에 담기는 배열 자체가 무한히 늘어남). 사이트를 몇 년 운영하면 seen.json이 계속 커진다.
2. **Notion "새 글 피드" DB** — `src/notion.js`는 페이지를 만들기만 하고(POST), 지우거나 정리하는 로직이 아예 없다.

대화 중 도출한 핵심 통찰: `src/parsers/*`는 항상 "그 사이트 게시판에 **지금** 렌더링된 항목 전체"만 가져오고(최신 N개를 골라내는 게 아니라 페이지에 보이는 것 전부), 개수 제한이 없다. 즉 어떤 id가 오늘 그 목록(B)에 없다는 건 "게시판에서 완전히 밀려났다"는 뜻이고, 그런 id는 다시는 "새 글"로 재등장할 일이 없으므로 seen에서 지워도 안전하다. 따라서 seen 값은 "누적 합집합"이 아니라 "오늘 긁어온 목록 그 자체"로 저장하면 충분하다 — 집합 연산으로 풀어보면 `(A∩B) ∪ (B\A) = B`이기 때문(A: 기존 seen, B: 오늘 파싱 결과).

단, 사이트 자체가 처음 등록됐을 때(`site.id in store` 체크, `collect.js:70`)와 "정상 사이트인데 오늘 파싱이 일부 실패해서 B가 비정상적으로 작아진 경우"를 반드시 구분해야 한다 — 후자를 구분 못 하면 파싱 결과가 줄어든 날 예전 글들이 전부 "새 글"로 오인되어 노션에 재작성된다.

Notion 쪽은 API 자체에 "삭제" 엔드포인트가 없고(`PATCH .../pages/{id}` `{archived:true}`로 휴지통 이동만 가능), "고정" 개념도 없어 체크박스 property를 직접 만들어야 한다. 또한 기존에 세팅하는 `발견일`(`src/notion.js:13`)은 `new Date().toISOString().slice(0, 10)`로 **날짜만** 저장해 시간 단위 계산이 불가능하므로, "24시간 경과" 판단은 Notion이 페이지마다 자동으로 갖고 있는 시스템 타임스탬프 `created_time`을 필터 기준으로 써야 한다.

## 결정된 설계

### 1. seen.json: 누적 → "오늘자 스냅샷"으로 교체 + 부분실패 가드
- 대상: `src/collect.js` (약 50~104번째 줄)
- `newItems` 판단은 지금처럼 기존 `store[site.id]` 기반 `Set`으로 계산(그대로 유지).
- 저장 로직만 변경: `seenIds.add(item.id)` 누적 루프(79-91줄) + `store[site.id] = Array.from(seenIds)`(93줄)를 없애고, 루프 종료 후 `store[site.id] = items.map((item) => item.id);`로 **오늘 파싱된 목록 전체로 치환**. 게시판에서 밀려난 id는 자연스럽게 빠지므로 배열 길이가 "그 사이트 게시판 1페이지 분량" 선에서 안정된다.
- 부분실패 가드 (직전 저장값 대비 50% 이상 감소 시 의심으로 확정):
  - `siteIsFirstRun`이 아닌 경우에 한해 `items.length < (store[site.id]?.length ?? 0) * 0.5`이면 의심 신호로 취급.
  - 기존 55-60줄의 "0건 파싱" 처리와 이 신규 체크를 합쳐, 둘 중 하나라도 걸리면: 한 번 재시도(fetch+parse 재실행) → 그래도 의심스러우면 `console.error`로 남기고 `continue`(해당 사이트는 이번 실행에서 `store[site.id]`를 건드리지 않고 건너뜀, 새 글도 올리지 않음). 다음날 정상화되면 자연히 다시 비교됨.
  - 새 로그 파일(`error.log`)은 만들지 않는다 — 기존 코드가 전부 `console.error`/`console.warn`으로 실패를 남기고(44, 56-58, 102줄) GitHub Actions 실행 로그에 그대로 남는 기존 관례를 따른다.
- `siteIsFirstRun`(70-75줄, `!(site.id in store)`) 로직은 그대로 둔다 — 이 "키 존재 여부" 체크가 있기 때문에 "사이트를 통째로 처음 본다"와 "사이트는 계속 있었는데 배열만 줄어들었다"를 구분할 수 있다. seen.json 전체를 비우는 방식이 아니라 사이트별 배열 값만 스냅샷으로 교체하는 이유가 여기 있다.

### 2. Notion: 고정 체크박스 + `created_time` 기준 자동 archive
- 수동 1회 설정(코드 아님): "새 글 피드" DB에 체크박스 property `고정` 추가 (Notion UI에서 직접).
- `src/notion.js`에 `addFeedItem` 옆에 신규 함수 `archiveStaleItems({ notionToken, databaseId, olderThanMs })` 추가:
  - `POST https://api.notion.com/v1/databases/{databaseId}/query` — filter: `고정` checkbox `equals: false` AND 시스템 타임스탬프 필터 `{ timestamp: "created_time", created_time: { before: <now - olderThanMs의 ISO 문자열> } }`.
  - `next_cursor`/`has_more`로 페이지네이션.
  - 결과로 나온 각 페이지에 대해 `PATCH https://api.notion.com/v1/pages/{page_id}` body `{ archived: true }` 호출.
  - archive된 개수를 반환.
  - `발견일`(날짜만 있는 property)이 아니라 시스템 `created_time`을 필터 기준으로 쓴다 — 시:분:초까지 정확히 비교 가능한 유일한 값이기 때문.
- `src/collect.js`의 `main()` 안, 사이트 순회 루프가 끝난 뒤(104~110줄 근처)에 `archiveStaleItems({ ..., olderThanMs: 24 * 60 * 60 * 1000 })` 호출을 추가. 기존 `DRY_RUN` 관례(80-91, 113-117줄)를 그대로 따라 `DRY_RUN=1`이면 실제 archive 호출 대신 "archive 대상 N건" 로그만 남긴다.

## 건드리지 않는 것
- `src/store.js`의 `loadStore`/`saveStore` — 이미 범용적인 시그니처라 변경 불필요.
- 전체 seen.json을 한 번에 비우는 방식은 채택하지 않음 (그 경우 모든 사이트가 "첫 실행"으로 오인되어, 아직 노션에 못 올라간 진짜 새 글이 조용히 baseline으로 흡수되어 영원히 유실됨).

## 대상 파일
- `src/collect.js` — seen 저장 로직 교체, 부분실패 가드 추가, archiveStaleItems 호출 연결
- `src/notion.js` — `archiveStaleItems` 신규 함수 추가
- Notion "새 글 피드" DB — `고정` 체크박스 property 수동 추가 (코드 변경 아님)

## 검증 방법
1. `DRY_RUN=1 node src/collect.js` 로컬 실행 — 기존처럼 "새 글 N건"/"초기화 완료" 로그가 정상 출력되고, 추가로 "archive 대상 N건(DRY_RUN)" 같은 로그가 찍히는지 확인.
2. 이틀 연속 실제 실행 후 `data/seen.json`에서 특정 사이트 배열 길이가 무한히 늘지 않고 그 사이트 게시판 페이지 크기 선에서 유지되는지 확인.
3. Notion 테스트 페이지 몇 개에 `고정` 체크 후, 나머지는 그대로 둔 채 실제 실행 — 24시간 지난 미고정 페이지만 archive(휴지통 이동)되고 고정된 페이지는 남아있는지 Notion에서 직접 확인.
4. `npm run lint` — 기존 ESLint 규칙 통과 확인.
