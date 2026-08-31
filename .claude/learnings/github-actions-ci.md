# GitHub Actions / CI yml 작성법

## 2026-08-30 — knu-notice-collector의 `.github/workflows/collect.yml` 설명 중 정리

### 기본 개념
GitHub Actions는 저장소의 `.yml` 워크플로우 파일을 읽고, 조건이 되면 GitHub이 관리하는
임시 가상머신("러너")을 새로 띄워 그 안에서 명령을 실행해주는 CI/CD 자동화 서버.
실행이 끝나면 러너는 폐기되므로, 다음 실행에 상태를 넘기려면 결과물을 직접 저장소에
커밋해두거나(예: `data/seen.json`) 외부 저장소(DB 등)에 남겨야 함.

흐름: `트리거 발생 → 러너 생성 → checkout/setup → 실제 작업 실행 → (필요 시) 상태 저장/커밋`

### 기본 골격
```yaml
name: 워크플로우 이름
on: ...            # 언제 실행할지
permissions: ...   # 이 실행이 저장소/API에 뭘 할 수 있는지 (기본은 최소 권한)
jobs:
  잡이름:
    runs-on: ubuntu-latest
    steps: [...]   # 순서대로 실행
```

### `on:` 트리거 종류 (CI에서 자주 씀)
| 트리거 | 언제 | 용도 |
|---|---|---|
| `push` | 특정 브랜치 push | 빌드/테스트 |
| `pull_request` | PR 열림/갱신 | PR 검증 |
| `schedule` (cron) | 정해진 시간마다 | 배치 수집, 정기 점검 |
| `workflow_dispatch` | 수동 클릭 | 디버깅, 즉시 실행 — 다른 트리거와 항상 같이 넣어두면 편함 |

### `permissions:`
- 기본은 최소 권한 원칙. push/커밋이 필요하면 `contents: write`처럼 필요한 것만 명시.
- 저장소 Settings → Actions → General → Workflow permissions가 "Read and write"로
  되어 있어야 하는 경우도 있음 (또는 `gh api .../actions/permissions/workflow -X PUT
  -f default_workflow_permissions=write`로 CLI 설정 가능).

### 자주 쓰는 패턴
- **매트릭스 빌드**: `strategy.matrix`로 여러 Node/OS 버전을 병렬 테스트
  ```yaml
  strategy:
    matrix:
      node-version: [18, 20, 22]
  ```
- **의존성 설치는 `npm ci`** (lock 파일 그대로 재현, `npm install`보다 CI에 적합)
- **캐싱**: `actions/setup-node@v4`의 `with.cache: "npm"`으로 재설치 시간 단축
- **비밀값**: 절대 하드코딩 금지, `${{ secrets.KEY }}`로만 주입. 등록은
  `gh secret set KEY --repo <owner>/<repo>` 또는 저장소 Settings에서.
  비밀 아닌 설정값(DB ID 등)은 굳이 secret으로 감출 필요 없이 yml에 그냥 적어도 됨.
- **조건부 커밋(변경 있을 때만 커밋)** — CI가 산출물/상태 파일을 저장소에 되돌려 쓸 때 표준 트릭:
  ```yaml
  run: |
    git add <파일>
    git diff --cached --quiet || git commit -m "..."
    git push
  ```
  `git diff --cached --quiet`는 변경 없으면 exit 0(성공), 있으면 exit 1(실패) →
  `||`로 "실패했을 때만(=변경 있을 때만) 커밋"하는 구조.
- 커밋 메시지에 `[skip ci]`를 넣으면 그 커밋 자체가 워크플로우를 다시 트리거하지 않음
  (봇이 커밋 → 워크플로우 재실행 → 봇이 또 커밋... 하는 무한루프 방지).

### 클로드 없이 혼자 처음부터 설정할 때 CLI 흐름 (gh CLI 기준)
```bash
gh auth login
git init && git add . && git commit -m "init"
gh repo create <owner>/<repo> --private --source=. --remote=origin --push

mkdir -p .github/workflows   # yml 작성 후
git add .github/workflows/xxx.yml && git commit -m "ci: add workflow" && git push

gh secret set NOTION_TOKEN --repo <owner>/<repo>     # 필요한 비밀값 등록
gh secret list --repo <owner>/<repo>                 # 등록 확인

gh workflow run xxx.yml --repo <owner>/<repo>        # 수동 실행 테스트
gh run list --repo <owner>/<repo> --limit 5
gh run watch <RUN_ID> --repo <owner>/<repo>          # 실시간 로그
gh run view <RUN_ID> --repo <owner>/<repo> --log     # 실패 시 상세 로그

gh workflow disable xxx.yml --repo <owner>/<repo>    # 유지보수: 중지/재개
gh workflow enable xxx.yml --repo <owner>/<repo>
```

## 2026-08-30 — yml 작성법 상세 예시 모음

실전에서 CI yml을 짤 때 마주치는 상황별 전체 예시. 위 "자주 쓰는 패턴"의 심화판.

### 1. Node.js 테스트 CI (가장 기본형)
push/PR마다 lint + test를 돌리는 표준 구성:
```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"          # package-lock.json 해시 기준으로 자동 캐싱
      - run: npm ci
      - run: npm run lint
      - run: npm test
```
`cache: "npm"`은 내부적으로 `actions/cache`를 감싼 것 — lock 파일이 안 바뀌면 `node_modules` 재설치를 스킵해줌.

### 2. 매트릭스: 여러 버전 × 여러 OS 동시 검증
```yaml
jobs:
  test:
    strategy:
      fail-fast: false        # 하나가 실패해도 나머지 조합은 계속 실행
      matrix:
        os: [ubuntu-latest, macos-latest]
        node-version: [18, 20, 22]
        exclude:               # 특정 조합만 제외하고 싶을 때
          - os: macos-latest
            node-version: 18
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
      - run: npm ci && npm test
```
`fail-fast: false`가 없으면 매트릭스 중 하나만 실패해도 나머지가 즉시 취소됨 — 여러 버전을 "끝까지" 확인하고 싶으면 꼭 꺼둘 것.

### 3. 경로 필터 — 특정 디렉토리 변경 시에만 실행
모노레포나 문서 변경만 있을 때 불필요한 CI를 막을 때:
```yaml
on:
  push:
    paths:
      - "src/**"
      - "package.json"
      - ".github/workflows/ci.yml"
```

### 4. 중복 실행 취소 (concurrency)
같은 브랜치에 연달아 push했을 때 이전 실행을 자동 취소해서 러너 낭비를 막음:
```yaml
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true
```

### 5. 조건부 스텝 (`if:`)
```yaml
steps:
  - run: npm run build
  - name: Deploy (main 브랜치일 때만)
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    run: ./deploy.sh
```

### 6. 빌드 산출물 주고받기 (아티팩트, 잡 간 전달)
빌드 잡에서 만든 결과물을 다른 잡(예: 배포)에서 이어받을 때:
```yaml
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci && npm run build
      - uses: actions/upload-artifact@v4
        with:
          name: dist
          path: dist/

  deploy:
    needs: build            # build 잡이 성공해야 실행됨
    runs-on: ubuntu-latest
    steps:
      - uses: actions/download-artifact@v4
        with:
          name: dist
          path: dist/
      - run: ./deploy.sh
```

### 7. 잡 간 출력값(outputs) 전달
파일 통째로가 아니라 값 하나만 다음 잡에 넘길 때:
```yaml
jobs:
  detect:
    runs-on: ubuntu-latest
    outputs:
      version: ${{ steps.get_version.outputs.value }}
    steps:
      - id: get_version
        run: echo "value=$(node -p "require('./package.json').version")" >> "$GITHUB_OUTPUT"

  publish:
    needs: detect
    runs-on: ubuntu-latest
    steps:
      - run: echo "버전은 ${{ needs.detect.outputs.version }}"
```
스텝 안에서 `$GITHUB_OUTPUT` 파일에 `key=value`를 append하는 게 스텝↔잡 간 값 전달의 표준 방식.

### 8. Docker 이미지 빌드 & 레지스트리 push
```yaml
jobs:
  docker:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write        # GHCR(GitHub Container Registry) push에 필요
    steps:
      - uses: actions/checkout@v4
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}   # 저장소 기본 제공 토큰, 별도 등록 불필요
      - uses: docker/build-push-action@v6
        with:
          context: .
          push: true
          tags: ghcr.io/${{ github.repository }}:latest
```
`secrets.GITHUB_TOKEN`은 워크플로우 실행마다 GitHub이 자동 발급해주는 임시 토큰 — 직접 등록할 필요 없이 바로 씀.

### 9. 태그 push 시에만 릴리즈 배포
```yaml
on:
  push:
    tags:
      - "v*.*.*"     # v1.2.3 형태 태그가 push될 때만 실행

jobs:
  release:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4
      - uses: softprops/action-gh-release@v2
        with:
          generate_release_notes: true
```

### 10. 재사용 가능한 워크플로우 (workflow_call)
여러 저장소/여러 워크플로우에서 같은 잡을 반복 정의하지 않고 공유:
```yaml
# .github/workflows/reusable-test.yml
on:
  workflow_call:
    inputs:
      node-version:
        type: string
        default: "20"
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ inputs.node-version }}
      - run: npm ci && npm test
```
```yaml
# 호출하는 쪽: .github/workflows/ci.yml
jobs:
  call-test:
    uses: ./.github/workflows/reusable-test.yml
    with:
      node-version: "22"
```

### 11. 환경별 시크릿 + 배포 승인 게이트 (environment)
프로덕션 배포 전에 사람이 직접 승인하게 막고 싶을 때 (저장소 Settings → Environments에서
`production` 환경을 만들고 "Required reviewers" 설정해두면 아래 잡이 그 승인을 기다림):
```yaml
jobs:
  deploy-prod:
    runs-on: ubuntu-latest
    environment: production     # 이 환경에 등록된 시크릿만 사용 가능 + 승인 대기
    steps:
      - run: ./deploy.sh
        env:
          API_KEY: ${{ secrets.PROD_API_KEY }}   # environment별로 분리 등록 가능
```

### 12. Python 예시 (다른 언어도 구조는 동일)
```yaml
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"
          cache: "pip"
      - run: pip install -r requirements.txt
      - run: pytest
```
언어가 바뀌어도 `checkout → setup-<언어> → 의존성 설치 → 실행` 골격은 동일 — `actions/setup-*`
계열 액션 이름과 캐시 키 종류(`npm`/`pip`/`maven`/`gradle` 등)만 바뀐다고 보면 됨.

### 핵심 정리
- 트리거(`on`)는 "언제", 잡(`jobs`)은 "무엇을 어떤 환경에서", 스텝(`steps`)은 "순서대로 뭘 실행"
- 여러 잡에 걸치는 흐름은 `needs`(의존성) + `outputs`/아티팩트(값 전달)로 연결
- 값을 넘길 게 파일이면 아티팩트, 문자열/숫자 하나면 `$GITHUB_OUTPUT`
- 비밀값은 항상 `secrets.*`, 저장소가 자동 주는 `secrets.GITHUB_TOKEN`은 별도 등록 없이 바로 사용 가능
- 반복되는 잡 정의는 `workflow_call`로 재사용, 배포처럼 승인이 필요한 단계는 `environment`로 게이트



```yaml
name: Collect KNU notices

# 이 워크플로우를 언제 실행할지 정의
on:
  schedule:
    # 매일 09:00 KST(UTC+9) = 00:00 UTC
    - cron: "0 0 * * *"
  workflow_dispatch: {} # GitHub Actions 탭에서 "Run workflow" 버튼으로 수동 실행도 가능하게 함

permissions:
  contents: write # 아래 "Commit updated seen-state" 단계에서 git push로 저장소에 커밋하려면 이 권한이 필요함

jobs:
  collect:
    runs-on: ubuntu-latest # 실행할 때마다 새로 띄워지는 임시 우분투 가상머신(러너)
    steps:
      - uses: actions/checkout@v4 # 1. 저장소 코드를 러너 안으로 내려받음 (이게 없으면 src/collect.js도 없음)

      - uses: actions/setup-node@v4 # 2. 러너에 Node.js 실행 환경을 설치
        with:
          node-version: "20"

      - name: Run collector # 3. 실제 수집 스크립트 실행
        env:
          NOTION_TOKEN: ${{ secrets.NOTION_TOKEN }} # GitHub Secrets에 저장된 값을 환경변수로 주입 (값이 로그에 찍히지 않음)
          NOTION_FEED_DATABASE_ID: "22aeaa3935f7424a9c84513ecb611ed9" # 비밀값이 아니므로 그냥 하드코딩됨
        run: node src/collect.js

      - name: Commit updated seen-state # 4. 이번 실행에서 갱신된 수집 상태(data/seen.json)를 저장소에 되돌려 커밋
        run: |
          git config user.name "knu-notice-bot"
          git config user.email "actions@users.noreply.github.com"
          # 1. 봇 이름/이메일로 커밋 작성자 정보를 설정 (러너에는 기본 git 계정이 없음)
          git add data/seen.json
          # 2. 이번 실행으로 바뀐 seen.json만 스테이징
          git diff --cached --quiet || git commit -m "chore: update seen state [skip ci]"
          # 3. 스테이징된 변경이 실제로 있을 때만 커밋함 (없으면 diff --quiet가 0을 반환해 커밋을 건너뜀)
          #    [skip ci]는 이 커밋 자체가 다시 워크플로우를 트리거하는 걸 막기 위함
          git push
          # 4. 커밋을 원격 저장소로 반영 → 다음 실행이 이 seen.json을 읽어서 이어받음
```