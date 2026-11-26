-- Descrizione dell'attivita' sotto il titolo (come su Garmin Connect / Strava), scritta dall'atleta o dal coach
-- o arrivata da Garmin; external_name = ultimo nome visto su Garmin (per riconoscere quando viene rinominata)
ALTER TABLE lptapp.calendar_workouts ADD COLUMN IF NOT EXISTS descrizione_attivita TEXT;
ALTER TABLE lptapp.calendar_workouts ADD COLUMN IF NOT EXISTS external_name VARCHAR(255);
ALTER TABLE lptapp.garmin_connections ADD COLUMN IF NOT EXISTS last_backfill_at TIMESTAMPTZ;
