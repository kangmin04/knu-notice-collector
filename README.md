# 경북대 CS 공지 수집기

경북대 공식 게시판, 대구 지역·전국 공모전/채용 플랫폼 등 23개 사이트를 매일 GitHub Actions가 확인해서, 새로 올라온 글만 노션 "새 글 피드" 데이터베이스에 자동으로 추가합니다. 설계 배경은 `docs/PRD.md`, `docs/architecture.md`, `docs/adr/`를 참고하세요.

## 하는 일

- **수집**: `src/sites.js`에 등록된 사이트(정적 파싱 21곳 + Playwright 동적 렌더링 2곳)를 순회하며 새 글만 골라 노션에 기록합니다 (`src/collect.js`).
- **관련성 표시**: 문장 임베딩 기반으로 IT/개발 관련 글인지 판단해 "IT 관련" 체크박스에 표시합니다. 오분류로 글이 조용히 사라지는 걸 막기 위해 필터링(게이트)이 아니라 표시만 합니다 (`docs/adr/0009`).
- **정리(cleanup)**: "IT 관련" 미체크 상태로 일정 기간 지난 글을 모아 GitHub 이슈로 제안하고, `approved` 라벨을 붙이면 그 시점에 다시 확인해 여전히 무관한 것만 노션에서 삭제(휴지통 이동)합니다 (`src/cleanup-detect.js`, `src/cleanup-apply.js`).
- **스케줄 감시**: `collect.yml`이 22시간 이상 성공 실행되지 않으면 watchdog이 감지해 자동 재실행합니다 (`docs/adr/0006`).

## 노션 산출물

- 정보 소스 모음 DB — 전체 사이트 목록 (경북대 공식 채널 / 대구 지역 채널 / 전국 플랫폼)
- 새 글 피드 DB — 자동 수집기가 새 글을 기록하는 곳

두 DB 모두 비공개이며, 링크는 `CLAUDE.md`에 기록돼 있습니다.

## 동작 방식

- `collect.yml`: 매일 10:15 KST에 전체 사이트를 확인해 새 글을 노션에 기록하고, 정리 대상 후보가 있으면 이슈를 생성/갱신합니다.
- `watchdog.yml`: 매일 18:00 KST에 `collect.yml`의 최근 실행 여부를 확인해, 누락 시 재실행(self-heal)하고 실패로 표시해 저장소 소유자에게 이메일로 알립니다.
- `cleanup.yml`: 정리 대상 이슈에 `approved` 라벨이 붙거나 수동 실행(`workflow_dispatch`)되면 승인된 글을 삭제(휴지통 이동)합니다.

## 로컬에서 실행하기

```bash
npm install
cp .env.example .env   # NOTION_TOKEN 등 값 채우기
npm run collect        # 실제 수집 실행
DRY_RUN=1 npm run collect   # 노션에 쓰지 않고 파싱 결과만 로그로 확인
```

`NOTION_TOKEN`은 [내 통합](https://www.notion.so/my-integrations)에서 발급받아 대상 데이터베이스에 연결한 내부 통합 토큰입니다. `.env.example`의 나머지 값(DB ID, 관련성 threshold)은 기본값 그대로 써도 됩니다.

## GitHub Actions 설정

이 저장소를 포크해서 직접 돌리려면, 저장소 Settings → Secrets and variables → Actions에 `NOTION_TOKEN`을 등록해야 합니다.

```bash
gh secret set NOTION_TOKEN --repo <owner>/<repo>
```

`GITHUB_TOKEN`은 워크플로우 실행마다 GitHub이 자동 발급하므로 별도 등록이 필요 없습니다. `collect.yml`이 매 실행 후 `data/seen.json`(수집 상태)을 저장소에 커밋해 다음 실행이 이어받으므로, 워크플로우 권한(`contents: write`)이 이미 설정돼 있습니다.

## 개발

```bash
npm run lint          # ESLint 검사
npm run lint:fix       # ESLint 자동 수정
npm run format         # Prettier 포맷 적용
npm run format:check   # Prettier 포맷 검사
npm test               # 테스트 실행 (node --test)
```

## 문서

- `docs/PRD.md` — 프로젝트 배경과 요구사항
- `docs/architecture.md` — 데이터 흐름과 컴포넌트 책임
- `docs/adr/` — 주요 설계 결정 기록 (사이트 추가 방식, TLS 우회, Playwright 도입, 관련성 필터, 정리 흐름 등)
