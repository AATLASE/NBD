import { crc32, deflateSync } from "node:zlib"

import { COACH, estUnCoach } from "@/lib/coachs"

// Portrait d'un coach en PNG (/portraits/exigeant.png) : l'icône de ses notifications. Le
// téléphone n'affiche pas de SVG à cet endroit ; l'image est donc dessinée ici, pixel par pixel,
// à partir du même portrait que l'application (lib/coachs.ts).

const ECHELLE = 12
const COTE = 16 * ECHELLE

const rvb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))

function bloc(type: string, donnees: Buffer) {
  const longueur = Buffer.alloc(4)
  longueur.writeUInt32BE(donnees.length)
  const corps = Buffer.concat([Buffer.from(type, "ascii"), donnees])
  const controle = Buffer.alloc(4)
  controle.writeUInt32BE(crc32(corps))
  return Buffer.concat([longueur, corps, controle])
}

function dessiner(fond: string, couleurs: Record<string, string>, pixels: string[]) {
  // Une ligne d'image : un octet de filtre (0, aucun) puis les pixels en rouge, vert, bleu.
  const ligne = 1 + COTE * 3
  const image = Buffer.alloc(ligne * COTE)
  for (let y = 0; y < COTE; y++) {
    const rangee = pixels[Math.floor(y / ECHELLE)] ?? ""
    for (let x = 0; x < COTE; x++) {
      const couleur = couleurs[rangee[Math.floor(x / ECHELLE)] ?? "."] ?? fond
      image.set(rvb(couleur), y * ligne + 1 + x * 3)
    }
  }
  const entete = Buffer.alloc(13)
  entete.writeUInt32BE(COTE, 0)
  entete.writeUInt32BE(COTE, 4)
  entete.set([8, 2, 0, 0, 0], 8) // 8 bits par canal, couleurs sans transparence
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    bloc("IHDR", entete),
    bloc("IDAT", deflateSync(image)),
    bloc("IEND", Buffer.alloc(0)),
  ])
}

export async function GET(_requete: Request, { params }: { params: Promise<{ fichier: string }> }) {
  const id = (await params).fichier.replace(/\.png$/, "")
  if (!estUnCoach(id)) return new Response("Portrait introuvable", { status: 404 })
  const { fond, couleurs, pixels } = COACH[id].portrait
  return new Response(new Uint8Array(dessiner(fond, couleurs, pixels)), {
    headers: { "content-type": "image/png", "cache-control": "public, max-age=86400" },
  })
}
