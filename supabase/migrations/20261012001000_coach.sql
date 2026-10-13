-- Le coach choisi par le compte : l'un des quatre personnages de l'application (lib/coachs.ts).
-- Il donne son ton à l'assistant et aux petits mots de l'accueil et de la fin de séance.
-- Vide tant que le compte n'a pas choisi : l'assistant parle alors d'un ton neutre.

alter table profiles
  add column coach text
  check (coach in ('exigeant', 'bienveillante', 'analyste', 'pote'));
