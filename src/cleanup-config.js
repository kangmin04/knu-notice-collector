// cleanup-detect.js와 cleanup-apply.js가 "며칠 지나야 정리 대상인지" 기준을 공유한다.
// 각 파일에 따로 두면 한쪽만 바꿨을 때 에러 없이 조용히 어긋나므로(승인된 후보가
// apply 단계에서 자기 기준에 안 맞아 조용히 skip됨) 반드시 여기서만 관리한다.
export const STALE_DAYS = 3;
