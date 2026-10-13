import { cn } from "cn"

import { COACH, type IdCoach } from "@/lib/coachs"

// Portrait d'un coach en pixel art : une grille de 16 × 16 pixels dessinée en SVG, nette à
// toutes les tailles. Décoratif par défaut : le nom du coach est toujours écrit à côté.
export function AvatarCoach({
  coach,
  className,
  titre = false,
}: {
  coach: IdCoach
  className?: string
  // Vrai quand le portrait est seul à identifier le coach.
  titre?: boolean
}) {
  const { nom, portrait } = COACH[coach]

  // Les pixels voisins d'une même couleur sont réunis en un seul rectangle par ligne.
  const rectangles: { x: number; y: number; largeur: number; couleur: string }[] = []
  portrait.pixels.forEach((ligne, y) => {
    let x = 0
    while (x < ligne.length) {
      const code = ligne[x]!
      let fin = x + 1
      while (fin < ligne.length && ligne[fin] === code) fin++
      const couleur = portrait.couleurs[code]
      if (couleur) rectangles.push({ x, y, largeur: fin - x, couleur })
      x = fin
    }
  })

  return (
    <svg
      viewBox="0 0 16 16"
      shapeRendering="crispEdges"
      role={titre ? "img" : undefined}
      aria-label={titre ? `Portrait de ${nom}` : undefined}
      aria-hidden={titre ? undefined : true}
      className={cn("size-12 shrink-0 rounded-xl", className)}
      style={{ backgroundColor: portrait.fond }}
    >
      {rectangles.map((r) => (
        <rect key={`${r.x}-${r.y}`} x={r.x} y={r.y} width={r.largeur} height={1} fill={r.couleur} />
      ))}
    </svg>
  )
}
