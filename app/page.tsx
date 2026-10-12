import { redirect } from "next/navigation"

// L'écran d'accueil est l'onglet « Aujourd'hui » de la section Sport.
export default function Accueil() {
  redirect("/sport")
}
