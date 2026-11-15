-- Add columns to calendar_workouts for external provider sync (Strava, Garmin, etc.)
ALTER TABLE lptapp.calendar_workouts ADD COLUMN IF NOT EXISTS external_id VARCHAR(100);
ALTER TABLE lptapp.calendar_workouts ADD COLUMN IF NOT EXISTS external_provider VARCHAR(50);
ALTER TABLE lptapp.calendar_workouts ADD COLUMN IF NOT EXISTS distance_km NUMERIC(6,2);
ALTER TABLE lptapp.calendar_workouts ADD COLUMN IF NOT EXISTS avg_hr INT;
ALTER TABLE lptapp.calendar_workouts ADD COLUMN IF NOT EXISTS elev_gain_m INT;

-- Ensure endurance_integrations and endurance_activities tables exist
CREATE TABLE IF NOT EXISTS lptapp.endurance_integrations (
  integration_id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES lptapp.utenti(utenteid) ON DELETE CASCADE,
  provider VARCHAR(20) NOT NULL,
  connected INT NOT NULL DEFAULT 0,
  data_json TEXT,
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, provider)
);

CREATE TABLE IF NOT EXISTS lptapp.endurance_activities (
  activity_id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES lptapp.utenti(utenteid) ON DELETE CASCADE,
  provider VARCHAR(20),
  external_id VARCHAR(100),
  "date" DATE,
  duration_minutes INT,
  distance_km NUMERIC(6,2),
  avg_hr INT,
  tss INT,
  raw_json TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
