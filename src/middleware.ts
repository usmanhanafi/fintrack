import type { NextRequest } from "next/server";
import { checkSession } from "@/lib/session-middleware";

export function middleware(request: NextRequest) {
  return checkSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icons|manifest.webmanifest|sw.js|workbox-.*\\.js|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)",
  ],
};
