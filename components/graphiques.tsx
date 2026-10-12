"use client"

import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import { nombre } from "@/lib/format"

// Graphiques de l'application. Règles suivies partout :
//   une seule échelle par graphique (deux mesures d'ordres de grandeur différents = deux graphiques)
//   les séries prennent --chart-1 puis --chart-2, dans cet ordre, validées en clair et en sombre
//   le texte (axes, légende, info-bulle) porte les couleurs de texte, jamais celle d'une série
//   pas d'animation d'entrée : la donnée est lisible tout de suite
// Chaque graphique est accompagné, dans l'écran qui l'utilise, d'une liste des mêmes valeurs.

export type Serie = {
  cle: string
  nom: string
  // Points seuls (mesures brutes) ou ligne continue.
  trace?: "ligne" | "points"
}

type Point = { libelle: string } & Record<string, number | string | null>

const COULEURS = ["var(--chart-1)", "var(--chart-2)"]
const AXE = { fontSize: 12, fill: "var(--muted-foreground)" }
const HAUTEUR = 208
// Au-delà, un marqueur par point transforme la ligne en chapelet : on ne garde que le tracé.
const POINTS_MAX_AVEC_MARQUEURS = 14

// Largeur de l'axe vertical, d'après sa plus longue graduation.
function largeurAxe(valeurs: number[]) {
  const plusLongue = Math.max(...valeurs.map((v) => nombre(Math.round(v)).length), 1)
  return 14 + plusLongue * 7
}

function Bulle({
  active,
  label,
  payload,
  unite,
}: {
  active?: boolean
  label?: string
  payload?: { name?: string; value?: number | string | null; color?: string }[]
  unite: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-md">
      <p className="font-medium first-letter:uppercase">{label}</p>
      <ul className="mt-1 space-y-0.5">
        {payload
          .filter((ligne) => typeof ligne.value === "number")
          .map((ligne) => (
            <li key={ligne.name} className="flex items-center gap-2 tabular-nums">
              <span aria-hidden="true" className="size-2.5 rounded-full" style={{ background: ligne.color }} />
              <span className="text-muted-foreground">{ligne.name}</span>
              <span className="ml-auto pl-3 font-semibold">
                {nombre(ligne.value as number)} {unite}
              </span>
            </li>
          ))}
      </ul>
    </div>
  )
}

function Legende({ series }: { series: Serie[] }) {
  // Une seule série : le titre de la section la nomme déjà.
  if (series.length < 2) return null
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 px-1 text-sm text-muted-foreground">
      {series.map((serie, index) => (
        <li key={serie.cle} className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className={serie.trace === "points" ? "size-2.5 rounded-full" : "h-0.5 w-4 rounded-full"}
            style={{ background: COULEURS[index] }}
          />
          {serie.nom}
        </li>
      ))}
    </ul>
  )
}

export function Courbe({
  resume,
  donnees,
  series,
  unite,
  domaine,
  seuil,
}: {
  // Phrase lue par un lecteur d'écran à la place du dessin.
  resume: string
  donnees: Point[]
  series: Serie[]
  unite: string
  domaine?: [number, number]
  seuil?: { valeur: number; libelle: string }
}) {
  const valeurs = donnees.flatMap((point) =>
    series.map((serie) => point[serie.cle]).filter((v): v is number => typeof v === "number")
  )
  // La densité se juge au nombre de mesures réelles, pas au nombre de jours affichés :
  // sur 30 jours avec 3 mesures, chacune garde son marqueur, même isolée.
  const dense = valeurs.length / series.length > POINTS_MAX_AVEC_MARQUEURS

  return (
    <figure className="space-y-2">
      <Legende series={series} />
      <div role="img" aria-label={resume} style={{ height: HAUTEUR }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={donnees} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis
              dataKey="libelle"
              tick={AXE}
              tickLine={false}
              axisLine={{ stroke: "var(--border)" }}
              minTickGap={24}
              tickMargin={6}
            />
            <YAxis
              width={largeurAxe(domaine ?? valeurs)}
              tick={AXE}
              tickLine={false}
              axisLine={false}
              domain={domaine ?? ["auto", "auto"]}
              // Échelle fixe : graduations régulières (0, 2, 4… sur une échelle de 0 à 10).
              tickCount={domaine ? 6 : undefined}
              tickFormatter={(valeur: number) => nombre(valeur)}
              allowDecimals={false}
            />
            <Tooltip
              content={<Bulle unite={unite} />}
              cursor={{ stroke: "var(--muted-foreground)", strokeDasharray: "3 3" }}
            />
            {seuil && (
              <ReferenceLine
                y={seuil.valeur}
                stroke="var(--muted-foreground)"
                strokeDasharray="4 4"
                // Le repère reste dans le cadre même si aucune mesure ne s'en approche.
                ifOverflow="extendDomain"
                label={{ value: seuil.libelle, position: "insideTopLeft", ...AXE }}
              />
            )}
            {series.map((serie, index) => (
              <Line
                key={serie.cle}
                type="monotone"
                dataKey={serie.cle}
                name={serie.nom}
                stroke={COULEURS[index]}
                strokeWidth={serie.trace === "points" ? 0 : 2}
                // Marqueurs de 8 px cerclés de la couleur de fond : lisibles même superposés.
                // Sur une série dense, la ligne perd ses marqueurs et les points bruts rétrécissent.
                dot={
                  dense && serie.trace !== "points"
                    ? false
                    : { r: dense ? 3 : 4, fill: COULEURS[index], stroke: "var(--card)", strokeWidth: dense ? 1 : 2 }
                }
                activeDot={{ r: 6, fill: COULEURS[index], stroke: "var(--card)", strokeWidth: 2 }}
                connectNulls
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </figure>
  )
}

export function Barres({
  resume,
  donnees,
  nom,
  unite,
  seuil,
}: {
  resume: string
  donnees: { libelle: string; valeur: number }[]
  nom: string
  unite: string
  // Repère horizontal : une cible à atteindre ou à ne pas dépasser.
  seuil?: { valeur: number; libelle: string }
}) {
  return (
    <figure role="img" aria-label={resume} style={{ height: HAUTEUR }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={donnees} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis
            dataKey="libelle"
            tick={AXE}
            tickLine={false}
            axisLine={{ stroke: "var(--border)" }}
            minTickGap={8}
            tickMargin={6}
          />
          <YAxis
            width={largeurAxe([...donnees.map((d) => d.valeur), seuil?.valeur ?? 0])}
            tick={AXE}
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
            tickFormatter={(valeur: number) => nombre(valeur)}
          />
          <Tooltip content={<Bulle unite={unite} />} cursor={{ fill: "var(--muted)" }} />
          {seuil && (
            <ReferenceLine
              y={seuil.valeur}
              stroke="var(--muted-foreground)"
              strokeDasharray="4 4"
              ifOverflow="extendDomain"
              label={{ value: seuil.libelle, position: "insideTopLeft", ...AXE }}
            />
          )}
          <Bar
            dataKey="valeur"
            name={nom}
            fill="var(--chart-1)"
            radius={[4, 4, 0, 0]}
            maxBarSize={28}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    </figure>
  )
}
