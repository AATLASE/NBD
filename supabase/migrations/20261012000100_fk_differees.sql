-- Supprimer un compte échouait : la cascade depuis auth.users efface par exemple les exercices
-- avant les lignes de séance qui les référencent, et la clé étrangère (sans cascade dans la spec)
-- refusait aussitôt.
-- Ces contraintes sont désormais vérifiées en fin de transaction. La règle métier ne change pas :
-- on ne peut toujours pas supprimer un exercice, une séance ou un repas encore référencé.

alter table workout_exercises alter constraint workout_exercises_exercise_id_fkey deferrable initially deferred;
alter table workout_logs      alter constraint workout_logs_workout_id_fkey deferrable initially deferred;
alter table set_logs          alter constraint set_logs_workout_exercise_id_fkey deferrable initially deferred;
alter table meal_plan         alter constraint meal_plan_meal_id_fkey deferrable initially deferred;
alter table meal_logs         alter constraint meal_logs_meal_id_fkey deferrable initially deferred;
