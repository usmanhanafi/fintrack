import { NextResponse, type NextRequest } from "next/server";

const COOKIE_NAME = "fintrack_session";
const PUBLIC_PATHS = ["/login", "/api/login", "/manifest.webmanifest", "/sw.js", "/icons", "/offline"];

/**
 * Middleware hanya memeriksa keberadaan cookie sesi di sini. Verifikasi tanda tangan
 * penuh (yang butuh Node crypto) terjadi di setiap API route lewat getSessionUserId,
 * karena Edge Runtime middleware punya akses crypto yang terbatas untuk HMAC Node.
 */
export function checkSession(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith(`${p}/`));
  const hasSession = Boolean(request.cookies.get(COOKIE_NAME)?.value);

  if (!hasSession && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }

  if (hasSession && path === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next({ request });
}
