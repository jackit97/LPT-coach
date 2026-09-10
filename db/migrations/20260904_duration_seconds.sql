ALTER TABLE lptapp.endurance_sessions ADD COLUMN IF NOT EXISTS duration_seconds INT;
ALTER TABLE lptapp.calendar_workouts ADD COLUMN IF NOT EXISTS durata_secondi INT;

UPDATE lptapp.endurance_sessions
SET duration_seconds = duration_minutes * 60
WHERE duration_seconds IS NULL AND duration_minutes IS NOT NULL;

UPDATE lptapp.calendar_workouts
SET durata_secondi = durata_minuti * 60
WHERE durata_secondi IS NULL AND durata_minuti IS NOT NULL;
