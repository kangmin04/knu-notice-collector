# 경북대 CS 공지 수집기

경북대 공식 게시판과 대구/전국 공모전·채용 플랫폼을 매일 아침 9시(KST)에 GitHub Actions가 확인해서, 새로 올라온 글만 노션 "새 글 피드" 데이터베이스에 자동으로 추가합니다. 자세한 설계 배경은 `docs/PRD.md`, `docs/architecture.md`, `docs/adr/`를 참고하세요.

- 정보 소스 전체 목록: 노션 "경북대 CS 대외활동/정보 모음" 데이터베이스
- 자동 수집 결과: 노션 "새 글 피드" 데이터베이스
- 스케줄/실행 이력: GitHub 저장소의 Actions 탭 (`.github/workflows/collect.yml`)
- 스케줄 누락 감지: `.github/workflows/watchdog.yml`이 매일 18:00 KST에 `collect.yml`의 최근 실행 여부를 확인해, 22시간 이상 실행 이력이 없으면 자동으로 재실행(self-heal)하고 실패 처리로 저장소 소유자에게 이메일 알림을 보냅니다 (`docs/adr/0006` 참고).

