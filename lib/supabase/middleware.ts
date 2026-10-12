import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

import type { Database } from "@/lib/database.types"

const ROUTES_PUBLIQUES = ["/login", "/auth"]

export async function updateSession(request: NextRequest) {
  // Sans ces deux valeurs, tout le site échouerait avec une erreur opaque de l'hébergeur.
  // Elles sont inscrites à la construction : après les avoir ajoutées, il faut redéployer.
  const adresse = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""
  const probleme = !adresse
    ? "l'adresse de Supabase n'était pas définie"
    : !/^https?:\/\/[^\s"']+$/.test(adresse)
      ? "l'adresse de Supabase n'est pas une adresse valide (elle doit commencer par https://, sans guillemets ni espace)"
      : !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
        ? "la clé publique de Supabase n'était pas définie"
        : null
  if (probleme) {
    return new NextResponse(
      `Configuration incomplète : ${probleme} quand cette version a été construite. Vérifie NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (ou NEXT_SUPABASE_URL et NEXT_SUPABASE_PUBLISHABLE_KEY) dans les variables d'environnement, puis redéploie.`,
      { status: 500, headers: { "content-type": "text/plain; charset=utf-8" } }
    )
  }

  let response = NextResponse.next({ request })

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Ne rien intercaler entre createServerClient et getClaims : c'est cet appel
  // qui rafraîchit le jeton et réécrit les cookies.
  const { data } = await supabase.auth.getClaims()
  const connecte = Boolean(data?.claims)

  const { pathname } = request.nextUrl
  const publique = ROUTES_PUBLIQUES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  )

  if (!connecte && !publique) {
    return rediriger(request, response, "/login")
  }
  if (connecte && pathname === "/login") {
    return rediriger(request, response, "/")
  }
  return response
}

// La redirection doit emporter les cookies de session éventuellement rafraîchis.
function rediriger(request: NextRequest, response: NextResponse, chemin: string) {
  const url = request.nextUrl.clone()
  url.pathname = chemin
  url.search = ""
  const redirection = NextResponse.redirect(url)
  response.cookies.getAll().forEach((cookie) => redirection.cookies.set(cookie))
  return redirection
}
