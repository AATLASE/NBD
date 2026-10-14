"use client"

import { useQueryClient } from "@tanstack/react-query"
import { useActionState, useEffect } from "react"

import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { effacerDonneesLocales } from "@/lib/persistance"

import { envoyerLienMagique, verifierCode, type EtatConnexion } from "./actions"

const ETAT_INITIAL: EtatConnexion = { statut: "initial" }

export function LoginForm({ erreurLien }: { erreurLien: boolean }) {
  const queryClient = useQueryClient()
  const [etat, action, enCours] = useActionState(envoyerLienMagique, ETAT_INITIAL)

  // Arriver ici, c'est ne plus avoir de session : rien du compte précédent ne reste sur le téléphone.
  useEffect(() => effacerDonneesLocales(queryClient), [queryClient])

  if (etat.statut === "envoye" && etat.email) {
    return (
      <div className="space-y-6">
        {etat.boiteLocale ? (
          <div className="space-y-2" role="status">
            <p className="font-medium">Lien généré.</p>
            <p className="text-sm text-muted-foreground">
              En local, aucun mail ne part vers {etat.email}. Le message t&apos;attend dans la boîte de
              test.
            </p>
            <a
              href={etat.boiteLocale}
              target="_blank"
              rel="noreferrer"
              className={buttonVariants({ className: "h-12 w-full text-base" })}
            >
              Ouvrir la boîte de test
            </a>
          </div>
        ) : (
          <div className="space-y-2" role="status">
            <p className="font-medium">Lien envoyé.</p>
            <p className="text-sm text-muted-foreground">
              Ouvre le message reçu sur {etat.email} et appuie sur le lien pour te connecter.
            </p>
          </div>
        )}
        <FormulaireCode email={etat.email} />
      </div>
    )
  }

  const erreur =
    etat.statut === "erreur"
      ? etat.message
      : erreurLien
        ? "Ce lien a expiré ou a déjà servi. Demande-en un nouveau."
        : undefined

  return (
    <form action={action} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          required
          defaultValue={etat.email}
          aria-invalid={erreur ? true : undefined}
          aria-describedby={erreur ? "email-erreur" : undefined}
          className="h-12"
        />
        {erreur && (
          <p id="email-erreur" role="alert" className="text-sm text-destructive">
            {erreur}
          </p>
        )}
      </div>
      <Button type="submit" disabled={enCours} className="h-12 w-full text-base">
        {enCours ? "Envoi…" : "Recevoir mon lien de connexion"}
      </Button>
    </form>
  )
}

// L'application installée sur l'écran d'accueil ne partage pas sa session avec le navigateur :
// un lien ouvert depuis la messagerie connecterait le navigateur, pas l'application. Le code
// du même message, saisi ici, connecte l'endroit où on le tape.
function FormulaireCode({ email }: { email: string }) {
  const [etat, action, enCours] = useActionState(verifierCode, ETAT_INITIAL)
  const erreur = etat.statut === "erreur" ? etat.message : undefined

  return (
    <form action={action} className="space-y-4 border-t pt-6">
      <input type="hidden" name="email" value={email} />
      <div className="space-y-2">
        <Label htmlFor="code">Ou saisis le code du message</Label>
        <Input
          id="code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6,10}"
          maxLength={10}
          required
          aria-invalid={erreur ? true : undefined}
          aria-describedby={erreur ? "code-erreur" : "code-aide"}
          className="h-12 text-center text-xl font-semibold tracking-[0.3em] tabular-nums"
        />
        {erreur ? (
          <p id="code-erreur" role="alert" className="text-sm text-destructive">
            {erreur}
          </p>
        ) : (
          <p id="code-aide" className="text-sm text-muted-foreground">
            À utiliser si l&apos;application est installée sur ton écran d&apos;accueil.
          </p>
        )}
      </div>
      <Button type="submit" variant="outline" disabled={enCours} className="h-12 w-full text-base">
        {enCours ? "Vérification…" : "Me connecter avec ce code"}
      </Button>
    </form>
  )
}
