import { Agent, fetch as undiciFetch } from "undici";

const DEFAULT_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// 일부 사이트(대구테크노파크, 올콘 등)는 서버가 TLS 중간 인증서 체인을 완전히 보내지
// 않아 Node fetch(엄격한 undici 기본 TLS 검증)가 "unable to verify the first
// certificate"로 실패한다(브라우저/curl은 별도로 캐시된 중간 인증서 덕에 통과).
// site.insecureTLS: true인 사이트에 한해서만 인증서 검증을 건너뛰는 전용 dispatcher를 쓴다.
// Node 전역 fetch(내부 번들 undici)와 npm undici 패키지의 버전이 다르면 dispatcher
// 객체 호환성 에러가 나므로, insecureTLS 사이트는 undici 패키지의 fetch를 그대로 쓴다.
const insecureAgent = new Agent({ connect: { rejectUnauthorized: false } });

// mode: "static"(기본값) 사이트의 콘텐츠를 가져온다. site.requestBody가 문자열이면
// application/x-www-form-urlencoded로, 객체면 JSON으로 POST한다.
// site.encoding === "euc-kr"이면 EUC-KR로 디코딩해서 반환한다.
export async function fetchStaticText(site) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), site.timeoutMs ?? 15000);
  const isFormBody = typeof site.requestBody === "string";
  const doFetch = site.insecureTLS ? undiciFetch : fetch;
  try {
    const res = await doFetch(site.url, {
      method: site.requestBody ? "POST" : "GET",
      headers: {
        "User-Agent": site.userAgent ?? DEFAULT_UA,
        ...(site.requestBody
          ? { "Content-Type": isFormBody ? "application/x-www-form-urlencoded" : "application/json" }
          : {}),
      },
      body: isFormBody ? site.requestBody : site.requestBody ? JSON.stringify(site.requestBody) : undefined,
      signal: controller.signal,
      ...(site.insecureTLS ? { dispatcher: insecureAgent } : {}),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    if (site.encoding === "euc-kr") {
      const iconv = (await import("iconv-lite")).default;
      return iconv.decode(Buffer.from(await res.arrayBuffer()), "euc-kr");
    }
    return await res.text();
  } finally {
    clearTimeout(timeout);
  }
}

export { DEFAULT_UA };
