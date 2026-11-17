-- Notifiche in-app per coach e atleti
CREATE TABLE IF NOT EXISTS lptapp.notifiche (
  notifica_id SERIAL PRIMARY KEY,
  utenteid INT NOT NULL REFERENCES lptapp.utenti(utenteid) ON DELETE CASCADE,
  mittente_id INT REFERENCES lptapp.utenti(utenteid) ON DELETE SET NULL,
  tipo VARCHAR(40) NOT NULL,           -- workout | feedback | dieta | pagamento | check_richiesto | check_inviato | check_commentato | strava
  titolo VARCHAR(200) NOT NULL,
  messaggio TEXT,
  link_json TEXT,                      -- { screen, params } per aprire la schermata collegata
  letta BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notifiche_utente ON lptapp.notifiche(utenteid, letta, created_at DESC);

-- Check fotografici: il coach li richiede, l'atleta carica le foto, il coach commenta
CREATE TABLE IF NOT EXISTS lptapp.body_checks (
  check_id SERIAL PRIMARY KEY,
  athlete_id INT NOT NULL REFERENCES lptapp.utenti(utenteid) ON DELETE CASCADE,
  coach_id INT REFERENCES lptapp.utenti(utenteid) ON DELETE SET NULL,
  stato VARCHAR(20) NOT NULL DEFAULT 'richiesto', -- richiesto | inviato | revisionato
  scadenza DATE,
  nota_richiesta TEXT,
  nota_atleta TEXT,
  peso_kg NUMERIC(5,2),
  commento_coach TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  inviato_at TIMESTAMP,
  revisionato_at TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_body_checks_athlete ON lptapp.body_checks(athlete_id, created_at DESC);

CREATE TABLE IF NOT EXISTS lptapp.body_check_photos (
  photo_id SERIAL PRIMARY KEY,
  check_id INT NOT NULL REFERENCES lptapp.body_checks(check_id) ON DELETE CASCADE,
  posa VARCHAR(20) NOT NULL DEFAULT 'altro', -- fronte | lato | retro | altro
  storage VARCHAR(10) NOT NULL DEFAULT 'db',  -- r2 | db
  storage_key VARCHAR(255),
  mime VARCHAR(50) NOT NULL DEFAULT 'image/jpeg',
  size_bytes INT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_body_check_photos_check ON lptapp.body_check_photos(check_id);

-- Usata solo se il Worker non ha il bucket R2 CHECK_PHOTOS collegato
CREATE TABLE IF NOT EXISTS lptapp.body_check_photo_data (
  photo_id INT PRIMARY KEY REFERENCES lptapp.body_check_photos(photo_id) ON DELETE CASCADE,
  data BYTEA NOT NULL
);

-- La libreria non salvava l'intensita' degli allenamenti di forza/funzionale
ALTER TABLE lptapp.workouttemplates ADD COLUMN IF NOT EXISTS rpe_pianificato SMALLINT;
