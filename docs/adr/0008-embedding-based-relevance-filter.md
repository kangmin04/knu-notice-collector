# 0008 — 임베딩 기반 IT 관련성 필터 도입

## 상태

승인됨

## 맥락

`src/collect.js`가 경북대 공식 게시판 등에서 새 글을 가져와 노션 "새 글 피드" DB에 자동으로 쌓는데, 같은 사이트에서도 IT/개발/공모전과 무관한 글(학사일정, 장학금 공지, 일반 사무직 채용 등)이 섞여 들어오는 문제가 있었다(`src/collect.js`에 "무관한 데이터 필터링 하고자 item.title로 판단할것"이라는 주석이 이미 남아 있었음).

`/deep-dive`로 키워드 규칙 / 지도학습(logistic regression) / 비지도학습을 비교한 결과, 라벨 데이터가 처음엔 100건 이하로 예상돼(실제로는 나중에 400건까지 늘어남) feature를 여러 개 쓰는 logistic regression은 EPV(Events Per Variable) 경험칙(Peduzzi et al. 1996)상 과적합 위험이 컸다. 순수 키워드 규칙은 안전하지만 표면 문자열만 봐서 "임베디드 시스템 아이디어 경진대회"처럼 키워드가 없는 관련 글을 놓친다. 절충안으로 **사전학습된 문장 임베딩 + 프로토타입 문장과의 코사인 유사도(margin) 기반 분류**를 채택했다. 상세 배경은 `계획/임베딩-관련성-필터.md` 참고.

## 결정

새 글 제목을 `@xenova/transformers`(`Xenova/paraphrase-multilingual-MiniLM-L12-v2`)로 임베딩하고, `POSITIVE_PROTOTYPES`/`NEGATIVE_PROTOTYPES`(`src/relevance/prototypes.js`) 각각과의 최대 코사인 유사도 차(`margin = maxPosSim - maxNegSim`)를 계산해, `RELEVANCE_THRESHOLD` 이상이면 관련 있는 글로 판단한다. `src/collect.js`의 `newItems` 루프 안, 노션 기록 직전에 적용하며, 무관 판정된 글은 `[SKIP]` 로그만 남기고 `seenIds`에는 추가해 다음 실행에서 재검토하지 않는다. 판단 중 예외가 나거나 `RELEVANCE_FILTER_DISABLED=1`이면 fail-open으로 관련 글 취급해, 필터 오류로 하루치 공지가 통째로 유실되는 걸 막는다.

## 근거

- **라벨 400건으로 threshold 튜닝**: `scripts/export-labels-from-notion.js`로 노션 "새 글 피드" DB에서 최근 400건을 가져와(`docs/adr/0007`) `scripts/label-cli.js`로 직접 라벨링(관련 있음 111건 / 무관 289건)하고, `scripts/tune-threshold.js`로 threshold를 스윕했다.
- **200건 → 400건으로 늘리며 추천값이 크게 바뀜**: 라벨 200건 시점엔 F0.5(precision 우선) 기준 추천 threshold가 `0.1525`(precision 78.3%, recall 33.3%)였으나, 400건으로 늘리자 `0.0504`(precision 44.5%, recall 44.1%)로 이동했다. 200건 시점 고threshold 구간은 예측된 관련 글이 7~9건뿐이라 표본이 너무 적어 불안정했던 것으로 확인됨 — 라벨을 늘릴수록 추정이 더 신뢰할 만해진다는 근거이기도 하다.
- **precision보다 recall을 더 보호하는 쪽으로 최종 결정**: 원래 동기가 "무관한 글이 섞이는 게 싫다"(precision 우선)였지만, `DRY_RUN=1 npm run collect`로 실제 사이트 전체를 훑어본 결과 recall이 너무 낮으면(예: threshold 0.15 이상) 실제 관련 있는 공고의 상당수가 조용히 사라져 수집기의 존재 목적(놓치지 않고 보기)과 충돌한다고 판단, F0.5 최적값(precision·recall 균형에 조금 더 가까운 `0.0504`)을 그대로 채택했다.
- **CI 캐싱을 위해 `env.cacheDir`을 명시적으로 고정**: `@xenova/transformers`의 기본 캐시 경로는 `node_modules/@xenova/transformers/.cache/`인데, 이는 `npm install`로 `node_modules`가 재설치되면 함께 사라져 GitHub Actions 캐싱 대상으로 쓸 수 없다. `src/relevance/embed.js`에서 `env.cacheDir`을 프로젝트 내 `.cache/transformers/`로 명시적으로 옮기고, `.github/workflows/collect.yml`에 `actions/cache`로 이 경로를 캐싱하는 스텝을 추가했다.

## 결과

- `.env`/`.env.example`에 `RELEVANCE_THRESHOLD=0.0504`, `RELEVANCE_FILTER_DISABLED`(선택) 추가. GitHub Actions 시크릿이 아니라 워크플로우 `env` 블록에 값으로 직접 넣었다(민감정보가 아니라 튜닝 파라미터이므로).
- `.cache/`를 `.gitignore`에 추가 — 모델 가중치는 git으로 추적하지 않고 `actions/cache`로만 관리한다.
- 라벨이 수백~수천 건으로 더 늘어나거나, precision/recall이 운영 중 계속 아쉬우면 logistic regression/파인튜닝, 또는 `POSITIVE_PROTOTYPES`/`NEGATIVE_PROTOTYPES` 보강을 재검토한다. 현재 F1 최고값이 약 0.46(threshold -0.17~-0.19 부근) 수준이라, 어느 threshold를 고르든 상당한 오분류가 남는다는 한계를 인지하고 있다.
- `DRY_RUN=1 npm run collect`로 전체 사이트를 대상으로 육안 점검한 결과 치명적인 오분류(명백히 관련 있는 글의 대량 누락, 명백히 무관한 글의 대량 통과)는 없었으나, `[케이씨텍] 반도체 CMP 장비 정밀설계 담당자 모집` 같은 경계 사례가 일부 있다 — precision 44.5% 수준에서 기대되는 정상 범위다.
