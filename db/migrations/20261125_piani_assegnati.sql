-- Piani della libreria assegnati agli atleti: restano visibili (attivi, futuri e conclusi)
-- nelle sezioni Pesistica ed Endurance, con gli allenamenti creati in calendario.
CREATE TABLE IF NOT EXISTS lptapp.plan_assignments (
  assignment_id SERIAL PRIMARY KEY,
  plan_id INT REFERENCES lptapp.library_plans(plan_id) ON DELETE SET NULL,
  coach_id INT NOT NULL REFERENCES lptapp.utenti(utenteid) ON DELETE CASCADE,
  utenteid INT NOT NULL REFERENCES lptapp.utenti(utenteid) ON DELETE CASCADE,
  nome VARCHAR(150) NOT NULL,
  descrizione TEXT,
  settimane INT,
  data_inizio DATE NOT NULL,
  data_fine DATE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_plan_assignments_utente ON lptapp.plan_assignments(utenteid);
ALTER TABLE lptapp.calendar_workouts ADD COLUMN IF NOT EXISTS plan_assignment_id INT REFERENCES lptapp.plan_assignments(assignment_id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_calendar_workouts_plan_assignment ON lptapp.calendar_workouts(plan_assignment_id);
