# 0006 — 스케줄 누락 감지용 watchdog 워크플로우 도입

## 상태
승인됨

## 맥락
`collect.yml`의 cron 스케줄이 2026-09-01에 발동하지 않은 사고가 있었다(사용자가 발견 후 수동 `workflow_dispatch`로 복구). 원인을 조사한 결과 GitHub Actions의 스케줄(cron) 트리거는 "best-effort"라 GitHub 인프라 부하에 따라 지연되거나 아예 스킵될 수 있다는 것이 확인됐다 — 실제로 이 워크플로우의 유일한 스케줄 실행 이력도 예정(01:15 UTC)보다 5시간 45분 늦게(06:00 UTC대) 발동한 전례가 있었고, 그 다음날은 아예 발동하지 않았다.

`collect.yml` 자체에 재시도 로직을 추가하는 방식으로는 이 문제를 해결할 수 없다 — 애초에 job이 시작되지 않으면 그 안의 어떤 코드도 실행되지 않기 때문이다. 감지는 외부에서 이뤄져야 한다.

Claude Code의 훅(PreToolUse/PostToolUse/Stop 등)은 사용자가 로컬에서 Claude Code 세션을 실행 중일 때만 동작하므로, 컴퓨터가 꺼져 있어도 매일 자동 실행돼야 하는 이 무인 클라우드 작업(README 참고)을 감시하기엔 애초에 맞지 않는다.

## 결정
`collect.yml`과 별개로 동작하는 2번째 GitHub Actions 스케줄 워크플로우(`watchdog.yml`)를 추가한다.

- **감지 시각**: 매일 18:00 KST(09:00 UTC) — `collect.yml`의 예정 시각(10:15 KST)과 관측된 최대 지연(5h45m)을 감안한 버퍼.
- **판단 기준**: `gh run list`로 `collect.yml`의 최근 실행 중 "성공 완료" 또는 "진행/대기 중" 상태의 가장 최근 실행이 22시간 이상 지났으면 누락으로 판정. 22시간은 watchdog 주기(24h)보다 살짝 짧게 잡아 다음 체크에서 반드시 걸리도록 하되, `collect.yml`의 정상적인 실행 지연에는 오탐하지 않을 여유를 준 값.
- **누락 시 동작**: `gh workflow run collect.yml`로 즉시 self-heal 재실행시킨 뒤, job을 `exit 1`로 실패 처리한다. GitHub는 저장소 소유자에게 기본적으로 실패한 워크플로우에 대한 이메일을 보내므로, 별도 Secret이나 외부 서비스(Slack 등) 연동 없이 알림이 이뤄진다.
- 정상일 때는 조용히 성공 종료한다(불필요한 알림 없음).

## 결과
- 별도의 GitHub Secret이나 새 의존성 없이(저장소에 이미 있는 `gh` CLI + 기본 `GITHUB_TOKEN`만 사용) 구현된다.
- **알려진 한계**: watchdog 자신도 GitHub Actions의 cron으로 도는 이상, 이론적으로 watchdog 자체가 발동하지 않을 가능성은 남아있다. 다만 감시 대상(`collect.yml`, 10:15 KST)과 감시자(`watchdog.yml`, 18:00 KST)의 발동 시각을 다르게 둬서 두 워크플로우가 같은 원인으로 동시에 지연/스킵될 상관관계를 낮췄다. 완전한 보장이 필요해지면 외부 크론 서비스(예: cron-job.org)가 `repository_dispatch` 이벤트를 호출하는 방식으로 확장할 수 있으나, 현재 규모(개인 프로젝트, 일 1회 수집)에는 과설계이므로 채택하지 않는다.
- 사용자는 GitHub 알림 설정(Settings → Notifications → Actions)에서 실패 워크플로우 이메일 수신이 켜져 있는지 별도로 확인해야 한다 — 이 설정은 코드로 강제할 수 없다.
