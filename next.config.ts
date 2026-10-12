import type { NextConfig } from "next";

// Adresse et clé publique de Supabase. Le code les lit sous leur nom NEXT_PUBLIC_*, qui les
// inscrit dans le code envoyé au navigateur. Un hébergeur peut refuser ce nom pour une variable
// contenant « KEY » : les mêmes valeurs sont donc aussi acceptées sans « PUBLIC », et inscrites
// ici sous le nom attendu. La clé « publishable » est faite pour être publique.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_SUPABASE_URL || "";
const supabaseCle =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_SUPABASE_PUBLISHABLE_KEY || "";

// Cette valeur part dans le code envoyé à chaque visiteur. Si ce n'est pas une clé publique de
// Supabase (une clé secrète collée dans la mauvaise variable, par exemple), la construction
// s'arrête ici plutôt que de la publier.
if (supabaseCle && !/^(sb_publishable_|eyJ)/.test(supabaseCle)) {
  throw new Error(
    "La clé publique de Supabase (NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ou NEXT_SUPABASE_PUBLISHABLE_KEY) n'en est pas une : " +
      "elle doit commencer par « sb_publishable_ ». La valeur fournie serait publiée dans le navigateur de chaque visiteur. " +
      "Si c'est une clé secrète, révoque-la et corrige la variable."
  );
}

const nextConfig: NextConfig = {
  // La pastille de dev de Next.js se pose sur la barre de navigation basse.
  devIndicators: false,
  // Pour une image Docker (NEXT_OUTPUT=standalone) : un serveur autonome, sans node_modules complet.
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
  // Le SDK Anthropic est chargé tel quel par Node, pas recompilé par le bundler : une fois
  // recompilé, son Tool Runner échoue au premier appel d'outil (« Cannot read private member »).
  serverExternalPackages: ["@anthropic-ai/sdk"],
  env: {
    NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: supabaseCle,
    // Identifiant de la version construite : le service worker s'en sert pour repartir d'un
    // cache neuf à chaque mise en ligne.
    NEXT_PUBLIC_VERSION: Date.now().toString(36),
  },
};

export default nextConfig;
