# 0003 — sites.js 설정 스키마 확장

## 상태
승인됨

## 맥락
신규로 추가하는 사이트들은 저마다 특수한 처리가 필요하다: EUC-KR 인코딩(인크루트), JSON API를 POST로 호출(ccei), 봇 차단 회피를 위한 개별 User-Agent(위비티), 클라이언트 렌더링 완료 대기 셀렉터(동적 사이트 전반). 이걸 파서 함수 내부에 하드코딩하면 `sites.js`가 더 이상 "한눈에 읽히는 선언적 배열"이 아니게 된다.

## 결정
`sites.js`의 사이트 객체 스키마에 아래 필드를 **모두 선택적**으로 추가한다. 생략 시 동작은 기존과 동일하다.

```js
{
  id, name, url, parser, category, target,   // 기존 필드, 변경 없음
  mode: "static" | "dynamic",                // 기본값 "static"
  encoding: "euc-kr",                        // 정적 fetch 응답 디코딩용
  requestBody: "a=b&c=d" | { ... },          // 문자열=form POST, 객체=JSON POST
  userAgent: "...",                          // 기본 UA를 이 사이트만 override
  waitForSelector: "css-selector",           // dynamic 모드에서 렌더링 완료 판단 셀렉터
  timeoutMs: 30000,                          // 개별 타임아웃 override
  insecureTLS: true,                         // 서버가 TLS 중간 인증서를 완전히 안 보낼 때만
}
```

구현 중 실측으로 `insecureTLS`가 하나 더 필요해졌다: 대구테크노파크·올콘은 서버가 TLS
중간 인증서 체인을 완전히 보내지 않아 Node fetch(undici)의 기본 엄격한 검증이
"unable to verify the first certificate"로 실패한다(브라우저/curl은 별도 경로로 캐시된
중간 인증서 덕에 통과). 이 필드가 있는 사이트에 한해서만 인증서 검증을 건너뛰는
전용 dispatcher(undici `Agent`)를 사용한다 — 공개 정적 게시판 스크래핑이라 blast radius가
낮다고 판단했다.

## 결과
- `sites.js`는 여전히 순수 데이터 배열로 남고, 특수 케이스도 함수가 아닌 필드로 표현되어 사이트를 추가/수정할 때 코드 로직을 건드릴 필요가 없다.
- 기존 9개 항목은 이 필드들을 전혀 쓰지 않아도 되므로 하위 호환이 100% 유지된다.
- 조사된 신규 사이트 전부가 이 필드 조합으로 표현 가능함을 확인했다(추가 조사에서 표현 불가능한 케이스가 나오면 이 ADR을 갱신).
