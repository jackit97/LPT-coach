-- Dati campione delle attivita' importate (FC, passo/velocita', quota, potenza, cadenza, giri)
-- per i grafici nel dettaglio dell'allenamento endurance.
CREATE TABLE IF NOT EXISTS lptapp.activity_streams (
  workout_id INT PRIMARY KEY REFERENCES lptapp.calendar_workouts(workout_id) ON DELETE CASCADE,
  source VARCHAR(20),
  samples_json TEXT,
  laps_json TEXT,
  -- secondi in ogni zona FC calcolati all'import: danno un TRIMP piu' preciso della sola FC media
  zone_seconds_json TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
ALTER TABLE lptapp.activity_streams ADD COLUMN IF NOT EXISTS zone_seconds_json TEXT;
