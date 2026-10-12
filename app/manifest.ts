import type { MetadataRoute } from "next"

// Manifest de l'application installable (SPEC, phase 8).
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "NBD · Sport et nutrition",
    short_name: "NBD",
    description: "Suivi personnel du programme de sport et de nutrition.",
    lang: "fr",
    start_url: "/sport",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#fafafa",
    theme_color: "#fafafa",
    categories: ["health", "fitness"],
    icons: [
      { src: "/icons/icone-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icone-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icone-masque-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  }
}
