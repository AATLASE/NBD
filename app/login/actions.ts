"use server"

import { headers } from "next/headers"
import { redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"

export type EtatConnexion = {
  statut: "initial" | "envoye" | "erreur"
  message?: string
  email?: string
  // Renseigné uniquement en local, où aucun mail ne part réellement.
  boiteLocale?: string
}

const EMAIL_VALIDE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function envoyerLienMagique(
  _etat: EtatConnexion,
  formData: FormData
): Promise<EtatConnexion> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase()

  if (!EMAIL_VALIDE.test(email)) {
    return { statut: "erreur", message: "Adresse email invalide.", email }
  }

  // Application mono-utilisateur : si ALLOWED_EMAIL est défini, lui seul reçoit un lien.
  const autorise = process.env.ALLOWED_EMAIL?.trim().toLowerCase()
  if (autorise && email !== autorise) {
    return { statut: "erreur", message: "Cette adresse n'est pas autorisée.", email }
  }

  const origine = (await headers()).get("origin")
  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: origine ? `${origine}/auth/confirm` : undefined,
    },
  })

  if (error) {
    return {
      statut: "erreur",
      message:
        error.status === 429
          ? "Trop de demandes. Réessaie dans une minute."
          : "Envoi impossible. Vérifie ta connexion et réessaie.",
      email,
    }
  }

  return {
    statut: "envoye",
    email,
    boiteLocale: process.env.LOCAL_MAILBOX_URL?.trim() || undefined,
  }
}

// Connexion par le code à 6 chiffres du même message : la session s'ouvre là où le code est
// saisi, ce qui est le seul moyen de se connecter dans l'application installée sur iOS.
export async function verifierCode(_etat: EtatConnexion, formData: FormData): Promise<EtatConnexion> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase()
  const code = String(formData.get("code") ?? "").replace(/\s/g, "")
  if (!EMAIL_VALIDE.test(email) || !/^\d{6}$/.test(code)) {
    return { statut: "erreur", message: "Le code fait 6 chiffres.", email }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.verifyOtp({ email, token: code, type: "email" })
  if (error) {
    return {
      statut: "erreur",
      message: "Code incorrect ou expiré. Vérifie-le, ou demande un nouveau message.",
      email,
    }
  }
  // Directement vers l'accueil : « / » ne fait que rediriger, et une action serveur ne sait pas
  // suivre deux redirections d'affilée.
  redirect("/sport")
}

export async function seDeconnecter() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect("/login")
}
