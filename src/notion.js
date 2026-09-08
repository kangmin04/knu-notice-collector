const NOTION_API = "https://api.notion.com/v1/pages";
const NOTION_DATABASES_API = "https://api.notion.com/v1/databases";
const NOTION_VERSION = "2022-06-28";

export async function addFeedItem({ site, item, notionToken, databaseId, relevant }) {
  const body = {
    parent: { database_id: databaseId },
    properties: {
      제목: { title: [{ text: { content: item.title.slice(0, 2000) } }] },
      URL: { url: item.url },
      사이트: { rich_text: [{ text: { content: site.name } }] },
      카테고리: { multi_select: site.category.map((name) => ({ name })) },
      대상: { select: { name: site.target } },
      발견일: { date: { start: new Date().toISOString().slice(0, 10) } },
      "IT 관련": { checkbox: relevant },
    },
  };

  const res = await fetch(NOTION_API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${notionToken}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Notion API ${res.status}: ${errBody}`);
  }
}

// "IT 관련" 체크박스가 false이고, 생성된 지 olderThanMs 이상 지난 페이지를 전부 찾는다.
// `발견일`은 날짜만 저장돼 있어 시간 단위 비교가 불가능하므로, 필터 기준은 Notion이
// 페이지마다 자동으로 갖고 있는 시스템 타임스탬프 created_time을 쓴다.
export async function queryStaleUnrelatedItems({ notionToken, databaseId, olderThanMs }) {
  const before = new Date(Date.now() - olderThanMs).toISOString();
  const results = [];
  let cursor;

  do {
    const res = await fetch(`${NOTION_DATABASES_API}/${databaseId}/query`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${notionToken}`,
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        filter: {
          and: [
            { property: "IT 관련", checkbox: { equals: false } },
            { timestamp: "created_time", created_time: { before } },
          ],
        },
        start_cursor: cursor,
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`Notion API ${res.status}: ${errBody}`);
    }

    const body = await res.json();
    for (const page of body.results) {
      results.push({
        id: page.id,
        title: page.properties["제목"]?.title?.[0]?.plain_text ?? "(제목 없음)",
        url: page.properties["URL"]?.url ?? "",
      });
    }
    cursor = body.has_more ? body.next_cursor : undefined;
  } while (cursor);

  return results;
}

// Notion API에는 진짜 삭제가 없으므로 archived:true로 휴지통에 옮김(30일 내 복구 가능).
export async function archiveItems({ notionToken, pageIds }) {
  let archivedCount = 0;

  for (const pageId of pageIds) {
    const res = await fetch(`${NOTION_API}/${pageId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${notionToken}`,
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ archived: true }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`Notion API ${res.status}: ${errBody}`);
    }
    archivedCount++;
  }

  return archivedCount;
}
