# 분류기 threshold 튜닝: confusion matrix와 F-beta

## 2026-09-09 — scripts/tune-threshold.js에서 관련성 필터(RELEVANCE_THRESHOLD) 최적값을 찾는 과정

`scoreTitle()`이 뱉는 연속값(임베딩 margin 점수)을 "관련 있음/없음" 이진 판단으로 바꾸려면
어딘가에 선을 그어야 한다. 이 선(threshold)을 사람 감이 아니라 라벨링된 데이터로 수치화해서
고르는 절차가 이 파일의 핵심이다.

### Confusion matrix — 예측과 정답을 4칸으로 나누기

이진 분류에서 예측(predicted)과 실제 정답(label)의 조합은 4가지뿐이다. 이 4개 숫자만 있으면
아래 나오는 precision/recall/F1 등 거의 모든 지표를 유도할 수 있다 — 그래서 confusion matrix가
"원재료"고 나머지 지표들은 전부 이걸 가공한 요약값이다.

```js
// scripts/tune-threshold.js:29-44
function evaluate(scored, threshold) {
  let tp = 0; // True Positive: 실제 관련 있음 + 필터도 관련 있다고 예측 (제대로 잡음)
  let fp = 0; // False Positive: 실제 무관 + 필터는 관련 있다고 오판 (노이즈 — precision을 깎음)
  let fn = 0; // False Negative: 실제 관련 있음 + 필터는 무관하다고 오판 (놓침 — recall을 깎음)
  let tn = 0; // True Negative: 실제 무관 + 필터도 무관하다고 예측 (제대로 걸러냄)
  for (const item of scored) {
    const predicted = item.score >= threshold;
    if (predicted && item.label) tp++;
    else if (predicted && !item.label) fp++;
    else if (!predicted && item.label) fn++;
    else tn++;
  }
  const precision = tp + fp === 0 ? 0 : tp / (tp + fp);
  const recall = tp + fn === 0 ? 0 : tp / (tp + fn);
  ...
```

이름 규칙은 "Positive/Negative는 예측이 뭐라고 했는지, True/False는 그 예측이 맞았는지"다.
즉 FP는 "긍정이라고 예측했는데 틀림", FN은 "부정이라고 예측했는데 틀림"이지, 직관과 반대로
읽기 쉬우니 매번 이 정의로 되짚는 게 안전하다.

### Precision과 Recall — 서로 반대 방향으로 당기는 두 지표

- **precision** = TP/(TP+FP): "관련 있다고 판단한 것 중 진짜 맞은 비율" → 필터를 얼마나 믿을 수 있는가
- **recall** = TP/(TP+FN): "진짜 관련 있는 것 중 필터가 잡아낸 비율" → 얼마나 안 놓치는가

threshold를 올리면(더 엄격하게 통과시키면) FP가 줄어 precision은 오르지만, 동시에 진짜
관련 있는 것도 걸러내 버려 FN이 늘고 recall은 떨어진다. 반대로 threshold를 내리면 recall은
오르지만 precision이 떨어진다 — 이게 **precision-recall tradeoff**다. 단일 숫자로 "최고의
threshold"를 말하려면 이 둘을 하나로 합칠 방법이 필요한데, 그게 F-beta다.

### F-beta score — precision과 recall의 가중 조화평균

```js
// scripts/tune-threshold.js:21-25
function fBeta(precision, recall, beta) {
  if (precision + recall === 0) return 0;
  const beta2 = beta * beta;
  return ((1 + beta2) * precision * recall) / (beta2 * precision + recall);
}
```

**왜 산술평균이 아니라 조화평균(harmonic mean)인가**: 산술평균 `(p+r)/2`는 precision=1.0,
recall=0.0이어도 0.5가 나와 "한쪽이 완전히 망가진" 상태를 가려버린다. 조화평균은 작은 값 쪽으로
훨씬 크게 끌려가므로(예: p=1.0, r=0.1 → F1≈0.18), 두 지표 중 하나라도 나쁘면 전체 점수가
확실히 나빠진다. 즉 "둘 다 어느 정도는 되어야 좋은 점수"를 강제하는 성질이 조화평균의 핵심이다.

**beta의 의미**: beta=1(F1)은 precision과 recall을 동등하게 취급. beta<1(F0.5)은 precision에
더 큰 가중치, beta>1(F2)은 recall에 더 큰 가중치. 극한을 보면 이해가 쉽다 — 분자/분모를
beta²으로 나누면 `((1/beta²+1)·p·r) / (p + r/beta²)` 형태가 되는데, beta→0이면 우변의
`r/beta²` 항이 발산해 결국 precision 값 자체로 수렴하고, beta→∞면 반대로 recall로 수렴한다.
"beta가 recall에 곱해지는 가중치"라고 외우기보다 이 극한으로 방향을 확인하는 게 헷갈리지 않는다.

이 프로젝트는 F0.5(beta=0.5)를 최종 기준으로 썼다 — "무관한 글이 섞이는 게 싫다"는 원래
동기(CLAUDE.md의 "정보 카테고리" 정리 목적)상 recall보다 precision을 우선해야 하기 때문.

```js
// scripts/tune-threshold.js:105-113
const best = rows.reduce((a, b) => (b.f05 > a.f05 ? b : a));
```

### threshold 후보를 관측 범위 안에서만 뽑는 이유

```js
// scripts/tune-threshold.js:80-89
const scores = scored.map((item) => item.score);
const min = Math.min(...scores);
const max = Math.max(...scores);
const thresholds = Array.from(
  { length: THRESHOLD_STEPS + 1 },
  (_, i) => min + ((max - min) * i) / THRESHOLD_STEPS,
);
```

0~1 같은 고정 범위를 스윕하면 실제 점수 분포 밖의 threshold(예: 모든 점수가 0.3~0.7 사이인데
0.9를 후보로 넣는 것)는 "전부 통과" 아니면 "전부 차단"인 의미 없는 지점이 된다. 관측된
min~max 구간만 등분하면 후보 전부가 실제로 confusion matrix를 갈라놓는 유효한 경계가 된다.

### 이런 상황에서 쓸 수 있는 다른 threshold 결정 원리들

F0.5 최댓값 찾기 외에도 이진 분류 threshold를 정하는 표준적인 접근이 여러 개 있다. 상황에 따라
더 적합한 게 갈린다.

- **ROC curve + Youden's J statistic**: x축 FPR(=FP/(FP+TN)), y축 TPR(=recall)로 각 threshold를
  점 찍은 곡선. J = TPR − FPR이 최대인 지점을 고르는 방법. "양성/음성 클래스 비율이 비슷하고,
  두 종류 오류(FP/FN)의 비용이 같다"고 가정할 때 잘 맞는다. 이 프로젝트처럼 무관한 글(음성)이
  압도적으로 많은 **불균형 데이터**에서는 FPR 자체가 낮게 나오기 쉬워 곡선이 지나치게 낙관적으로
  보이는 함정이 있다 — 그래서 PR curve 쪽이 더 정직한 그림을 준다.
- **PR curve + AUC-PR**: precision을 y축, recall을 x축으로 곡선 전체를 그려 "특정 threshold
  하나"가 아니라 "이 스코어링 함수 자체가 전반적으로 얼마나 좋은가"를 요약하는 지표
  (곡선 아래 면적). threshold 자체를 정하기보다 두 모델/두 임베딩 방식을 비교할 때 유용하다.
  불균형 데이터에서 ROC-AUC보다 변별력이 좋다.
- **비용 기반(cost-sensitive) 결정**: FP 하나의 비용과 FN 하나의 비용이 실제로 다르다면(예:
  "무관한 글이 하나 섞이는 것"과 "중요한 공모전 공지를 하나 놓치는 것"의 실질적 피해가 다르면),
  단순히 F-beta의 beta를 감으로 고르는 대신 `argmin(cost_FP·FP + cost_FN·FN)`을 직접 최소화하는
  threshold를 찾는 게 더 원칙적이다. F-beta의 beta는 사실 이 비용비를 암묵적으로 대변하는
  대리 변수(proxy)에 가깝다.
- **제약 만족형 선택**: "precision은 최소 0.9 이상이어야 한다"처럼 한쪽 지표에 하한선을
  정해두고, 그 제약을 만족하는 threshold 중 recall이 최대인 걸 고르는 방식. 단일 스칼라로
  뭉뚱그리는 F-beta보다 "제품 요구사항이 한쪽 지표에 명확한 최소 기준을 요구할 때" 더 직관적으로
  설명하기 쉽다.
- **Matthews Correlation Coefficient(MCC)**: `(TP·TN − FP·FN) / sqrt((TP+FP)(TP+FN)(TN+FP)(TN+FN))`.
  confusion matrix 4칸을 전부 대칭적으로 반영하는 유일한 단일 지표라, 클래스 불균형이 심해도
  왜곡되지 않는다는 게 F1보다 나은 점으로 종종 언급된다. F-beta는 TN을 아예 쓰지 않는다는 점과
  비교하면 차이가 뚜렷하다.
- **일반화 성능 확보(교차검증)**: 지금 스크립트는 라벨링된 샘플 전체로 threshold를 고르고 같은
  샘플로 평가까지 한다 — 표본이 작으면 이 threshold가 새 데이터에도 잘 맞을지 낙관적으로
  과대평가될 위험(overfitting)이 있다. 데이터가 늘어나면 k-fold cross-validation으로 fold마다
  최적 threshold를 구해 평균/분산을 보는 식으로 안정성을 확인하는 게 정석적인 다음 단계다.

정리하면: F-beta 최댓값 찾기는 "두 지표를 하나의 스칼라로 뭉쳐서 최적화"하는 방법이고,
ROC/PR curve는 "threshold 전체 구간에서 트레이드오프 자체를 시각화"하는 방법이며, 비용 기반
접근은 "그 트레이드오프에 실제 비즈니스 비용을 대입"하는 방법이다. 지금 프로젝트 규모(라벨
수백 건 수준)에서는 F0.5 스윕 표 출력이 적절한 선택이지만, 라벨이 늘어나거나 오류 비용이
명확해지면 위 대안들로 옮겨갈 여지가 있다.
