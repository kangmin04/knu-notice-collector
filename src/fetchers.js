import { Agent, fetch as undiciFetch } from "undici";
import { writeFile } from "fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ERROR_LOG_PATH = path.join(__dirname, "..", "data", "error.log");

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
  /*
    ex) 대구창조경제혁신센터는 url: "https://ccei.creativekorea.or.kr/daegu/main/public_notice_list.json",
requestBody: "sPtime=now&kind=my", 이 다음과 같음. 즉, 공지사항 로드할 때 프론트엔드가 이 엔드포인트(url)에 검색조건을 추가해서 post 요청 보내고, 서버는 조건에 맞는(requestbody에 맞는) 목록 반환함. 
즉, 클라이언트가 크롤링할 때도 POST로 보내고, requestbody를 추가해야만 정상적 응답받을수있음. 
  */
  try {
    const res = await doFetch(site.url, {
      method: site.requestBody ? "POST" : "GET",
      headers: {
        "User-Agent": site.userAgent ?? DEFAULT_UA,
        ...(site.requestBody
          ? {
              "Content-Type": isFormBody ? "application/x-www-form-urlencoded" : "application/json",
            }
          : {}),
      },
      body: isFormBody
        ? site.requestBody
        : site.requestBody
          ? JSON.stringify(site.requestBody)
          : undefined,
      signal: controller.signal,
      ...(site.insecureTLS ? { dispatcher: insecureAgent } : {}),
    });

    if (!res.ok) {
      const bodyText = await res.text();
      const logLine = `[${new Date().toISOString()}] ${site.name} (${site.id}) — HTTP ${res.status}\n${bodyText}\n\n`;
      await writeFile(ERROR_LOG_PATH, logLine, { flag: "a" }).catch((err) =>
        console.log("파일작성실패:", err),
      );
      throw new Error(`HTTP ${res.status}`);
    }

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
