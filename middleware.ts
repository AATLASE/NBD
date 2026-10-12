import type { NextRequest } from "next/server"

import { updateSession } from "@/lib/supabase/middleware"

export async function middleware(request: NextRequest) {
  return updateSession(request)
}

export const config = {
  matcher: [
    // Tout sauf les fichiers statiques, les images, le service worker et le manifest :
    // ces deux derniers doivent se charger sans session, sinon l'installation échoue.
    "/((?!_next/static|_next/image|sw\\.js|manifest\\.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
}
