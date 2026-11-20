-- Libreria unica del coach: piani di piu' settimane composti da allenamenti della libreria
-- (workouttemplates), da assegnare in un colpo al calendario di uno o piu' atleti.
CREATE TABLE IF NOT EXISTS lptapp.library_plans (
  plan_id SERIAL PRIMARY KEY,
  ptuserid INT NOT NULL REFERENCES lptapp.utenti(utenteid) ON DELETE CASCADE,
  nome VARCHAR(150) NOT NULL,
  descrizione TEXT,
  settimane INT NOT NULL DEFAULT 4,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP
);
CREATE TABLE IF NOT EXISTS lptapp.library_plan_items (
  item_id SERIAL PRIMARY KEY,
  plan_id INT NOT NULL REFERENCES lptapp.library_plans(plan_id) ON DELETE CASCADE,
  templateid INT NOT NULL REFERENCES lptapp.workouttemplates(templateid) ON DELETE CASCADE,
  settimana INT NOT NULL,
  giorno INT NOT NULL CHECK (giorno BETWEEN 1 AND 7)
);
CREATE INDEX IF NOT EXISTS idx_library_plan_items_plan ON lptapp.library_plan_items(plan_id);
