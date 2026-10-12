"use client"

import { useEffect, useState } from "react"

// Signal de fin de repos : vibration là où elle existe (Android), sinon un double bip.
// iOS n'a pas d'API de vibration ; le bip est le seul signal possible sur iPhone.

let audio: AudioContext | null = null

// À appeler pendant un appui de l'utilisateur : un navigateur ne laisse jouer un son
// que si le contexte audio a été ouvert par un geste.
export function preparerSignal() {
  if (typeof navigator.vibrate === "function") return
  try {
    audio ??= new AudioContext()
    if (audio.state === "suspended") void audio.resume()
  } catch {
    audio = null
  }
}

export function signaler() {
  if (typeof navigator.vibrate === "function") {
    navigator.vibrate([250, 120, 250])
    return
  }
  if (!audio) return
  for (const debut of [0, 0.22]) {
    const oscillateur = audio.createOscillator()
    const volume = audio.createGain()
    oscillateur.frequency.value = 880
    volume.gain.value = 0.25
    oscillateur.connect(volume).connect(audio.destination)
    oscillateur.start(audio.currentTime + debut)
    oscillateur.stop(audio.currentTime + debut + 0.14)
  }
}

// Garde l'écran allumé pendant la séance. Le verrou saute quand l'onglet passe en arrière-plan :
// on le redemande au retour.
export function useEcranAllume() {
  useEffect(() => {
    if (!("wakeLock" in navigator)) return
    let verrou: WakeLockSentinel | null = null
    let actif = true

    const demander = async () => {
      if (!actif || document.visibilityState !== "visible") return
      try {
        verrou = await navigator.wakeLock.request("screen")
      } catch {
        // Refusé (batterie faible, contexte non sécurisé) : sans gravité.
      }
    }

    void demander()
    document.addEventListener("visibilitychange", demander)
    return () => {
      actif = false
      document.removeEventListener("visibilitychange", demander)
      void verrou?.release()
    }
  }, [])
}

// Horloge qui ne tourne que lorsqu'on en a besoin. Les minuteurs sont calculés depuis une heure
// de fin, pas en décomptant des tics : un écran verrouillé puis rallumé affiche le bon temps.
export function useMaintenant(actif: boolean, periodeMs = 250) {
  const [maintenant, setMaintenant] = useState(() => Date.now())

  useEffect(() => {
    if (!actif) return
    const tic = () => setMaintenant(Date.now())
    const intervalle = setInterval(tic, periodeMs)
    document.addEventListener("visibilitychange", tic)
    return () => {
      clearInterval(intervalle)
      document.removeEventListener("visibilitychange", tic)
    }
  }, [actif, periodeMs])

  return maintenant
}
