const NOTION_API = "https://api.notion.com/v1/pages";
const NOTION_VERSION = "2022-06-28";

export async function addFeedItem({ site, item, notionToken, databaseId }) {
  const body = {
    parent: { database_id: databaseId },
    properties: {
      제목: { title: [{ text: { content: item.title.slice(0, 2000) } }] },
      URL: { url: item.url },
      사이트: { rich_text: [{ text: { content: site.name } }] },
      카테고리: { multi_select: site.category.map((name) => ({ name })) },
      대상: { select: { name: site.target } },
      발견일: { date: { start: new Date().toISOString().slice(0, 10) } },
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
