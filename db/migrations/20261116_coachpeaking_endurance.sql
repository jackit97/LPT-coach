-- Allineamento endurance a CoachPeaking (sport, D+, video, libreria blocchi) + diete strutturate.
ALTER TABLE lptapp.calendar_workouts ADD COLUMN IF NOT EXISTS sport VARCHAR(20);
ALTER TABLE lptapp.endurance_sessions ADD COLUMN IF NOT EXISTS sport VARCHAR(20);
ALTER TABLE lptapp.endurance_sessions ADD COLUMN IF NOT EXISTS elevation_m INT;
ALTER TABLE lptapp.endurance_sessions ADD COLUMN IF NOT EXISTS video_urls_json TEXT;

CREATE TABLE IF NOT EXISTS lptapp.endurance_block_library (
  block_id SERIAL PRIMARY KEY,
  pt_user_id INT NOT NULL REFERENCES lptapp.utenti(utenteid) ON DELETE CASCADE,
  sport VARCHAR(20),
  title VARCHAR(200) NOT NULL,
  block_json TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_endurance_block_library_coach ON lptapp.endurance_block_library(pt_user_id);

-- Sessioni endurance esistenti: lo sport non veniva salvato, l'editor creava solo corsa.
UPDATE lptapp.endurance_sessions SET sport = 'corsa' WHERE sport IS NULL;
UPDATE lptapp.calendar_workouts w SET sport = s.sport
FROM lptapp.endurance_sessions s
WHERE w.endurance_session_id = s.session_id AND w.sport IS NULL;

-- Attivita' Strava gia' importate: deduce lo sport dal tipo Strava salvato.
UPDATE lptapp.calendar_workouts w SET sport = CASE
    WHEN a.raw_json::jsonb->>'sport_type' ~* 'run|walk|hike' OR a.raw_json::jsonb->>'type' ~* 'run|walk|hike' THEN 'corsa'
    WHEN a.raw_json::jsonb->>'sport_type' ~* 'ride|bike|cycl' OR a.raw_json::jsonb->>'type' ~* 'ride|bike|cycl' THEN 'ciclismo'
    WHEN a.raw_json::jsonb->>'sport_type' ~* 'swim' OR a.raw_json::jsonb->>'type' ~* 'swim' THEN 'nuoto'
    ELSE NULL END
FROM lptapp.endurance_activities a
WHERE w.external_provider = 'strava' AND a.provider = 'strava' AND a.external_id = w.external_id
  AND a.user_id = w.utenteid AND w.sport IS NULL;

-- Zone: un unico set unificato per atleta (prima ne esisteva uno per sport e la lettura ne prendeva uno a caso).
-- L'unificazione vera avviene lato API al primo salvataggio; qui si marca solo lo sport.
UPDATE lptapp.training_zone_sets SET sport = 'multi' WHERE sport IS NULL;

-- Diete: alimenti strutturati per pasto (grammature e valori per 100 g) e parametri del calcolatore fabbisogno.
ALTER TABLE lptapp.pastidieta ADD COLUMN IF NOT EXISTS alimenti_json TEXT;
ALTER TABLE lptapp.diete ADD COLUMN IF NOT EXISTS fabbisogno_json TEXT;
