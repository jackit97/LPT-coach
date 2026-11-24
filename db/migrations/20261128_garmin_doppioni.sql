-- Garmin: niente doppioni quando riepilogo e file dell'attivita' arrivano insieme
ALTER TABLE lptapp.garmin_activity_queue ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ;

-- toglie le attivita' gia' importate due volte (stesso atleta, stessa origine, stesso inizio)
DELETE FROM lptapp.calendar_workouts a
USING lptapp.calendar_workouts b
WHERE a.external_provider IN ('garmin', 'file') AND b.external_provider = a.external_provider
  AND a.utenteid = b.utenteid AND a.external_id = b.external_id AND a.workout_id > b.workout_id;

CREATE UNIQUE INDEX IF NOT EXISTS uq_calendar_workouts_activity
  ON lptapp.calendar_workouts(utenteid, external_provider, external_id)
  WHERE external_provider IN ('garmin', 'file');
