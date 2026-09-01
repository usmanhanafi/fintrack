/// <reference lib="webworker" />

import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { NetworkFirst, Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  // Panggilan sync tidak pernah di-cache. Data dilayani dari IndexedDB, bukan dari cache HTTP.
  runtimeCaching: defaultCache,
  fallbacks: {
    entries: [
      {
        url: "/offline",
        matcher: ({ request }) => request.destination === "document",
      },
    ],
  },
});

serwist.addEventListeners();

const SHELL_ROUTES = ["/", "/transactions", "/budgets", "/reports", "/settings"];

// Dokumen HTML dilayani lewat cache "others" milik defaultCache (NetworkFirst,
// lihat matcher terakhir di @serwist/next/worker). Sebuah fetch() polos dari dalam
// service worker tidak melewati routing fetch-event SW sendiri, jadi tidak pernah
// tersimpan ke cache manapun. Strategi yang sama dipanggil langsung di sini supaya
// hasilnya masuk ke cache yang benar, dan kunjungan pertama yang langsung disusul
// mode pesawat tetap mendapat semua halaman shell, bukan cuma halaman offline.
const shellWarmer = new NetworkFirst({ cacheName: "others" });

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.allSettled(
      SHELL_ROUTES.map((url) =>
        shellWarmer.handle({ request: new Request(url), event }),
      ),
    ).then(() => undefined),
  );
});
