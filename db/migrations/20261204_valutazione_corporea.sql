-- Valutazione corporea: plicometria e misure antropometriche inserite dal coach
CREATE TABLE IF NOT EXISTS lptapp.body_assessments (
  assessment_id SERIAL PRIMARY KEY,
  utenteid INT NOT NULL REFERENCES lptapp.utenti(utenteid) ON DELETE CASCADE,
  coach_userid INT REFERENCES lptapp.utenti(utenteid) ON DELETE SET NULL,
  data DATE NOT NULL,
  sesso VARCHAR(1),
  eta INT,
  peso_kg NUMERIC(5,2),
  altezza_cm NUMERIC(5,1),
  protocollo VARCHAR(10) NOT NULL DEFAULT 'jp7',
  livello_attivita NUMERIC(4,3),
  obiettivo_bf NUMERIC(4,1),
  pliche_json TEXT,
  circonferenze_json TEXT,
  note TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_body_assessments_user ON lptapp.body_assessments (utenteid, data);
