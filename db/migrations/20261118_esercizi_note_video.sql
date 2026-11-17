-- Note dell'atleta sul singolo esercizio (scheda palestra e allenamenti del calendario)
ALTER TABLE lptapp.esercizischeda ADD COLUMN IF NOT EXISTS note_atleta TEXT;
ALTER TABLE lptapp.esercizischeda ADD COLUMN IF NOT EXISTS note_atleta_at TIMESTAMP;
ALTER TABLE lptapp.calendar_workout_exercises ADD COLUMN IF NOT EXISTS note_atleta TEXT;
ALTER TABLE lptapp.calendar_workout_exercises ADD COLUMN IF NOT EXISTS note_atleta_at TIMESTAMP;

-- Video gia' caricati senza esercizio collegato: li collega all'esercizio con lo stesso nome
UPDATE lptapp.videotutorial v SET esercizioid = ef.esercizioid
FROM lptapp.esercizifull ef
WHERE v.esercizioid IS NULL AND LOWER(TRIM(v.titolo)) = LOWER(TRIM(ef.nomeesercizio));

CREATE INDEX IF NOT EXISTS idx_videotutorial_esercizio ON lptapp.videotutorial(esercizioid);
CREATE INDEX IF NOT EXISTS idx_esercizifull_nome_lower ON lptapp.esercizifull(LOWER(TRIM(nomeesercizio)));
