-- Consigli del coach all'atleta (compaiono nella Home dell'atleta)
CREATE TABLE IF NOT EXISTS lptapp.coach_tips (
  tip_id SERIAL PRIMARY KEY,
  coach_id INT REFERENCES lptapp.utenti(utenteid) ON DELETE SET NULL,
  athlete_id INT NOT NULL REFERENCES lptapp.utenti(utenteid) ON DELETE CASCADE,
  testo TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_coach_tips_athlete ON lptapp.coach_tips(athlete_id, created_at DESC);

-- Schede di pesistica: 'settimanale' (ogni giorno si ripete ogni 7 giorni dalla sua data)
-- oppure 'auto' (giorni distribuiti sui giorni di allenamento indicati dall'atleta nel profilo)
ALTER TABLE lptapp.schedeallenamento ADD COLUMN IF NOT EXISTS programmazione VARCHAR(20) NOT NULL DEFAULT 'settimanale';
