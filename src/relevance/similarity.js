// TODO(human): cosineSimilarity(a, b) 구현
// a, b는 같은 길이의 숫자 배열(임베딩 벡터)이다.
// 코사인 유사도 = (a·b) / (||a|| * ||b||)
// a와 b의 내적 -> a1과 b1의 곱을 합함.
// a1 a2 a3 a4
export function cosineSimilarity(a, b) {
  //콜백내의 sum은 reduce 내에서 넘겨주는 누적값이라 외부에서 선언할 필요없음.
  // let sum = 0
  // let sumA = 0
  // let sumB = 0
  const innerProduct = a.reduce((sum, ai, i) => sum + ai * b[i], 0);
  const norm_A = Math.sqrt(a.reduce((sumA, ai, _) => sumA + Math.pow(ai, 2), 0));
  const norm_B = Math.sqrt(b.reduce((sumB, bi, _) => sumB + Math.pow(bi, 2), 0));

  if (norm_A * norm_B === 0) {
    // cosineSimilarity같은 순수수학함수는 이 상황에 대한 로그만 남기고, 애플리케이션 정책을 모르는게 책임분리임! 예외는 우리가 호출할 index와 collect에서 처리하도록 넘기자.
    throw new Error("can not divide by 0");
  }

  return innerProduct / (norm_A * norm_B);
}
