# 경북대 CS 공지 수집기

경북대 공식 게시판 9곳을 매일 아침 9시(KST)에 GitHub Actions가 확인해서, 새로 올라온 글만 노션 "새 글 피드" 데이터베이스에 자동으로 추가합니다.

- 정보 소스 전체 목록: 노션 "경북대 CS 대외활동/정보 모음" 데이터베이스
- 자동 수집 결과: 노션 "새 글 피드" 데이터베이스
- 스케줄/실행 이력: GitHub 저장소의 Actions 탭 (`.github/workflows/collect.yml`)

## 1. 노션 연동 설정 (최초 1회)

1. https://www.notion.so/my-integrations 접속 → "New integration" → 이름 아무거나 (예: `knu-notice-bot`) → 워크스페이스 선택 → 생성
2. 생성된 "Internal Integration Secret" 복사 (`ntn_`으로 시작)
3. 노션에서 "새 글 피드" 데이터베이스 페이지를 열고, 우측 상단 `...` → `연결 추가(Connections)` → 방금 만든 integration 선택

## 2. GitHub 저장소에 시크릿 등록 (최초 1회)

노션 토큰은 코드에 절대 넣지 않고, GitHub Actions Secret으로만 보관합니다. 아래 명령을 터미널에서 직접 실행하세요 (프롬프트가 뜨면 1번에서 복사한 토큰을 붙여넣기):

```bash
gh secret set NOTION_TOKEN --repo <github-user>/knu-notice-collector
```

(`NOTION_FEED_DATABASE_ID`는 비밀값이 아니라서 워크플로우 파일에 직접 들어있습니다.)

## 3. 동작 방식

- `.github/workflows/collect.yml`이 매일 00:00 UTC(=09:00 KST)에 자동 실행됩니다.
- GitHub Actions 저장소 화면의 "Actions" 탭에서 "Run workflow" 버튼으로 수동 실행도 가능합니다.
- 최초 실행 시에는 각 게시판의 "현재 글 목록"을 기준선으로만 저장하고 노션에는 아무것도 올리지 않습니다 (과거 글이 전부 "새 글"로 쏟아지는 것을 방지).
- 두 번째 실행부터는 기준선 이후 새로 올라온 글만 노션 "새 글 피드"에 추가됩니다.
- 수집 상태(`data/seen.json`)는 실행이 끝날 때마다 워크플로우가 자동으로 커밋해서 저장소에 남깁니다 — GitHub Actions 러너는 매번 새 환경이라 이렇게 하지 않으면 다음 실행이 이전 상태를 기억하지 못합니다.

## 4. 로컬에서 수동 실행 / 테스트

```bash
cp .env.example .env   # NOTION_TOKEN 값 채우기
npm run collect
```

## 5. 수집 대상을 늘리고 싶다면

`src/sites.js`에 항목을 추가하면 됩니다. 게시판이 아래 3가지 템플릿 중 하나와 같은 구조라면 그대로 재사용할 수 있습니다 (`src/parsers.js` 참고):

- `gnuboard`: `<a href="...wr_id=123">제목</a>` 형태 (그누보드 계열, 예: cse.knu.ac.kr)
- `knuHome`: `<a href='...mode=view&mv_data=...'>제목</a>` 형태 (home.knu.ac.kr 계열)
- `knuWbbs`: `<a href="...doc_no=123...">제목</a>` 형태 (www.knu.ac.kr wbbs 계열)

새 템플릿이면 `src/parsers.js`에 파서 함수를 하나 추가하고 `parsers` 객체에 등록하세요.

## 왜 대구/전국 플랫폼(링커리어, 위비티 등)은 자동 수집에서 빠졌나요?

이 플랫폼들은 대부분 JavaScript로 목록을 렌더링하거나 구조가 자주 바뀌어서, 단순 HTML 파싱으로는 안정적으로 새 글을 감지하기 어렵습니다. 이미 여러 출처를 한 곳에 모아주는 "종합 플랫폼"이라 직접 방문 확인의 효용도 상대적으로 높습니다. 노션 "정보 소스" 데이터베이스에는 계속 남아있으니 링크로 직접 확인하면 됩니다.
