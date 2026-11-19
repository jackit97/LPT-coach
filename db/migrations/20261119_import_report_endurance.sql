-- 1) Sezione endurance visibile per singolo atleta (scelta dal coach nella sezione Atleti).
--    NULL = nessuna scelta: vale l'impostazione precedente del coach (utenti.endurance_enabled).
ALTER TABLE lptapp.utenti ADD COLUMN IF NOT EXISTS endurance_visibile BOOLEAN;

-- 2) Video di esecuzione e dubbi dell'atleta sul singolo esercizio di un allenamento di forza
CREATE TABLE IF NOT EXISTS lptapp.esecuzioni_video (
  esecuzione_id SERIAL PRIMARY KEY,
  exercise_id INT NOT NULL UNIQUE REFERENCES lptapp.calendar_workout_exercises(exercise_id) ON DELETE CASCADE,
  workout_id INT NOT NULL REFERENCES lptapp.calendar_workouts(workout_id) ON DELETE CASCADE,
  utenteid INT NOT NULL REFERENCES lptapp.utenti(utenteid) ON DELETE CASCADE,
  storage_key TEXT,
  mime VARCHAR(80),
  size_bytes INT,
  dubbi TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_esecuzioni_video_workout ON lptapp.esecuzioni_video(workout_id);

-- 3) Report dell'allenamento inviato dall'atleta al coach (video, note, dubbi, feedback)
CREATE TABLE IF NOT EXISTS lptapp.workout_reports (
  report_id SERIAL PRIMARY KEY,
  workout_id INT NOT NULL UNIQUE REFERENCES lptapp.calendar_workouts(workout_id) ON DELETE CASCADE,
  athlete_id INT NOT NULL REFERENCES lptapp.utenti(utenteid) ON DELETE CASCADE,
  coach_id INT REFERENCES lptapp.utenti(utenteid) ON DELETE SET NULL,
  contenuto_json TEXT,
  inviato_at TIMESTAMP NOT NULL DEFAULT NOW(),
  letto_at TIMESTAMP,
  risposta TEXT,
  risposta_at TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_workout_reports_coach ON lptapp.workout_reports(coach_id, inviato_at DESC);
