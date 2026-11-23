-- Garmin Connect (Developer Program): collegamento account, invio allenamenti (Training API) e
-- ricezione automatica delle attivita' svolte (Activity API, push)
CREATE TABLE IF NOT EXISTS lptapp.garmin_connections (
  utenteid INT PRIMARY KEY REFERENCES lptapp.utenti(utenteid) ON DELETE CASCADE,
  garmin_user_id VARCHAR(100) UNIQUE,
  access_token TEXT,
  refresh_token TEXT,
  access_expires_at TIMESTAMPTZ,
  refresh_expires_at TIMESTAMPTZ,
  permissions TEXT,
  auto_sync BOOLEAN NOT NULL DEFAULT TRUE,
  connected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_push_at TIMESTAMPTZ,
  last_activity_at TIMESTAMPTZ,
  last_error TEXT
);

CREATE TABLE IF NOT EXISTS lptapp.garmin_oauth_states (
  state VARCHAR(100) PRIMARY KEY,
  utenteid INT NOT NULL REFERENCES lptapp.utenti(utenteid) ON DELETE CASCADE,
  code_verifier VARCHAR(200) NOT NULL,
  return_to VARCHAR(300),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Allenamenti LPT inviati al calendario Garmin (senza FK: se il coach elimina l'allenamento
-- la riga resta finche' la sincronizzazione non lo cancella anche da Garmin)
CREATE TABLE IF NOT EXISTS lptapp.garmin_workout_sync (
  workout_id INT PRIMARY KEY,
  utenteid INT NOT NULL REFERENCES lptapp.utenti(utenteid) ON DELETE CASCADE,
  garmin_workout_id BIGINT,
  garmin_schedule_id BIGINT,
  scheduled_date DATE,
  payload_hash VARCHAR(64),
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  error TEXT
);
CREATE INDEX IF NOT EXISTS idx_garmin_workout_sync_user ON lptapp.garmin_workout_sync(utenteid, scheduled_date);

-- Attivita' ricevute in push da Garmin, elaborate subito o dal cron se sono tante
CREATE TABLE IF NOT EXISTS lptapp.garmin_activity_queue (
  queue_id SERIAL PRIMARY KEY,
  garmin_user_id VARCHAR(100) NOT NULL,
  kind VARCHAR(20) NOT NULL, -- file | summary | details
  payload TEXT NOT NULL,
  attempts INT NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
