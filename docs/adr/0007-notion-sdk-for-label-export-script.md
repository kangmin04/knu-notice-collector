# 0007 — 라벨 export 스크립트에 한해 @notionhq/client SDK 사용

## 상태

승인됨

## 맥락

`scripts/export-labels-from-notion.js`는 노션 "새 글 피드" DB를 조회해 `data/labels.json`을 만드는 1회성/가끔 재실행하는 도구 스크립트다. 이 프로젝트는 지금까지 노션·사이트 API 호출을 전부 순정 `fetch()`로 직접 구현해왔다(`src/notion.js`의 `addFeedItem`, `src/fetchers.js`의 사이트 스크래핑 전체). 이 스크립트도 같은 방식으로 시작했으나, DB 조회는 결과가 100건을 넘으면 `has_more`/`next_cursor` 페이지네이션을 직접 구현해야 해서 공식 SDK(`@notionhq/client`)의 페이지네이션 헬퍼를 쓰는 쪽이 더 간단하다고 판단해 이 스크립트에서만 SDK로 전환했다.

## 결정

`scripts/export-labels-from-notion.js`에서만 `@notionhq/client`(devDependency)를 사용한다. 매일 도는 수집기 본체(`src/notion.js`의 `addFeedItem`, `src/fetchers.js`)는 기존 raw fetch 방식을 그대로 유지한다.

## 근거

- 이 스크립트는 `npm run collect`(GitHub Actions 매일 실행) 경로와 분리된 개발자 도구라, 여기서 의존성을 늘려도 수집기 본체의 실행 시간·안정성에는 영향이 없다. 그래서 `dependencies`가 아니라 `devDependencies`로 추가했다.
- 페이지네이션이 필수인 조회 작업엔 SDK의 `collectPaginatedAPI(listFn, firstPageArgs)` 헬퍼가 `has_more`/`next_cursor` 루프를 대신 처리해준다. 반면 `addFeedItem`은 페이지 1개를 생성하는 단순 POST 1회라 raw fetch로도 충분히 짧고 명확하다.
- 매일 도는 파이프라인(`src/notion.js`, `src/fetchers.js`)은 의존성을 최소로 유지하고 실제 요청/응답 구조가 코드에 그대로 드러나는 쪽을 우선한다는 기존 성향(`.claude/learnings/http-api-reverse-engineering.md` 참고)을 그대로 따르며, 이 스크립트만 예외로 둔다.

## 결과

- `package.json`의 `devDependencies`에 `@notionhq/client`(설치 시점 기준 v5.26.0)가 추가된다.
- **중요 — 버전 특이사항**: 이 버전의 SDK는 Notion API의 2025년 스키마 변경(데이터베이스 아래 "data source" 계층 도입, 하나의 데이터베이스가 여러 data source를 가질 수 있게 됨)을 반영해서 `notion.databases.query()`가 더 이상 존재하지 않는다(`databases`엔 `retrieve`/`create`/`update`만 있음). 대신:
  1. `notion.databases.retrieve({ database_id })`로 데이터베이스를 조회하고, 응답의 `data_sources[0].id`를 읽는다 (단일 data source인 일반적인 DB 기준).
  2. `notion.dataSources.query({ data_source_id })` (또는 `collectPaginatedAPI(notion.dataSources.query, { data_source_id })`)로 실제 행을 조회한다.

  공식 문서·블로그의 예전 예제가 보여주는 `notion.databases.query({ database_id })`를 이 버전에 그대로 쓰면 해당 메서드 자체가 없어 에러가 난다.
- 노션 API를 호출하는 코드가 프로젝트 안에 두 가지 방식(raw fetch / SDK)으로 공존한다. 향후 노션 관련 코드를 추가할 때 "매일 도는 파이프라인 경로"인지 "가끔 실행하는 도구 스크립트"인지로 어느 쪽을 쓸지 판단한다.
