-- Segnalazioni come chat: botta e risposta tra utente e developer
CREATE TABLE IF NOT EXISTS lptapp.app_feedback_messages (
  message_id SERIAL PRIMARY KEY,
  feedback_id INT NOT NULL REFERENCES lptapp.app_feedback(feedback_id) ON DELETE CASCADE,
  autore_id INT REFERENCES lptapp.utenti(utenteid) ON DELETE SET NULL,
  da_developer BOOLEAN NOT NULL DEFAULT FALSE,
  testo TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_app_feedback_messages_feedback ON lptapp.app_feedback_messages(feedback_id, created_at);

-- le risposte gia' date diventano il primo messaggio del developer nella chat
INSERT INTO lptapp.app_feedback_messages (feedback_id, da_developer, testo, created_at)
SELECT f.feedback_id, TRUE, f.risposta, COALESCE(f.updated_at, f.created_at)
FROM lptapp.app_feedback f
WHERE f.risposta IS NOT NULL AND TRIM(f.risposta) <> ''
  AND NOT EXISTS (SELECT 1 FROM lptapp.app_feedback_messages m WHERE m.feedback_id = f.feedback_id);

-- conferma di lettura: quando utente e developer hanno aperto la chat l'ultima volta
ALTER TABLE lptapp.app_feedback ADD COLUMN IF NOT EXISTS letto_utente_at TIMESTAMPTZ;
ALTER TABLE lptapp.app_feedback ADD COLUMN IF NOT EXISTS letto_dev_at TIMESTAMPTZ;
