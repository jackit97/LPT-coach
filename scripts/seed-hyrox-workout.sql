-- Adds the HYROX engine session to the unified calendar and attaches
-- exercises by looking them up in esercizifull.
WITH source_session AS (
  SELECT s.session_id, p.user_id, COALESCE(s."date", p.start_date::date) AS workout_date,
         s.title, s.description, s.duration_minutes, s.rpe_target
  FROM lptapp.endurance_sessions s
  JOIN lptapp.endurance_plans p ON p.plan_id = s.plan_id
  WHERE s.title = 'HYROX engine'
  ORDER BY s.session_id
  LIMIT 1
), created_workout AS (
  INSERT INTO lptapp.calendar_workouts
    (utenteid, endurance_session_id, data, tipo, titolo, descrizione, durata_minuti, rpe_pianificato, stato)
  SELECT user_id, session_id, workout_date, 'endurance', title, description, duration_minutes, rpe_target, 'pianificato'
  FROM source_session
  WHERE NOT EXISTS (
    SELECT 1 FROM lptapp.calendar_workouts w
    WHERE w.endurance_session_id = source_session.session_id
  )
  RETURNING workout_id, endurance_session_id
)
INSERT INTO lptapp.calendar_workout_exercises
  (workout_id, nome, serie, ripetizioni, note, order_index)
SELECT w.workout_id, e.nomeesercizio, x.serie, x.ripetizioni, x.note, x.order_index
FROM lptapp.calendar_workouts w
JOIN lptapp.endurance_sessions s ON s.session_id = w.endurance_session_id
JOIN lptapp.esercizifull e ON e.nomeesercizio = ANY(ARRAY[
  'Burpees', 'Battle rope', 'Jumping jack', 'Corsa tapis roulant', 'Cyclette', 'Ellittica'
])
CROSS JOIN LATERAL (
  SELECT CASE e.nomeesercizio
    WHEN 'Burpees' THEN 3 WHEN 'Battle rope' THEN 3 WHEN 'Jumping jack' THEN 3
    ELSE 1 END AS serie,
    CASE e.nomeesercizio
      WHEN 'Burpees' THEN '10' WHEN 'Battle rope' THEN '30 s' WHEN 'Jumping jack' THEN '30'
      WHEN 'Corsa tapis roulant' THEN '1000 m' WHEN 'Cyclette' THEN '10 min' WHEN 'Ellittica' THEN '10 min' ELSE NULL END AS ripetizioni,
    'HYROX engine - esercizio da catalogo esercizifull' AS note,
    CASE e.nomeesercizio
      WHEN 'Corsa tapis roulant' THEN 0 WHEN 'Burpees' THEN 1 WHEN 'Battle rope' THEN 2
      WHEN 'Jumping jack' THEN 3 WHEN 'Cyclette' THEN 4 WHEN 'Ellittica' THEN 5 ELSE 99 END AS order_index
) x
WHERE s.title = 'HYROX engine'
  AND NOT EXISTS (
    SELECT 1 FROM lptapp.calendar_workout_exercises cwe
    WHERE cwe.workout_id = w.workout_id AND cwe.nome = e.nomeesercizio
  );