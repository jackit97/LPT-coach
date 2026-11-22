-- Titoli piu' lunghi (attivita' importate da Garmin/Strava con nomi lunghi)
ALTER TABLE lptapp.calendar_workouts ALTER COLUMN titolo TYPE VARCHAR(255);
ALTER TABLE lptapp.endurance_sessions ALTER COLUMN title TYPE VARCHAR(255);

-- Consensi privacy (GDPR): informativa/termini e trattamento dei dati sulla salute (art. 9)
ALTER TABLE lptapp.utenti ADD COLUMN IF NOT EXISTS privacy_accettata_at TIMESTAMP;
ALTER TABLE lptapp.utenti ADD COLUMN IF NOT EXISTS privacy_versione VARCHAR(20);
ALTER TABLE lptapp.utenti ADD COLUMN IF NOT EXISTS consenso_salute_at TIMESTAMP;

-- Verifica email e notifiche via email
ALTER TABLE lptapp.utenti ADD COLUMN IF NOT EXISTS email_verificata BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE lptapp.utenti ADD COLUMN IF NOT EXISTS email_verificata_at TIMESTAMP;
ALTER TABLE lptapp.utenti ADD COLUMN IF NOT EXISTS email_token_hash VARCHAR(64);
ALTER TABLE lptapp.utenti ADD COLUMN IF NOT EXISTS email_token_scadenza TIMESTAMP;
ALTER TABLE lptapp.utenti ADD COLUMN IF NOT EXISTS notifiche_email BOOLEAN NOT NULL DEFAULT TRUE;
-- gli account gia' registrati prima di questa versione sono considerati verificati
UPDATE lptapp.utenti SET email_verificata = TRUE, email_verificata_at = NOW()
WHERE email_verificata = FALSE AND dataregistrazione < '2026-11-23';

-- Profilo developer: utilizzo dell'app, errori e segnalazioni degli utenti
ALTER TABLE lptapp.utenti ADD COLUMN IF NOT EXISTS ultimo_accesso_at TIMESTAMP;
CREATE TABLE IF NOT EXISTS lptapp.app_activity (
  utenteid INT NOT NULL REFERENCES lptapp.utenti(utenteid) ON DELETE CASCADE,
  giorno DATE NOT NULL,
  minuti INT NOT NULL DEFAULT 0,
  primo_accesso TIMESTAMP NOT NULL DEFAULT NOW(),
  ultimo_accesso TIMESTAMP NOT NULL DEFAULT NOW(),
  piattaforma VARCHAR(20),
  PRIMARY KEY (utenteid, giorno)
);
CREATE TABLE IF NOT EXISTS lptapp.app_errors (
  error_id SERIAL PRIMARY KEY,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  origine VARCHAR(10) NOT NULL, -- server | app
  utenteid INT REFERENCES lptapp.utenti(utenteid) ON DELETE SET NULL,
  metodo VARCHAR(10),
  percorso VARCHAR(300),
  messaggio TEXT,
  stack TEXT,
  user_agent VARCHAR(300),
  versione_app VARCHAR(40),
  risolto BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS idx_app_errors_created ON lptapp.app_errors(created_at DESC);
CREATE TABLE IF NOT EXISTS lptapp.app_feedback (
  feedback_id SERIAL PRIMARY KEY,
  utenteid INT REFERENCES lptapp.utenti(utenteid) ON DELETE SET NULL,
  tipo VARCHAR(20) NOT NULL DEFAULT 'bug', -- bug | miglioramento | altro
  messaggio TEXT NOT NULL,
  schermata VARCHAR(100),
  versione_app VARCHAR(40),
  user_agent VARCHAR(300),
  stato VARCHAR(20) NOT NULL DEFAULT 'nuovo', -- nuovo | in_corso | risolto | chiuso
  risposta TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_app_feedback_created ON lptapp.app_feedback(created_at DESC);
-- Per creare l'account developer: registrati dall'app e poi
--   UPDATE lptapp.utenti SET ruolo = 'developer' WHERE LOWER(email) = 'la-tua-email';
