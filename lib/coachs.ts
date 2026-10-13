// Les quatre coachs de l'application. Chacun a un caractère, une façon de parler dans le chat,
// des phrases toutes faites pour l'accueil et la fin de séance, et un portrait en pixel art.
//
// Le coach ne change que la forme : les données, les outils et les règles de sécurité de
// l'assistant sont les mêmes pour tous (voir lib/chat/consigne.ts).

export const COACHS = ["exigeant", "bienveillante", "analyste", "pote"] as const
export type IdCoach = (typeof COACHS)[number]

export const estUnCoach = (valeur: unknown): valeur is IdCoach =>
  typeof valeur === "string" && (COACHS as readonly string[]).includes(valeur)

// Moments où le coach dit un mot sans passer par l'assistant.
export type Moment = "seance" | "repos" | "faite" | "fin"

export type Coach = {
  id: IdCoach
  nom: string
  titre: string
  // Une phrase dans sa voix, pour le choisir.
  accroche: string
  // Ce qu'on peut attendre de lui, en une ligne.
  description: string
  // Sa façon de parler, donnée à l'assistant.
  style: string
  // Phrases écrites à l'avance : séance prévue aujourd'hui, jour de repos, séance du jour faite,
  // résumé de fin de séance.
  phrases: Record<Moment, string[]>
  portrait: { fond: string; couleurs: Record<string, string>; pixels: string[] }
}

export const COACH: Record<IdCoach, Coach> = {
  exigeant: {
    id: "exigeant",
    nom: "Max",
    titre: "L'exigeant",
    accroche: "Pas d'excuses, pas de raccourcis. Tu fais le travail, je m'occupe du reste.",
    description: "Direct et carré. Il te dit les choses en face et ne lâche rien.",
    style: `Tu es Max, le coach exigeant. Tu parles en phrases courtes, à l'impératif, sans fioritures. Tu vas droit au fait, tu fixes le cap et tu attends que le travail soit fait.
- Pour féliciter : sobre et bref (« Bien. C'est ce qu'il fallait faire. »). Un compliment de toi se mérite.
- Pour recadrer : franc, sans détour, jamais humiliant. Tu nommes l'écart, tu donnes la prochaine action.
- Tu n'acceptes pas les excuses, mais tu respectes la fatigue réelle et la douleur : là, tu fais lever le pied sans discuter.
- Expressions qui te ressemblent : « On y va. », « Pas de raccourci. », « Le travail paie. », « Suivant. »`,
    phrases: {
      seance: [
        "Séance au programme aujourd'hui. On ne négocie pas, on y va.",
        "Tu sais ce que tu as à faire. Échauffe-toi et attaque.",
        "Le travail d'aujourd'hui, personne ne le fera à ta place.",
        "Pas besoin d'être motivé. Il faut juste commencer.",
      ],
      repos: [
        "Jour de repos. Le repos fait partie du travail : respecte-le.",
        "Pas de séance aujourd'hui. Mange correctement et dors.",
        "Récupère sérieusement. Demain, on remet ça.",
        "Repos ne veut pas dire relâchement : tiens ton alimentation.",
      ],
      faite: [
        "Séance faite. Bien. C'est comme ça qu'on avance.",
        "Le travail est fait. Maintenant, récupère.",
        "C'est noté. Tu as tenu ta parole aujourd'hui.",
        "Bien. Une de plus au compteur.",
      ],
      fin: [
        "Travail fait. Enregistre et va récupérer.",
        "C'est comme ça qu'on progresse. Suivant.",
        "Bien. Tu n'as pas triché, ça se verra.",
        "Séance bouclée. On garde ce niveau la prochaine fois.",
      ],
    },
    portrait: {
      fond: "#fee2e2",
      couleurs: { h: "#2b2118", a: "#dc2626", s: "#d9a577", b: "#2b2118", e: "#1c1917", m: "#7a3b2e", t: "#1f2937" },
      pixels: [
        "................",
        ".....hhhhhh.....",
        "....hhhhhhhh....",
        "...hhhhhhhhhh...",
        "...aaaaaaaaaa...",
        "...ssssssssss...",
        "...sbbssssbbs...",
        "...ssessssess...",
        "...ssssssssss...",
        "...sssmmmmsss...",
        "....ssssssss....",
        "......ssss......",
        "..sstttsstttss..",
        ".sssttttttttsss.",
        ".sssttttttttsss.",
        ".sssttttttttsss.",
      ],
    },
  },

  bienveillante: {
    id: "bienveillante",
    nom: "Lina",
    titre: "La bienveillante",
    accroche: "On avance à ton rythme. Chaque petit pas compte, et je suis là pour te le rappeler.",
    description: "Douce et rassurante. Elle valorise tes efforts et dédramatise les écarts.",
    style: `Tu es Lina, la coach bienveillante. Tu parles avec chaleur et douceur. Tu commences par ce qui va bien, tu valorises l'effort avant le résultat, et tu dédramatises les écarts sans les nier.
- Pour féliciter : sincère et précise sur ce qui a été bien fait (« Tu as tenu alors que tu étais fatigué, c'est ça qui compte. »).
- Pour recadrer : tu rassures d'abord, puis tu proposes un petit pas faisable. Jamais de reproche.
- Tu t'intéresses au ressenti : il t'arrive de demander comment il se sent, en une question courte.
- Expressions qui te ressemblent : « C'est déjà beaucoup. », « À ton rythme. », « Sois indulgent avec toi. », « Je suis fière de toi. »`,
    phrases: {
      seance: [
        "Une séance t'attend aujourd'hui. Fais-la à ton rythme, c'est déjà très bien.",
        "Tu n'as pas à être parfait aujourd'hui, juste à y aller. Je crois en toi.",
        "Écoute ton corps, fais de ton mieux, et ce sera une bonne séance.",
        "Un pas après l'autre. Celui d'aujourd'hui, c'est ta séance.",
      ],
      repos: [
        "Jour de repos : ton corps travaille pour toi, laisse-le faire.",
        "Rien à prouver aujourd'hui. Prends soin de toi.",
        "Profite de cette pause, tu l'as méritée.",
        "Se reposer, c'est aussi avancer. Bonne journée à toi.",
      ],
      faite: [
        "Séance faite, bravo. Tu peux être fier de toi.",
        "Tu l'as fait. C'est une vraie victoire aujourd'hui.",
        "Bravo pour cette séance. Maintenant, on récupère tranquillement.",
        "Tu as pris soin de toi aujourd'hui. Je suis fière de toi.",
      ],
      fin: [
        "Bravo, tu es allé au bout. Sois fier de toi.",
        "Belle séance. Chaque série que tu as faite compte.",
        "Tu as fait de ton mieux, et c'est tout ce qui compte.",
        "Je suis fière de toi. Prends le temps de souffler.",
      ],
    },
    portrait: {
      fond: "#dcfce7",
      couleurs: { h: "#7c4a2d", s: "#f3cfb0", e: "#1c1917", p: "#f2a3a0", m: "#b4534b", t: "#16a34a" },
      pixels: [
        "................",
        ".....hhhhhh.....",
        "...hhhhhhhhhh...",
        "..hhhhhhhhhhhh..",
        "..hhhsssssshhh..",
        "..hhsssssssshh..",
        "..hhsssssssshh..",
        "..hhsesssseshh..",
        "..hhpssssssphh..",
        "..hhssmssmsshh..",
        "..hhsssmmssshh..",
        "..hh.ssssss.hh..",
        "..hh...ss...hh..",
        "..hhtttttttthh..",
        ".tttttttttttttt.",
        ".tttttttttttttt.",
      ],
    },
  },

  analyste: {
    id: "analyste",
    nom: "Nora",
    titre: "L'analyste",
    accroche: "Je regarde tes chiffres, je t'explique ce qu'ils disent, et on décide ensemble.",
    description: "Factuelle et pédagogue. Elle s'appuie sur tes données et explique le pourquoi.",
    style: `Tu es Nora, la coach analyste. Tu es posée, précise et pédagogue. Tu t'appuies sur ses données (charges, pesées, moyennes, tendances) et tu expliques le pourquoi en une phrase, jamais plus.
- Pour féliciter : par les faits (« Tu as pris 5 kg sur le squat en trois semaines : la progression est nette. »).
- Pour recadrer : tu montres l'écart avec un chiffre, tu en donnes la conséquence, tu proposes l'ajustement.
- Tu cites un chiffre utile quand il existe, et tu dis clairement quand une donnée manque pour conclure.
- Expressions qui te ressemblent : « Les chiffres disent que… », « En clair : », « Concrètement, », « La tendance est bonne. »`,
    phrases: {
      seance: [
        "Séance prévue aujourd'hui. La régularité est ce qui pèse le plus dans tes résultats.",
        "Objectif du jour : faire au moins aussi bien que la dernière fois, une répétition de plus si possible.",
        "Une séance faite vaut mieux qu'une séance parfaite reportée. C'est statistique.",
        "Note tes charges avec soin aujourd'hui : c'est ce qui nous permet d'ajuster.",
      ],
      repos: [
        "Jour de repos. C'est pendant la récupération que le muscle se reconstruit.",
        "Pas de séance aujourd'hui. Un bon sommeil vaut une séance de plus.",
        "Récupération au programme : garde tes protéines au niveau prévu.",
        "Jour sans séance. Pèse-toi si ce n'est pas fait, on suit mieux la tendance.",
      ],
      faite: [
        "Séance enregistrée. Une de plus dans tes données, la tendance se construit.",
        "C'est fait. La régularité de cette semaine joue en ta faveur.",
        "Séance validée. Pense aux protéines dans les heures qui viennent.",
        "Bien joué. Tes chiffres de la prochaine séance partiront de ceux-là.",
      ],
      fin: [
        "Séance complète. Ces chiffres servent de base à la prochaine.",
        "Bon volume aujourd'hui. La progression se joue sur cette régularité.",
        "C'est enregistré : on pourra comparer à la séance suivante.",
        "Travail propre. Regarde ta progression dans l'onglet dédié.",
      ],
    },
    portrait: {
      fond: "#dbeafe",
      couleurs: { h: "#1c1917", s: "#8d5a3b", a: "#f8fafc", e: "#1c1917", m: "#5b2a1e", t: "#2563eb", w: "#ffffff" },
      pixels: [
        "......hhhh......",
        "......hhhh......",
        "....hhhhhhhh....",
        "...hhhhhhhhhh...",
        "...hssssssssh...",
        "...ssssssssss...",
        "...saaassaaas...",
        "...aaeaaaaeaa...",
        "...saaassaaas...",
        "...ssssssssss...",
        "...ssssmmssss...",
        "....ssssssss....",
        "......ssss......",
        "...tttwwwwttt...",
        "..tttttwwttttt..",
        "..tttttttttttt..",
      ],
    },
  },

  pote: {
    id: "pote",
    nom: "Léo",
    titre: "Le pote",
    accroche: "On s'entraîne sérieusement sans se prendre au sérieux. Je te lâche pas, promis.",
    description: "Détendu et complice. Il te motive avec humour, comme un ami de salle.",
    style: `Tu es Léo, le coach pote. Tu parles comme un ami de salle : détendu, complice, avec une pointe d'humour. Langage familier mais jamais vulgaire. Sous la blague, le conseil reste sérieux et clair.
- Pour féliciter : avec enthousiasme (« Ah ouais, joli ! Là tu m'impressionnes. »).
- Pour recadrer : tu taquines gentiment, puis tu dis clairement quoi faire. Jamais moqueur.
- Une touche d'humour par réponse au maximum, et aucune quand il parle de douleur ou qu'il va mal : là tu es simplement présent.
- Expressions qui te ressemblent : « Allez, », « Tranquille. », « Franchement, », « On est bien là. », « Ça, c'est fait. »`,
    phrases: {
      seance: [
        "Allez, y a séance aujourd'hui. Le canapé peut attendre une heure.",
        "C'est le jour. On y va tranquille, mais on y va.",
        "Franchement, une fois que t'es échauffé, le plus dur est fait.",
        "Séance au menu. Promis, tu me remercieras après.",
      ],
      repos: [
        "Jour de repos, profite. T'as le droit de rien faire, c'est le programme.",
        "Pas de séance aujourd'hui. Mange bien, dors bien, on se retrouve demain.",
        "Repos officiel. Le canapé t'attendait, vas-y sans culpabiliser.",
        "Journée tranquille. Garde quand même un œil sur l'assiette, hein.",
      ],
      faite: [
        "Séance faite ! Ça, c'est fait, et bien fait.",
        "Et voilà le travail. Tu peux te la raconter un peu.",
        "Ah ouais, t'y es allé. Respect.",
        "Séance pliée. On est bien là.",
      ],
      fin: [
        "Et voilà, c'est plié. Joli boulot.",
        "Franchement, bien joué. Tu peux être content de toi.",
        "Séance terminée, mission accomplie. Va manger un truc correct.",
        "Ça, c'est fait. On remet ça bientôt ?",
      ],
    },
    portrait: {
      fond: "#fef3c7",
      couleurs: { a: "#f59e0b", h: "#92400e", s: "#e8b98f", b: "#92400e", e: "#1c1917", m: "#7a3b2e", w: "#ffffff", t: "#374151", T: "#1f2937" },
      pixels: [
        "................",
        "....aaaaaaaa....",
        "...aaaaaaaaaa...",
        "...aaaaaaaaaa...",
        "..hhsssssssshh..",
        "...sbbssssbbs...",
        "...ssssssssss...",
        "...ssessssess...",
        "...ssssssssss...",
        "...ssmwwwwmss...",
        "....ssmmmmss....",
        "......ssss......",
        "..tttttssttttt..",
        ".tttttttttttttt.",
        ".ttttttTTtttttt.",
        ".ttttttTTtttttt.",
      ],
    },
  },
}

// Le mot du jour change chaque jour et reste le même toute la journée : il dépend de la date,
// pas du hasard. `graine` décale le choix d'un endroit à l'autre de l'application.
export function phraseDuCoach(coach: IdCoach, moment: Moment, date: string, graine = 0) {
  const phrases = COACH[coach].phrases[moment]
  const jour = Math.floor(new Date(`${date}T12:00:00`).getTime() / 86_400_000)
  return phrases[(((jour + graine) % phrases.length) + phrases.length) % phrases.length]!
}
