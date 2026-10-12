import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

import type { Database } from "@/lib/database.types"

const ROUTES_PUBLIQUES = ["/login", "/auth"]

export async function updateSession(request: NextRequest) {
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
