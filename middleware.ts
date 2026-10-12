import type { NextRequest } from "next/server"

import { updateSession } from "@/lib/supabase/middleware"

export async function middleware(request: NextRequest) {
  try {
    return await updateSession(request)
  } catch (erreur) {
    // Une panne ici rend tout le site illisible, avec une erreur opaque de l'hébergeur
    // (MIDDLEWARE_INVOCATION_FAILED). On dit plutôt laquelle.
    console.error("[middleware]", erreur)
    const detail = erreur instanceof Error ? erreur.message : String(erreur)
    return new Response(`Le site ne peut pas répondre : ${detail}`, {
      status: 500,
      headers: { "content-type": "text/plain; charset=utf-8" },
    })
  }
}

export const config = {
  matcher: [
    // Tout sauf les fichiers statiques, les images, le service worker et le manifest :
    // ces deux derniers doivent se charger sans session, sinon l'installation échoue.
    "/((?!_next/static|_next/image|sw\\.js|manifest\\.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
}
