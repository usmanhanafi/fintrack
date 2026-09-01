import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "FinTrack",
    short_name: "FinTrack",
    description: "Pencatat keuangan pribadi yang jalan tanpa internet",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0d1016",
    theme_color: "#1f7a4d",
    lang: "id",
    dir: "ltr",
    categories: ["finance", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      {
        name: "Tambah pengeluaran",
        short_name: "Tambah",
        url: "/?add=expense",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
      },
      { name: "Laporan", short_name: "Laporan", url: "/reports" },
    ],
  };
}
