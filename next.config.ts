import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // La pastille de dev de Next.js se pose sur la barre de navigation basse.
  devIndicators: false,
  // Le SDK Anthropic est chargé tel quel par Node, pas recompilé par le bundler : une fois
  // recompilé, son Tool Runner échoue au premier appel d'outil (« Cannot read private member »).
  serverExternalPackages: ["@anthropic-ai/sdk"],
  // Identifiant de la version construite : le service worker s'en sert pour repartir d'un
  // cache neuf à chaque mise en ligne.
  env: { NEXT_PUBLIC_VERSION: Date.now().toString(36) },
};

export default nextConfig;
