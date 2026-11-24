-- Report atleta -> coach come chat (botta e risposta) con conferma di lettura
CREATE TABLE IF NOT EXISTS lptapp.workout_report_messages (
  message_id SERIAL PRIMARY KEY,
  report_id INT NOT NULL REFERENCES lptapp.workout_reports(report_id) ON DELETE CASCADE,
  autore_id INT REFERENCES lptapp.utenti(utenteid) ON DELETE SET NULL,
  da_coach BOOLEAN NOT NULL DEFAULT FALSE,
  testo TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_workout_report_messages_report ON lptapp.workout_report_messages(report_id, created_at);

ALTER TABLE lptapp.workout_reports ADD COLUMN IF NOT EXISTS letto_coach_at TIMESTAMPTZ;
ALTER TABLE lptapp.workout_reports ADD COLUMN IF NOT EXISTS letto_atleta_at TIMESTAMPTZ;

-- le risposte gia' date dal coach diventano il primo messaggio della chat
INSERT INTO lptapp.workout_report_messages (report_id, autore_id, da_coach, testo, created_at)
SELECT r.report_id, r.coach_id, TRUE, r.risposta, COALESCE(r.risposta_at, r.inviato_at)
FROM lptapp.workout_reports r
WHERE r.risposta IS NOT NULL AND TRIM(r.risposta) <> ''
  AND NOT EXISTS (SELECT 1 FROM lptapp.workout_report_messages m WHERE m.report_id = r.report_id);
