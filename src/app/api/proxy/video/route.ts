import { NextRequest, NextResponse } from "next/server";

// ✅ Wajib: gunakan Node.js runtime agar http/https module bisa dipakai
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ─── Helper: fetch dengan redirect manual & header custom ────────────────────
async function fetchWithRedirect(
  url: string,
  headers: Record<string, string>,
  maxRedirects = 5
): Promise<Response> {
  let currentUrl = url;

  for (let i = 0; i < maxRedirects; i++) {
    const res = await fetch(currentUrl, {
      headers,
      redirect: "manual", // tangani redirect manual agar bisa forward header
    });

    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const location = res.headers.get("location");
      if (!location) break;
      currentUrl = new URL(location, currentUrl).href;
      continue;
    }

    return res;
  }

  // Fallback: biarkan fetch handle redirect otomatis
  return fetch(currentUrl, { headers });
}

export async function GET(req: NextRequest) {
  const urlParams = req.nextUrl.searchParams;
  const url = urlParams.get("url");
  const refererParam = urlParams.get("referer");

  if (!url) {
    return new NextResponse("Missing URL parameter", { status: 400 });
  }

  try {
    let origin: string;
    try {
      origin = new URL(url).origin;
    } catch {
      origin = "https://www.dramaboxdb.com";
    }

    const requestHeaders: Record<string, string> = {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "*/*",
      "Accept-Language": "en-US,en;q=0.9",
      Referer: refererParam || origin + "/",
      Origin: refererParam ? new URL(refererParam).origin : origin,
    };

    // Forward Range header untuk video seeking
    const range = req.headers.get("range");
    if (range) {
      requestHeaders["Range"] = range;
    }

    const upstreamRes = await fetchWithRedirect(url, requestHeaders);

    if (upstreamRes.status >= 400) {
      console.error(`Proxy fetch failed for ${url}: ${upstreamRes.status}`);
      return new NextResponse(`Upstream Error: ${upstreamRes.status}`, {
        status: upstreamRes.status,
      });
    }

    const contentType = (
      upstreamRes.headers.get("content-type") || ""
    ).toLowerCase();
    const lowerUrl = url.toLowerCase().split("?")[0]; // buang query string untuk pengecekan ekstensi

    const isM3u8 =
      contentType.includes("application/vnd.apple.mpegurl") ||
      contentType.includes("application/x-mpegurl") ||
      lowerUrl.endsWith(".m3u8");

    const isVtt =
      contentType.includes("text/vtt") ||
      lowerUrl.endsWith(".vtt") ||
      lowerUrl.endsWith(".srt");

    // ── Binary (MP4, TS, dll) → stream langsung ──────────────────────────────
    if (
      !isM3u8 &&
      !isVtt &&
      (lowerUrl.includes(".mp4") ||
        lowerUrl.includes(".ts") ||
        contentType.includes("video/") ||
        contentType.includes("application/octet-stream"))
    ) {
      const responseHeaders = new Headers();
      responseHeaders.set("Content-Type", contentType || "video/mp4");
      responseHeaders.set("Access-Control-Allow-Origin", "*");
      responseHeaders.set("Accept-Ranges", "bytes");

      const contentLength = upstreamRes.headers.get("content-length");
      const contentRange = upstreamRes.headers.get("content-range");
      if (contentLength) responseHeaders.set("Content-Length", contentLength);
      if (contentRange) responseHeaders.set("Content-Range", contentRange);

      return new NextResponse(upstreamRes.body, {
        status: upstreamRes.status,
        headers: responseHeaders,
      });
    }

    // ── M3U8 → baca & rewrite URL agar lewat proxy ───────────────────────────
    const buffer = await upstreamRes.arrayBuffer();
    const text = new TextDecoder().decode(buffer);
    const firstLine = text.slice(0, 100);
    const isM3u8Content = firstLine.includes("#EXTM3U");

    const host =
      req.headers.get("x-forwarded-host") || req.headers.get("host");
    const proto = req.headers.get("x-forwarded-proto") || "https";
    const siteOrigin = `${proto}://${host}`;

    if (isM3u8 || isM3u8Content) {
      const baseUrl = new URL(url);
      const subUrl = urlParams.get("sub");
      const isMasterPlaylist = text.includes("#EXT-X-STREAM-INF");

      const createProxyUrl = (targetUrl: string) => {
        let proxyUrl = `${siteOrigin}/api/proxy/video?url=${encodeURIComponent(targetUrl)}`;
        if (refererParam)
          proxyUrl += `&referer=${encodeURIComponent(refererParam)}`;
        return proxyUrl;
      };

      let rewritten = text
        .split(/\r?\n/)
        .map((line) => {
          const trimmed = line.trim();
          if (!trimmed) return line;

          // Rewrite URI dalam tag #EXT-X-KEY, #EXT-X-MEDIA, dll
          if (trimmed.startsWith("#")) {
            return line.replace(/URI="([^"]+)"/g, (match, uri) => {
              try {
                const absoluteUrl = new URL(uri, baseUrl.href).href;
                return `URI="${createProxyUrl(absoluteUrl)}"`;
              } catch {
                return match;
              }
            });
          }

          // Rewrite segment URL
          try {
            const absoluteUrl = new URL(trimmed, baseUrl.href).href;
            return createProxyUrl(absoluteUrl);
          } catch {
            return line;
          }
        })
        .join("\n");

      // Inject subtitle track jika ada
      if (isMasterPlaylist && subUrl) {
        let proxiedSubUrl = `${siteOrigin}/api/proxy/video?url=${encodeURIComponent(subUrl)}`;
        if (refererParam)
          proxiedSubUrl += `&referer=${encodeURIComponent(refererParam)}`;

        const mediaLine = `#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="Indonesia",DEFAULT=YES,AUTOSELECT=YES,LANGUAGE="id",URI="${proxiedSubUrl}"`;
        rewritten = rewritten.replace("#EXTM3U", "#EXTM3U\n" + mediaLine);
        rewritten = rewritten.replace(
          /#EXT-X-STREAM-INF:(.*)/g,
          (match, attrs) => {
            if (attrs.includes("SUBTITLES=")) return match;
            return `#EXT-X-STREAM-INF:${attrs},SUBTITLES="subs"`;
          }
        );
      }

      return new NextResponse(rewritten, {
        status: 200,
        headers: {
          "Content-Type": "application/vnd.apple.mpegurl",
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "no-store",
        },
      });
    }

    // ── VTT/SRT subtitle ─────────────────────────────────────────────────────
    if (isVtt || lowerUrl.endsWith(".srt")) {
      let vttContent = new TextDecoder().decode(buffer);
      const isSrt = lowerUrl.includes(".srt");

      if (isSrt && !firstLine.includes("WEBVTT")) {
        vttContent = vttContent
          .replace(/\r\n/g, "\n")
          .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, "$1.$2");
        vttContent = "WEBVTT\n\n" + vttContent;
      }

      vttContent = vttContent.replace(
        /((?:\d{2}:)?\d{2}:\d{2}\.\d{3} --> (?:\d{2}:)?\d{2}:\d{2}\.\d{3})(.*)/g,
        (match, time, rest) =>
          rest.includes("line:") ? match : `${time} line:75%${rest}`
      );

      return new NextResponse(vttContent, {
        status: 200,
        headers: {
          "Content-Type": "text/vtt",
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "no-store",
        },
      });
    }

    // ── Fallback ──────────────────────────────────────────────────────────────
    return new NextResponse(buffer, {
      status: upstreamRes.status,
      headers: {
        "Content-Type": contentType || "application/octet-stream",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (error) {
    console.error("Proxy error:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
