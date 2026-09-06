# Notion API — databases vs dataSources (2025 스키마 변경)

## 2026-09-05 — knu-notice-collector `scripts/export-labels-from-notion.js`(`@notionhq/client` v5.26.0) 구현 중 정리

### `databases.query()`는 이제 없음 — `dataSources.query()`로 바뀜
Notion API가 2025년에 데이터베이스 아래 **data source 계층**을 도입(하나의 데이터베이스가
여러 data source를 가질 수 있게 됨)하면서, SDK v5의 `Client`에서 `databases`엔
`retrieve`/`create`/`update`만 남고 `query`는 `dataSources`로 옮겨감. 공식 문서/블로그의 예전
예제(`notion.databases.query({ database_id })`)를 그대로 쓰면 해당 메서드 자체가 없어 에러남.

### `retrieve`와 `query`는 하는 일이 완전히 다름
`databases.retrieve()`는 **메타데이터**(이름, id, 어떤 data source들로 구성됐는지)만 주고
`results` 필드 자체가 없음 — 실제 행(페이지) 데이터는 `dataSources.query()`라야 나옴. SQL로
치면 `DESCRIBE TABLE` vs `SELECT * FROM table`에 가까움.

```js
// scripts/export-labels-from-notion.js:29-36
async function fetchLabelCandidates() {
  const database = await notion.databases.retrieve({ database_id: FEED_DATABASE_ID });
  const dataSourceId = database.data_sources[0].id;

  // collectPaginatedAPI가 has_more/next_cursor 루프를 대신 처리해 전체 결과 줌,
  const pages = await collectPaginatedAPI(notion.dataSources.query, {
    data_source_id: dataSourceId,
  });
  // ...
}
```

### 함정: `retrieve()` 응답의 `.id`는 "자기 자신"(database)의 id — data_source_id가 아님
`databases.retrieve({ database_id })`가 돌려주는 객체의 최상위 `.id`는 요청으로 넘긴
`database_id`를 그대로 되돌려준 것(대시 포맷만 붙음)일 뿐, `dataSources.query()`가 요구하는
`data_source_id`가 아니다. 진짜 필요한 값은 그 객체 **안**의 `data_sources` 배열
(`{ id, name }[]`, 단일 data source 데이터베이스면 `[0]`)에 있음.

둘 다 똑같이 생긴 UUID라 타입 에러도 안 나고 눈으로 봐도 구분이 안 되는 게 특히 함정 —
실제로 `database.id`를 `data_source_id`로 넘겨서 호출해보면 `object_not_found` 에러가 남:

```
Could not find data_source with ID: 22aeaa39-...-9c84-513ecb611ed9.
Make sure the relevant pages and databases are shared with your integration
```

이런 "형식은 유효하지만 의미상 잘못된 값" 버그는 값을 실제로 API에 넣어 응답을 보는 것 외엔
확실한 검증 방법이 없다 — TypeScript를 써도 둘 다 같은 `IdResponse` 타입이라 컴파일러가
못 잡아준다.

### 페이지 안의 title/URL 속성 경로
`dataSources.query()`가 돌려주는 각 페이지 객체엔 최상위 `title` 필드가 없다. 실제 값은
`properties.<데이터베이스에서 정의한 프로퍼티 이름>` 아래에 있고, title 타입 프로퍼티는
배열이라 `[0].plain_text`까지 꺼내야 함. 이 이름(`제목`, `URL` 등)은 페이지를 만들 때 쓴
이름과 정확히 일치해야 하므로, 생성 코드(`src/notion.js`의 `addFeedItem`)를 먼저 확인해야
알 수 있다.

```js
// scripts/export-labels-from-notion.js:42-46
return recentPages.map((page) => ({
  id: page.id,
  title: page.properties.제목.title[0]?.plain_text ?? "",
  url: page.properties.URL.url,
}));
```

### `collectPaginatedAPI` / `iteratePaginatedAPI`로 페이지네이션 자동화
`has_more`/`next_cursor` 루프를 직접 짜는 대신, SDK가 제공하는 유틸리티에 "페이지네이션되는
메서드"와 "첫 호출에 넘길 인자"만 주면 알아서 전체 결과를 모아준다(`collectPaginatedAPI`,
메모리에 다 올려도 되는 규모일 때) 또는 async iterator로 하나씩(`iteratePaginatedAPI`).
