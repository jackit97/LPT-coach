-- Serie eseguite dall'atleta per ogni esercizio degli allenamenti di forza: [{"reps":8,"kg":60,"fatta":true}, ...]
-- Servono per l'analisi (volume, carico massimo, 1RM stimato, progressi rispetto alle volte precedenti).
ALTER TABLE lptapp.calendar_workout_exercises ADD COLUMN IF NOT EXISTS serie_eseguite_json TEXT;
