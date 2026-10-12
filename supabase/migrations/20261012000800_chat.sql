-- Phase 7 : le chatbot. Une modification du programme faite par le chat compte dans le même
-- quota mensuel que les propositions de programme.
alter table demandes_ia drop constraint demandes_ia_type_check;
alter table demandes_ia add constraint demandes_ia_type_check check (type in ('sport', 'nutrition', 'chat'));
