# SPEC : application de suivi sport et nutrition

Ce fichier est la spécification complète de l'application à construire. Lis-le en entier avant d'écrire la moindre ligne de code. Implémente-le phase par phase, dans l'ordre de la section 9, en me montrant le résultat à la fin de chaque phase.

---

## 1. Contexte et objectif

Application personnelle, mono-utilisateur, qui héberge mon programme de sport et mon programme nutritionnel, me permet de les modifier, de logger ce que je fais réellement, et de tout piloter en langage naturel via un chatbot intégré.

Profil de l'utilisateur, à utiliser comme valeurs par défaut :

| Donnée | Valeur |
| --- | --- |
| Taille | 173 cm |
| Poids de départ | 92 kg |
| Âge | 27 ans |
| Objectif calorique | 2 000 kcal par jour |
| Objectif protéines | 170 g par jour |
| Contrainte médicale | Fasciite plantaire chronique, côté droit |
| Budget courses | 30 à 40 € par semaine |

Usage principal : téléphone, en salle de sport, avec les mains sales et 90 secondes de repos entre deux séries. Toute interaction fréquente doit tenir en un ou deux appuis.

---

## 2. Stack imposée

- **Next.js 15**, App Router, TypeScript strict
- **Tailwind CSS** + **shadcn/ui**
- **Supabase** : base Postgres, Auth (magic link email), Row Level Security activée sur toutes les tables
- **PWA installable** : manifest, service worker, fonctionne hors ligne en lecture seule avec synchronisation au retour du réseau
- **Chatbot** : API Anthropic, modèle Claude, en **tool use** (function calling). La clé API vit uniquement côté serveur, dans une route API Next.js. Jamais exposée au client.
- Déploiement visé : Vercel

Pas de state manager externe. React Query (TanStack Query) pour le cache et les mutations optimistes.

---

## 3. Principes de conception non négociables

1. **Mobile-first.** Tout est conçu pour un écran de 390 px de large. Le desktop est une adaptation, pas l'inverse.
2. **Zéro saisie clavier pendant une séance.** Logger une série se fait avec des steppers (plus et moins) pré-remplis avec la valeur de la séance précédente.
3. **Chaque modification est réversible.** Toute écriture passe par la table `change_log` et peut être annulée.
4. **Aucune donnée en dur dans le code.** Les programmes vivent en base, alimentés par le seed de la section 8. Le code ne doit jamais contenir un nom d'exercice ou un repas en littéral.
5. **Le protocole pied est protégé.** Voir la règle de sécurité en section 7.4.
6. **Chargement instantané perçu.** Mutations optimistes partout, skeleton loaders, jamais de spinner plein écran après le premier chargement.

---

## 4. Modèle de données

Crée ces tables dans Supabase, avec RLS `user_id = auth.uid()` sur toutes, en lecture et en écriture.

```sql
-- Profil et objectifs
create table profiles (
  id uuid primary key references auth.users on delete cascade,
  taille_cm int not null default 173,
  poids_initial_kg numeric not null default 92,
  objectif_kcal int not null default 2000,
  objectif_proteines_g int not null default 170,
  objectif_lipides_g int not null default 65,
  objectif_glucides_g int not null default 180,
  budget_courses_eur numeric default 35,
  created_at timestamptz default now()
);

-- SPORT ------------------------------------------------------------

create table exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  nom text not null,
  groupe text not null,            -- 'jambes','dos','pectoraux','epaules','bras','gainage','agilite','pied','cardio'
  equipement text,                 -- 'barre','halteres','poulie','machine','poids_du_corps','kettlebell','aucun'
  note text,
  archived boolean default false
);

create table workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  code text not null,              -- 'A','B','C','D','MAISON'
  nom text not null,
  lieu text not null,              -- 'salle','maison','exterieur'
  duree_min int not null,
  jour_suggere text,               -- 'lundi','mercredi','vendredi','samedi'
  ordre int not null,
  archived boolean default false
);

create table workout_exercises (
  id uuid primary key default gen_random_uuid(),
  workout_id uuid not null references workouts on delete cascade,
  exercise_id uuid not null references exercises,
  ordre int not null,
  series int not null,
  reps_min int,
  reps_max int,
  duree_sec int,                   -- pour le gainage, alternative aux reps
  repos_sec int not null default 90,
  charge_depart_kg numeric,
  charge_cible_kg numeric,
  increment_kg numeric,
  note text
);

create table workout_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  workout_id uuid not null references workouts,
  date date not null default current_date,
  duree_min int,
  ressenti int,                    -- 1 à 5
  note text
);

create table set_logs (
  id uuid primary key default gen_random_uuid(),
  workout_log_id uuid not null references workout_logs on delete cascade,
  workout_exercise_id uuid not null references workout_exercises,
  serie_num int not null,
  charge_kg numeric,
  reps int,
  rir int                          -- répétitions en réserve, 0 à 5
);

-- PIED ET COURSE ----------------------------------------------------

create table foot_protocol_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  moment text not null,            -- 'reveil','journee','soir','jour_sur_deux'
  exercice text not null,
  dosage text not null,
  ordre int not null,
  actif boolean default true
);

create table foot_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  date date not null default current_date,
  douleur_matin int not null,      -- 0 à 10
  protocole_fait boolean default false,
  note text,
  unique (user_id, date)
);

create table running_plan (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  semaine int not null,
  protocole text not null,
  volume_km_cible numeric not null,
  statut text default 'a_venir'    -- 'a_venir','en_cours','valide','repete'
);

create table running_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  date date not null default current_date,
  km numeric not null,
  duree_min int,
  douleur_apres int,               -- 0 à 10
  douleur_lendemain int            -- 0 à 10, saisi le lendemain
);

create table body_metrics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  date date not null default current_date,
  poids_kg numeric,
  tour_taille_cm numeric,
  unique (user_id, date)
);

-- NUTRITION ---------------------------------------------------------

create table meals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  nom text not null,
  slot text not null,              -- 'petit_dej','collation_matin','dejeuner','collation_aprem','diner'
  kcal int not null,
  proteines_g int not null,
  lipides_g int,
  glucides_g int,
  temps_min int,
  recette_md text,                 -- markdown, affiché tel quel
  ingredients jsonb,               -- [{"nom":"riz","quantite":60,"unite":"g"}]
  tag text,                        -- 'secours','plaisir','batch','standard'
  archived boolean default false
);

create table meal_plan (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  semaine int not null,            -- 1 ou 2, le plan tourne sur 2 semaines
  jour text not null,              -- 'lundi' à 'dimanche'
  slot text not null,
  meal_id uuid references meals,
  unique (user_id, semaine, jour, slot)
);

create table meal_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  date date not null default current_date,
  slot text not null,
  meal_id uuid references meals,
  kcal_reel int,                   -- si écart avec le prévu
  proteines_reel int,
  hors_plan boolean default false, -- true si repas commandé ou improvisé
  note text
);

create table grocery_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  nom text not null,
  categorie text not null,         -- 'proteines','feculents','legumes','fruits','epicerie','laitages'
  quantite text,
  prix_eur numeric,
  proteines_par_euro numeric,
  recurrent boolean default true
);

create table grocery_list_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  semaine_du date not null,
  nom text not null,
  categorie text not null,
  quantite text,
  prix_eur numeric,
  coche boolean default false
);

-- CHATBOT ET HISTORIQUE ---------------------------------------------

create table chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  role text not null,              -- 'user','assistant'
  content text not null,
  tool_calls jsonb,
  created_at timestamptz default now()
);

create table change_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  table_name text not null,
  row_id uuid,
  operation text not null,         -- 'insert','update','delete'
  before_data jsonb,
  after_data jsonb,
  source text not null,            -- 'user','chatbot'
  resume text not null,            -- phrase lisible : "Squat remplacé par presse à cuisses dans la séance A"
  applied_at timestamptz default now(),
  undone_at timestamptz
);
```

Toute écriture dans les tables métier doit créer une ligne `change_log`. Implémente ça dans une couche serveur unique (`lib/mutations.ts`), jamais dispersée dans les composants.

---

## 5. Navigation et écrans

Barre de navigation basse, 3 entrées : **Sport**, **Nutrition**, **Chat**. Chaque section a ses propres sous-onglets en haut, scrollables horizontalement.

### 5.1 Section Sport

**Onglet « Aujourd'hui »** (écran d'accueil par défaut)
- La séance du jour selon `jour_suggere`, ou le bouton « Démarrer une séance » avec choix A, B, C, D
- Carte « Protocole pied » avec les items du jour et des cases à cocher
- Saisie rapide de la douleur matinale : un slider 0 à 10, une seule fois par jour, masqué une fois rempli
- Si la séance du jour est faite : résumé en une ligne et carte repliée

**Onglet « Séances »**
- Les 4 séances en cartes. Un appui ouvre le détail.
- Détail : liste ordonnée des exercices avec séries, reps, repos, charge de départ, charge cible
- Mode édition : réordonner par glisser-déposer, modifier chaque champ en ligne, ajouter ou supprimer un exercice, dupliquer une séance
- Bouton « Démarrer » qui bascule en mode exécution

**Mode exécution d'une séance** (l'écran le plus important de l'app)
- Un exercice à la fois, plein écran, navigation par balayage
- Pour chaque série : charge et reps pré-remplies avec la dernière valeur loggée, steppers plus/moins (pas de 2,5 kg pour la charge, 1 pour les reps)
- Bouton « Série validée » qui lance automatiquement le minuteur de repos, avec vibration à la fin
- Un champ RIR optionnel, en 5 boutons
- Historique du même exercice accessible en un appui, sous forme de 3 dernières séances
- À la fin : résumé, ressenti sur 5, enregistrement

**Onglet « Pied »**
- Le protocole complet, groupé par moment de la journée
- Progression des montées sur pointe selon la semaine en cours
- Courbe de la douleur matinale sur 30 jours
- Le feu tricolore : affiche vert, orange ou rouge selon les 7 derniers jours, avec la consigne associée

**Onglet « Course »**
- Le plan 9 semaines en liste, avec la semaine en cours mise en avant
- Les 2 conditions d'entrée en semaine 5, calculées automatiquement depuis `foot_logs` : « douleur ≤ 3 sur 7 jours consécutifs » cochée ou non
- Bouton pour logger une sortie
- **Blocage** : si la condition d'entrée n'est pas remplie, la semaine 5 affiche un bandeau rouge et le bouton de validation demande une confirmation explicite

**Onglet « Progression »**
- Courbe de poids avec moyenne mobile sur 7 jours
- Courbe du tour de taille
- Par exercice : évolution de la charge et du volume (charge × séries × reps)
- Nombre de séances faites par semaine, en barres

### 5.2 Section Nutrition

**Onglet « Aujourd'hui »**
- Les 5 slots du jour selon `meal_plan`, chacun avec une case à cocher
- Compteur en haut : kcal consommées sur 2 000, protéines sur 170, en deux barres de progression
- Bouton « Repas hors plan » qui ouvre une saisie libre avec kcal et protéines estimées
- Si un repas est coché après 21 h et marqué hors plan : affichage des 3 plats de secours en alternative, avant validation

**Onglet « Menus »**
- Les 2 semaines en grille jour par slot
- Un appui sur une case ouvre un sélecteur de repas filtré par slot
- Glisser-déposer pour échanger deux repas

**Onglet « Recettes »**
- Toutes les entrées de `meals` avec leur recette en markdown
- Filtres par slot et par tag
- Création et édition d'une recette, avec calcul automatique des macros si les ingrédients sont renseignés

**Onglet « Courses »**
- Génération de la liste à partir des menus de la semaine sélectionnée, en agrégeant les `ingredients` de chaque repas
- Groupée par catégorie, cases à cocher, total en euros affiché en permanence
- Comparaison avec le budget cible, en vert si dessous, en orange au-dessus
- Tableau « protéines par euro » consultable, trié décroissant

**Onglet « Suivi »**
- Moyenne calorique et protéique sur 7 et 30 jours
- Nombre de repas hors plan par semaine, en barres : c'est l'indicateur principal, l'objectif est de le faire baisser
- Coût estimé des courses par semaine

### 5.3 Section Chat

Voir section 7.

---

## 6. Règles de calcul

- **Semaine du programme** : calculée depuis la date de premier log. `semaine = floor((aujourd'hui - date_debut) / 7) + 1`, plafonnée à 9.
- **Feu tricolore du pied** : moyenne de `douleur_matin` sur les 7 derniers jours. Vert si ≤ 3 et aucun jour > 4. Orange si moyenne entre 3 et 5. Rouge si moyenne > 5 ou un jour ≥ 7.
- **Progression de charge suggérée** : si les 3 dernières séries d'un exercice ont été loggées avec RIR ≥ 3, proposer d'ajouter `increment_kg`. Proposition affichée dans le mode exécution, jamais appliquée automatiquement.
- **Macros d'une recette** : somme des ingrédients si renseignés, sinon les valeurs saisies manuellement sur `meals`.
- **Alerte perte de poids** : si la moyenne mobile 7 jours baisse de plus de 1,2 kg par semaine sur 3 semaines, afficher un bandeau suggérant de remonter à 2 200 kcal.

---

## 7. Le chatbot

### 7.1 Architecture

Route API `/api/chat`, côté serveur. Elle reçoit l'historique de conversation, appelle l'API Anthropic en tool use, exécute les outils demandés contre Supabase, renvoie la réponse et les modifications effectuées.

Le system prompt du chatbot contient : le profil utilisateur, la semaine en cours du programme, l'état actuel des 4 séances et du plan de repas en JSON compact, les 7 derniers jours de logs, et les règles de la section 7.4.

### 7.2 Outils à exposer

```
get_programme(section)                 // 'sport' | 'nutrition' | 'pied' | 'course'
get_seance(code)
get_historique(exercice, nb_seances)
get_logs(type, depuis, jusqu_a)        // 'seances'|'poids'|'pied'|'repas'|'course'

update_exercice(workout_exercise_id, champs)
ajouter_exercice(workout_id, exercice, position, parametres)
supprimer_exercice(workout_exercise_id)
remplacer_exercice(workout_exercise_id, nouvel_exercice, parametres)
reordonner_seance(workout_id, ordre_ids)
update_charges(workout_id, facteur_ou_valeurs)

remplacer_repas(semaine, jour, slot, meal_id)
creer_recette(nom, slot, macros, recette_md, ingredients)
generer_liste_courses(semaine_du)

log_poids(date, poids_kg, tour_taille_cm)
log_douleur_pied(date, douleur)
annuler(change_log_id)
```

Chaque outil d'écriture renvoie l'identifiant `change_log` créé.

### 7.3 Les trois comportements

Le chatbot classe chaque demande dans l'un des trois modes, et la classification est **déterministe**, pas laissée à son appréciation :

| Mode | Déclencheur | Comportement |
| --- | --- | --- |
| **Réponse seule** | Aucun outil d'écriture nécessaire | Il répond, point. Il peut lire les données. |
| **Appliqué avec annulation** | 1 seule ligne modifiée, non destructive : changement de charge, de reps, de repos, de repas d'un slot, log d'une mesure | Appliqué immédiatement. Un bandeau « Annulé ? » reste visible 15 secondes en bas, puis l'action reste annulable depuis l'historique. |
| **Proposé puis validé** | Plus d'une ligne modifiée, ou toute suppression, ou toute modification du protocole pied ou du plan de course | Affiche une carte de diff avant/après, avec deux boutons : « Appliquer » et « Laisser tomber ». Rien n'est écrit tant que l'utilisateur n'a pas cliqué. |

L'interface de chat doit rendre ces trois cas visuellement distincts : réponse en texte simple, modification appliquée avec un liseré vert et le bouton annuler, proposition avec une carte encadrée et les deux boutons.

### 7.4 Règles de sécurité du chatbot

Ces règles vont dans le system prompt et sont aussi appliquées côté code, pas uniquement par la consigne :

1. **Le protocole pied ne peut pas être supprimé ni vidé.** Une demande en ce sens déclenche une réponse qui explique pourquoi, et propose un allègement temporaire à la place.
2. **Le plan de course ne peut pas sauter de palier.** Si on lui demande de passer directement à 10 km, il refuse, explique la règle du feu tricolore et propose le palier suivant.
3. **L'objectif calorique ne peut pas descendre sous 1 800 kcal** ni l'objectif protéique sous 120 g, via le chatbot. Une demande en ce sens renvoie une explication, pas une modification.
4. **Aucune suppression en masse.** Toute opération touchant plus de 5 lignes est refusée et doit être faite manuellement dans l'interface.
5. Il ne donne jamais de diagnostic médical et renvoie vers le kiné ou le podologue dès que la douleur sort des bornes du plan.

### 7.5 Exemples de conversations à faire fonctionner

Ces cas doivent passer, teste-les :

- « Le squat me fait mal au pied, remplace-le » → mode proposition (changement structurel), suggère presse à cuisses ou hack squat avec charges équivalentes
- « J'ai monté le développé couché à 75 kg aujourd'hui » → mode appliqué, met à jour la charge de départ et logge la série
- « Je pèse 90,4 ce matin et le pied était à 2 » → mode appliqué, deux logs créés
- « Je ne peux pas aller en salle cette semaine » → réponse seule, propose la séance maison de secours existante
- « Mets 1 500 kcal par jour, je veux aller plus vite » → réponse seule, refus argumenté avec le chiffre de perte musculaire
- « Qu'est-ce que je mange ce soir ? » → réponse seule, lit le plan du jour
- « Décale la pizza de vendredi à mardi » → mode appliqué, échange les deux repas
- « Supprime toutes les séances de jambes » → refus, plus de 5 lignes

---

## 8. Données de seed

Crée un script `supabase/seed.sql` ou `scripts/seed.ts` qui insère exactement ce contenu au premier lancement.

### 8.1 Séance A, salle, bas du corps et tirage, 55 min, lundi

| Ordre | Exercice | Séries | Reps | Repos | Départ | Cible | Incrément |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Squat barre | 4 | 6-8 | 120 s | 80 kg | 115 kg | 5 kg |
| 2 | Soulevé de terre roumain | 3 | 8-10 | 120 s | 80 kg | 120 kg | 5 kg |
| 3 | Presse à cuisses | 3 | 10-12 | 90 s | 160 kg | 280 kg | 10 kg |
| 4 | Tirage vertical poitrine | 4 | 8-10 | 90 s | 60 kg | 90 kg | 2,5 kg |
| 5 | Rowing haltère un bras | 3 | 10 | 60 s | 28 kg | 42 kg | 2 kg |
| 6 | Gainage planche | 3 | 40 s | 45 s | | | |

Note sur la séance : pas de mollets, ils sont déjà chargés par le protocole pied.

### 8.2 Séance B, salle, haut du corps complet, 50 min, mercredi

| Ordre | Exercice | Séries | Reps | Repos | Départ | Cible | Incrément |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Tractions | 4 | 6-8 | 120 s | Poids du corps | +12 kg | 2 kg |
| 2 | Développé incliné haltères | 4 | 8-10 | 90 s | 2 x 24 kg | 2 x 32 kg | 2 kg |
| 3 | Rowing barre | 4 | 8-10 | 90 s | 60 kg | 85 kg | 2,5 kg |
| 4 | Élévations latérales | 3 | 15 | 45 s | 2 x 8 kg | 2 x 12 kg | 1 kg |
| 5 | Curl barre EZ | 3 | 10 | 60 s | 25 kg | 35 kg | 2,5 kg |
| 6 | Extension triceps poulie | 3 | 12 | 60 s | 25 kg | 35 kg | 2,5 kg |
| 7 | Planche latérale | 3 | 30 s par côté | 30 s | | | |
| 8 | Dead bug | 3 | 10 par côté | 30 s | | | |

### 8.3 Séance C, salle, poussée et unilatéral, 55 min, vendredi

| Ordre | Exercice | Séries | Reps | Repos | Départ | Cible | Incrément |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Développé couché barre | 4 | 6-8 | 120 s | 70 kg | 90 kg | 2,5 kg |
| 2 | Split squat bulgare | 3 | 8 par jambe | 90 s | 2 x 14 kg | 2 x 24 kg | 2 kg |
| 3 | Hip thrust | 3 | 10 | 90 s | 80 kg | 160 kg | 10 kg |
| 4 | Développé militaire | 3 | 8 | 90 s | 45 kg | 65 kg | 2,5 kg |
| 5 | Face pull poulie | 3 | 15 | 60 s | 30 kg | 40 kg | 2,5 kg |
| 6 | Marche du fermier | 3 | 40 m | 90 s | 2 x 30 kg | 2 x 45 kg | 4 kg |

### 8.4 Séance D, salle puis extérieur, circuit et agilité, 45 min, samedi

Circuit de 6 exercices, 40 secondes de travail et 20 de repos, 4 tours, 2 min entre les tours :
kettlebell swing 24 kg, rameur, tirage poulie basse, développé haltères debout, step-up sur banc contrôlé, planche.

Puis 10 min d'agilité dehors, au sol et sans saut : pas chassés latéraux 10 m aller-retour 6 fois, carioca 10 m 4 fois, changements de direction sur 4 plots espacés de 5 m 6 fois, appuis sur échelle d'agilité 5 min.

L'app doit gérer le format circuit différemment du format séries : minuteur 40/20 automatique qui enchaîne les 6 exercices.

### 8.5 Séance maison de secours

Tractions 5 x max, pompes pieds surélevés 5 x max, rowing inversé 4 x 12, split squat bulgare poids du corps 4 x 15, leg curl glissé sur serviette 3 x 8, planche 3 x 60 s, planche latérale 3 x 45 s.

### 8.6 Protocole pied

| Moment | Exercice | Dosage |
| --- | --- | --- |
| Réveil, avant de poser le pied | Étirement du fascia, orteils tirés vers le tibia | 10 fois 10 s |
| Réveil, enchaîné | Mollet contre le mur, jambe tendue puis fléchie | 2 fois 30 s par position |
| Journée | Étirement du fascia, 2 fois de plus | 10 fois 10 s, 2 fois |
| Jour sur deux | Montées sur pointe lentes, serviette roulée sous les orteils, sur une marche, tempo 3-2-3 | Voir progression |
| Tous les jours | Pied creux actif, « short foot » | 3 x 10, tenu 5 s |
| Tous les jours | Serviette au sol ramenée avec les orteils | 3 x 15 |
| Soir | Roulage balle de tennis ou bouteille congelée | 5 min |

Progression des montées sur pointe : semaines 1-2, 3 x 12 sur 2 pieds au poids du corps. Semaines 3-4, 4 x 10 sur 2 pieds avec sac à dos 8 à 12 kg. Semaines 5-6, 4 x 8 sur 1 pied. Semaines 7-8, 5 x 8 sur 1 pied avec sac 10 à 15 kg.

### 8.7 Plan de course

| Semaine | Protocole, 2 fois par semaine | Volume cible |
| --- | --- | --- |
| 1-2 | Vélo ou rameur 30 min, marche rapide 30 min | 0 km |
| 3-4 | Vélo ou rameur 35 min, marche rapide 45 min dont 10 en côte | 0 km |
| 5 | 6 x (1 min course lente / 2 min marche) | 2,5 km |
| 6 | 8 x (1,5 min course / 1,5 min marche) | 4 km |
| 7 | 6 x (3 min course / 1,5 min marche) | 6 km |
| 8 | 4 x (6 min course / 1 min marche) | 9 km |
| 9 | 5 km continus, allure lente | 10 km |

Conditions d'entrée en semaine 5 : douleur au réveil ≤ 3 sur 10 pendant 7 jours consécutifs, et 45 min de marche rapide sans douleur pendant ni le lendemain.

### 8.8 Formules de repas

| Slot | kcal | Protéines | Formule |
| --- | --- | --- | --- |
| Petit déjeuner | 450 | 40 g | 300 g skyr ou fromage blanc 0 %, 40 g flocons d'avoine, 1 fruit, 10 g beurre de cacahuète |
| Collation matin | 150 | 15 g | 1 fruit et 20 g d'amandes, ou 1 skyr nature |
| Déjeuner | 600 | 50 g | 150 g protéine cuite, 70 g féculent cru, légumes à volonté, 1 c. à soupe d'huile |
| Collation avant séance | 200 | 20 g | 1 banane et 1 skyr, ou 2 tranches de pain complet et jambon ou thon |
| Dîner | 600 | 45 g | 150 g protéine cuite, 50 g féculent cru, beaucoup de légumes, 1 c. à soupe d'huile |

### 8.9 Menus, semaine 1

| Jour | Déjeuner | Dîner |
| --- | --- | --- |
| Lundi | Bol poulet, riz, légumes rôtis, sauce asiatique | Omelette 3 œufs, légumes rôtis, 2 tranches de pain complet |
| Mardi | Poké maison : riz, thon, concombre, carotte, édamame | Lentilles au curry et lait de coco, yaourt nature |
| Mercredi | Wrap poulet crudités, fromage blanc | Poêlée riz, poulet croustillant, légumes |
| Jeudi | Chili lentilles et bœuf haché, riz (portion congelée) | Ramen maison : bouillon, nouilles, poulet, œuf, légumes |
| Vendredi | Pâtes complètes, sauce tomate, thon | Pizza maison, salade verte |
| Samedi | Œufs brouillés, pain complet, grande salade | Repas libre |
| Dimanche | Salade composée des restes | Poulet rôti et légumes du nouveau batch |

### 8.10 Menus, semaine 2

| Jour | Déjeuner | Dîner |
| --- | --- | --- |
| Lundi | Poké maison : riz, saumon, avocat, radis | Chili con carne aux lentilles, riz |
| Mardi | Bol poulet, riz, légumes, sauce asiatique | Omelette aux champignons, grande salade, pain |
| Mercredi | Salade pois chiches, thon, tomates, feta | Ramen maison, œuf mollet, pak choï |
| Jeudi | Pâtes bolognaise à la dinde (portion congelée) | Wok poulet, nouilles, légumes, sauce asiatique |
| Vendredi | Wrap thon crudités, fromage blanc | Pizza maison, salade verte |
| Samedi | Œufs au plat, patates douces rôties, salade | Repas libre |
| Dimanche | Grande salade composée | Nouveau batch : poulet, riz, légumes |

### 8.11 Les 4 recettes signature, à mettre en `recette_md`

**Poké bowl, 620 kcal.** 60 g de riz cru assaisonné d'une cuillère à soupe de vinaigre de riz, 130 g de thon ou saumon, concombre, carotte râpée, 60 g d'édamame, oignon rouge, un quart d'avocat, 2 cuillères à soupe de sauce asiatique, graines de sésame.

**Pizza maison, 700 kcal la pizza entière.** Pâte pour 2 : 250 g de farine, 160 ml d'eau tiède, 4 g de levure sèche, 5 g de sel, 1 c. à soupe d'huile d'olive. Lever 1 h ou une nuit au frigo. Garniture : sauce tomate, 80 g de mozzarella râpée et pas plus, poulet ou jambon, champignons, roquette après cuisson. Four 250 °C, plaque préchauffée, 8 à 10 min.

**Poulet riz croustillant, 640 kcal.** 150 g de filet en lamelles, trempées dans 1 blanc d'œuf puis roulées dans 2 c. à soupe de maïzena. Four 220 °C, 20 min sur grille. Réduire 3 c. à soupe de sauce asiatique à la poêle, y jeter le poulet chaud 30 s. 70 g de riz cru, brocoli.

**Ramen maison, 600 kcal.** 500 ml de bouillon de volaille, 1 c. à soupe de miso, 1 c. à café de sauce soja, ail et gingembre râpés, 1 c. à café d'huile de sésame. 60 g de nouilles, 120 g de poulet effiloché, 1 œuf mollet 6 min 30, épinards ou pak choï, ciboule, maïs.

**Sauce asiatique de base**, à mentionner dans les recettes qui l'utilisent : 6 c. à soupe de sauce soja, 2 de vinaigre de riz, 1 de miel, 1 d'huile de sésame, 3 gousses d'ail râpées, un pouce de gingembre râpé.

### 8.12 Plats de secours, tag `secours`

| Plat | Temps | kcal | Protéines |
| --- | --- | --- | --- |
| Œufs brouillés, légumes surgelés poêlés, 2 tranches de pain complet | 8 min | 520 | 32 g |
| Pâtes, sauce tomate du bocal, 1 boîte de thon | 10 min | 600 | 40 g |
| Portion congelée réchauffée | 4 min | 600 | 45 g |

### 8.13 Courses de base et protéines par euro

| Produit | Quantité | Prix | Catégorie |
| --- | --- | --- | --- |
| Œufs | 18 | 4,50 € | protéines |
| Cuisses de poulet | 1 kg | 5,50 € | protéines |
| Fromage blanc 0 % | 1 kg | 2,20 € | laitages |
| Thon en boîte | 4 boîtes | 3,00 € | protéines |
| Lentilles sèches | 500 g | 1,50 € | protéines |
| Riz | 1 kg | 1,50 € | féculents |
| Flocons d'avoine | 1 kg | 1,50 € | féculents |
| Pâtes complètes | 500 g | 0,80 € | féculents |
| Farine | 1 kg | 0,80 € | épicerie |
| Tomates concassées | 2 boîtes | 1,00 € | épicerie |
| Légumes surgelés | 2 kg | 3,00 € | légumes |
| Légumes frais | 2,5 kg | 3,00 € | légumes |
| Bananes et pommes | 2 kg | 2,70 € | fruits |

Protéines par euro, pour le tableau de référence : lentilles sèches 80 g, fromage blanc 0 % 36 g, whey 34 g, thon en boîte 33 g, œufs 25 g, cuisses de poulet 25 g, filet de poulet 15 g.

### 8.14 Aliments exclus

Ne jamais proposer de truffe ni de choux de Bruxelles, dans aucune recette générée par le chatbot.

---

## 9. Ordre de construction

Construis dans cet ordre, en me montrant le résultat à chaque étape avant de continuer.

1. **Socle** : projet Next.js, Tailwind, shadcn, Supabase configuré, Auth magic link, schéma SQL complet, RLS, seed exécuté et vérifié en base.
2. **Lecture seule** : les deux sections avec tous leurs onglets, affichant les données du seed. Navigation complète, aucune écriture.
3. **Mode exécution de séance** : l'écran le plus important, avec steppers, minuteur, historique, enregistrement des logs.
4. **Édition** : modification des séances et du plan de repas, avec `change_log` et annulation.
5. **Logs et courbes** : poids, douleur pied, course, repas, et les graphiques de l'onglet Progression.
6. **Génération de la liste de courses** depuis les menus.
7. **Chatbot** : route API, outils de lecture d'abord, puis outils d'écriture, puis les 3 modes d'interaction, puis les règles de sécurité.
8. **PWA** : manifest, service worker, cache hors ligne en lecture, file d'attente de synchronisation.

---

## 10. Critères d'acceptation

L'application est terminée quand ces 10 scénarios passent sur un téléphone :

1. Je démarre la séance A, je logge 4 séries de squat avec le minuteur, et les valeurs sont pré-remplies depuis la dernière fois
2. Je modifie la charge de départ du développé couché, je recharge la page, la valeur a tenu
3. Je supprime un exercice, j'annule depuis l'historique, il est revenu à sa place
4. Je renseigne ma douleur matinale 7 jours de suite à 2, et l'onglet Course débloque la semaine 5
5. Je renseigne une douleur à 7, le feu passe au rouge et la consigne associée s'affiche
6. Je coche mes 5 repas du jour, le compteur affiche 2 000 kcal et 170 g de protéines
7. Je génère la liste de courses de la semaine, le total s'affiche et je peux cocher les articles
8. Je dis au chatbot « j'ai fait 75 kg au développé couché », c'est appliqué avec un bouton annuler visible
9. Je dis « remplace le squat par la presse », une carte de diff s'affiche et rien n'est écrit avant mon clic
10. Je dis « supprime le protocole pied », il refuse et explique pourquoi

---

## 11. Ce que je ne veux pas

- Pas de dépendance à une bibliothèque de graphiques lourde : Recharts suffit
- Pas d'animations décoratives, pas de dégradés, pas d'emoji dans l'interface
- Pas de notification push dans la version 1
- Pas de partage, pas de social, pas de multi-utilisateur
- Pas de page de réglages fourre-tout : chaque réglage vit dans l'écran qu'il concerne
