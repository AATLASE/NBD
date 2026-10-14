"use client"

import { useQueryClient } from "@tanstack/react-query"
import { Check, Sparkles, X } from "lucide-react"
import { useState } from "react"

import { Carte, Section } from "@/components/blocs"
import { DiffAvantApres } from "@/components/chat/message"
import { AvatarCoach } from "@/components/coach/avatar"
import { Button } from "@/components/ui/button"
import type { LigneDiff } from "@/lib/chat/types"
import { COACH, estUnCoach, type IdCoach } from "@/lib/coachs"
import { annoncer, useEdition } from "@/lib/edition"
import { accepterAjustement, refuserAjustement } from "@/lib/mutations"
import { useAjustements, useProfil, type Ajustement } from "@/lib/queries"

// Les ajustements que l'application propose d'elle-même après une séance. Rien ne change dans
// le programme tant que l'utilisateur n'a pas appuyé sur « Accepter ».
export function AjustementsProposes() {
  const ajustements = useAjustements()
  const profil = useProfil()
  const idCoach = estUnCoach(profil.data?.coach) ? profil.data.coach : null
  if (!ajustements.data || ajustements.data.length === 0) return null

  return (
    <Section titre="À valider">
      <ul className="space-y-3">
        {ajustements.data.map((ajustement) => (
          <li key={ajustement.id}>
            <CarteAjustement ajustement={ajustement} idCoach={idCoach} />
          </li>
        ))}
      </ul>
    </Section>
  )
}

function CarteAjustement({ ajustement, idCoach }: { ajustement: Ajustement; idCoach: IdCoach | null }) {
  const queryClient = useQueryClient()
  const { executer, enCours } = useEdition()
  const [refus, setRefus] = useState(false)
  const diff = (Array.isArray(ajustement.diff) ? ajustement.diff : []) as unknown as LigneDiff[]
  const sansLui = (liste: Ajustement[]) => liste.filter((a) => a.id !== ajustement.id)

  async function refuser() {
    setRefus(true)
    const resultat = await refuserAjustement(ajustement.id).catch(() => ({ ok: false as const, message: "Pas de réseau. Réessaie." }))
    if (!resultat.ok) annoncer(resultat.message, { erreur: true })
    await queryClient.invalidateQueries({ queryKey: ["ajustements"] })
    setRefus(false)
  }

  return (
    <Carte className="overflow-hidden border-2 border-brand/50">
      <div className="flex items-start gap-3 px-4 pt-4">
        {idCoach ? (
          <AvatarCoach coach={idCoach} className="size-10 shrink-0 rounded-lg" />
        ) : (
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand">
            <Sparkles className="size-5" aria-hidden="true" />
          </span>
        )}
        <div className="min-w-0 space-y-0.5">
          <p className="text-sm font-semibold text-brand">
            {idCoach ? `${COACH[idCoach].nom} propose` : "Proposé après ta séance"}
          </p>
          <p className="leading-snug font-semibold">{ajustement.resume}</p>
        </div>
      </div>
      <p className="px-4 pt-3 leading-relaxed text-muted-foreground">{ajustement.explication}</p>
      {diff.length > 0 && <DiffAvantApres diff={diff} className="px-4 pt-3" />}
      <div className="mt-4 grid grid-cols-2 gap-2 border-t p-3">
        <Button variant="outline" className="h-12 gap-2 text-base font-semibold" disabled={enCours || refus} onClick={refuser}>
          <X className="size-5" aria-hidden="true" />
          Refuser
        </Button>
        <Button
          className="h-12 gap-2 text-base font-semibold"
          disabled={enCours || refus}
          onClick={() =>
            void executer(() => accepterAjustement(ajustement.id), { cle: ["ajustements"], maj: sansLui })
          }
        >
          <Check className="size-5" aria-hidden="true" />
          Accepter
        </Button>
      </div>
    </Carte>
  )
}
