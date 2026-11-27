-- Il coach puo' nascondere a un atleta anche la sezione forza/palestra (come endurance e dieta)
ALTER TABLE lptapp.utenti ADD COLUMN IF NOT EXISTS forza_visibile BOOLEAN NOT NULL DEFAULT TRUE;

-- Superserie: esercizi con la stessa lettera (A, B, ...) si eseguono uno dopo l'altro senza recupero
ALTER TABLE lptapp.esercizischeda ADD COLUMN IF NOT EXISTS superserie VARCHAR(5);
ALTER TABLE lptapp.calendar_workout_exercises ADD COLUMN IF NOT EXISTS superserie VARCHAR(5);
ALTER TABLE lptapp.workouttemplateexercises ADD COLUMN IF NOT EXISTS superserie VARCHAR(5);
