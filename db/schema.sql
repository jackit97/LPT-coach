-- ============================================================================
-- LPT Coach - Consolidated Neon Postgres schema
-- Same table names/columns as the legacy LPTapp DB (Postgres dialect), plus
-- the new calendar-first workout model that powers the redesigned app.
-- Objects are created explicitly in the lptapp schema.
-- Safe to run multiple times (IF NOT EXISTS everywhere).
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS lptapp;

-- ---------- Core users ----------
CREATE TABLE IF NOT EXISTS lptapp.utenti (
  utenteid SERIAL PRIMARY KEY,
  nome VARCHAR(100) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  passwordhash VARCHAR(255) NOT NULL,
  ruolo VARCHAR(30) NOT NULL, -- 'cliente' | 'personal_trainer'
  dataregistrazione TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Coach-level switch: when disabled, hides endurance sections/fields for the coach and their athletes
ALTER TABLE lptapp.utenti ADD COLUMN IF NOT EXISTS endurance_enabled BOOLEAN NOT NULL DEFAULT TRUE;

CREATE TABLE IF NOT EXISTS lptapp.profiloutente (
  profiloid SERIAL PRIMARY KEY,
  utenteid INT NOT NULL UNIQUE REFERENCES lptapp.utenti(utenteid) ON DELETE CASCADE,
  sesso VARCHAR(10),
  datanascita DATE,
  altezzacm INT,
  pesokg NUMERIC(5,2),
  allergie TEXT,
  obiettivodieta VARCHAR(100),
  obiettivoallenamento VARCHAR(100),
  livellofitness VARCHAR(50),
  noteaggiuntive TEXT
);

ALTER TABLE lptapp.profiloutente ADD COLUMN IF NOT EXISTS cognome VARCHAR(100);
ALTER TABLE lptapp.profiloutente ADD COLUMN IF NOT EXISTS durata_allenamento_minuti INT;
ALTER TABLE lptapp.profiloutente ADD COLUMN IF NOT EXISTS giorni_allenamento TEXT;

-- Coach <-> athlete relationship (who trains whom)
CREATE TABLE IF NOT EXISTS lptapp.pt_clienti (
  pt_cliente_id SERIAL PRIMARY KEY,
  pt_userid INT NOT NULL REFERENCES lptapp.utenti(utenteid) ON DELETE CASCADE,
  cliente_userid INT NOT NULL REFERENCES lptapp.utenti(utenteid) ON DELETE CASCADE,
  attivo INT NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(pt_userid, cliente_userid)
);

-- ---------- Legacy strength workout model (kept for compatibility) ----------
CREATE TABLE IF NOT EXISTS lptapp.schedeallenamento (
  schedaid SERIAL PRIMARY KEY,
  utenteid INT NOT NULL REFERENCES lptapp.utenti(utenteid) ON DELETE CASCADE,
  nomescheda VARCHAR(100),
  datainizio DATE,
  datafine DATE,
  attiva INT NOT NULL DEFAULT 1,
  notegenerali TEXT
);

CREATE TABLE IF NOT EXISTS lptapp.esercizischeda (
  esercizioid SERIAL PRIMARY KEY,
  schedaid INT NOT NULL REFERENCES lptapp.schedeallenamento(schedaid) ON DELETE CASCADE,
  nomeesercizio VARCHAR(100),
  serie INT,
  ripetizioni VARCHAR(50),
  descrizione TEXT,
  videourl VARCHAR(255),
  recupero VARCHAR(50),
  noteutente TEXT
);

CREATE TABLE IF NOT EXISTS lptapp.workouttemplates (
  templateid SERIAL PRIMARY KEY,
  ptuserid INT NOT NULL REFERENCES lptapp.utenti(utenteid) ON DELETE CASCADE,
  nometemplate VARCHAR(150) NOT NULL,
  notegenerali TEXT,
  tipo VARCHAR(30) NOT NULL DEFAULT 'forza',
  durata_minuti INT,
  durata_secondi INT,
  endurance_json TEXT,
  createdat TIMESTAMP DEFAULT NOW(),
  updatedat TIMESTAMP
);

CREATE TABLE IF NOT EXISTS lptapp.workouttemplateexercises (
  templateexerciseid SERIAL PRIMARY KEY,
  templateid INT NOT NULL REFERENCES lptapp.workouttemplates(templateid) ON DELETE CASCADE,
  nomeesercizio VARCHAR(100) NOT NULL,
  serie INT,
  ripetizioni VARCHAR(50),
  descrizione TEXT,
  videourl VARCHAR(255),
  recupero VARCHAR(50),
  carico VARCHAR(50),
  orderindex INT
);

CREATE TABLE IF NOT EXISTS lptapp.esercizifull (
  esercizioid SERIAL PRIMARY KEY,
  nomeesercizio VARCHAR(150) NOT NULL
);

-- ---------- NEW: calendar-first workout model (core of the redesign) ----------
-- One row = one workout shown on a single calendar day, for one athlete.
CREATE TABLE IF NOT EXISTS lptapp.calendar_workouts (
  workout_id SERIAL PRIMARY KEY,
  utenteid INT NOT NULL REFERENCES lptapp.utenti(utenteid) ON DELETE CASCADE,
  coach_userid INT REFERENCES lptapp.utenti(utenteid) ON DELETE SET NULL,
  data DATE NOT NULL,
  tipo VARCHAR(30) NOT NULL DEFAULT 'forza', -- forza | endurance | riposo | test | mobilita
  titolo VARCHAR(200) NOT NULL,
  descrizione TEXT,
  durata_minuti INT,
  durata_secondi INT,
  rpe_pianificato SMALLINT,
  colore VARCHAR(20),
  stato VARCHAR(20) NOT NULL DEFAULT 'pianificato', -- pianificato | completato | saltato
  schedaid INT REFERENCES lptapp.schedeallenamento(schedaid) ON DELETE SET NULL,
  endurance_session_id INT,
  order_index INT DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

ALTER TABLE lptapp.calendar_workouts ADD COLUMN IF NOT EXISTS external_id VARCHAR(100);
ALTER TABLE lptapp.calendar_workouts ADD COLUMN IF NOT EXISTS external_provider VARCHAR(50);
ALTER TABLE lptapp.calendar_workouts ADD COLUMN IF NOT EXISTS distance_km NUMERIC(6,2);
ALTER TABLE lptapp.calendar_workouts ADD COLUMN IF NOT EXISTS avg_hr INT;
ALTER TABLE lptapp.calendar_workouts ADD COLUMN IF NOT EXISTS elev_gain_m INT;
ALTER TABLE lptapp.calendar_workouts ADD COLUMN IF NOT EXISTS sport VARCHAR(20); -- corsa | ciclismo | nuoto

CREATE INDEX IF NOT EXISTS idx_calendar_workouts_utente_data ON lptapp.calendar_workouts(utenteid, data);
CREATE INDEX IF NOT EXISTS idx_calendar_workouts_coach ON lptapp.calendar_workouts(coach_userid, data);
CREATE INDEX IF NOT EXISTS idx_calendar_workouts_external ON lptapp.calendar_workouts(utenteid, external_provider, external_id);

-- Exercises attached directly to a calendar workout (simple strength blocks)
CREATE TABLE IF NOT EXISTS lptapp.calendar_workout_exercises (
  exercise_id SERIAL PRIMARY KEY,
  workout_id INT NOT NULL REFERENCES lptapp.calendar_workouts(workout_id) ON DELETE CASCADE,
  nome VARCHAR(150) NOT NULL,
  serie INT,
  ripetizioni VARCHAR(50),
  carico VARCHAR(50),
  recupero VARCHAR(50),
  note TEXT,
  video_url VARCHAR(255),
  order_index INT DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_calendar_workout_exercises_workout ON lptapp.calendar_workout_exercises(workout_id);

-- Athlete feedback for a specific calendar workout
CREATE TABLE IF NOT EXISTS lptapp.workout_feedback (
  feedback_id SERIAL PRIMARY KEY,
  workout_id INT NOT NULL REFERENCES lptapp.calendar_workouts(workout_id) ON DELETE CASCADE,
  utenteid INT NOT NULL REFERENCES lptapp.utenti(utenteid) ON DELETE CASCADE,
  completato INT NOT NULL DEFAULT 0,
  rpe SMALLINT,
  sensazione VARCHAR(20), -- ottimo | buono | normale | difficile | pessimo
  durata_effettiva_minuti INT,
  note TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(workout_id, utenteid)
);

-- ---------- Diets (kept, minimal) ----------
CREATE TABLE IF NOT EXISTS lptapp.diete (
  dietaid SERIAL PRIMARY KEY,
  utenteid INT NOT NULL REFERENCES lptapp.utenti(utenteid) ON DELETE CASCADE,
  datainizio DATE,
  datafine DATE,
  attiva INT NOT NULL DEFAULT 1,
  notegenerali TEXT,
  macrototali VARCHAR(255),
  nome VARCHAR(120)
);

CREATE TABLE IF NOT EXISTS lptapp.pastidieta (
  pastoid SERIAL PRIMARY KEY,
  dietaid INT NOT NULL REFERENCES lptapp.diete(dietaid) ON DELETE CASCADE,
  giorno_settimana VARCHAR(20) DEFAULT 'Lunedi',
  tipopasto VARCHAR(50),
  descrizione TEXT
);

ALTER TABLE lptapp.pastidieta ADD COLUMN IF NOT EXISTS giorno_settimana VARCHAR(20) DEFAULT 'Lunedi';
ALTER TABLE lptapp.pastidieta ADD COLUMN IF NOT EXISTS alimenti_json TEXT; -- { manuale, alimenti: [{ grams, food: { code, product_name, energy_kcal_100g, proteins_100g, carbohydrates_100g, fat_100g } }] }
ALTER TABLE lptapp.diete ADD COLUMN IF NOT EXISTS fabbisogno_json TEXT; -- parametri del calcolatore fabbisogno

-- ---------- Videos ----------
CREATE TABLE IF NOT EXISTS lptapp.videotutorial (
  videoid SERIAL PRIMARY KEY,
  titolo VARCHAR(100),
  esercizioid INT,
  descrizione TEXT,
  videourl VARCHAR(255),
  creatodaid INT REFERENCES lptapp.utenti(utenteid),
  datacaricamento TIMESTAMP DEFAULT NOW()
);

-- ---------- Payments ----------
CREATE TABLE IF NOT EXISTS lptapp.pagamenti (
  pagamentoid SERIAL PRIMARY KEY,
  utenteid INT NOT NULL REFERENCES lptapp.utenti(utenteid) ON DELETE CASCADE,
  datapagamento TIMESTAMP,
  importo NUMERIC(10,2) NOT NULL,
  scadenza DATE,
  causale VARCHAR(255),
  creatodaid INT REFERENCES lptapp.utenti(utenteid),
  datacreazione TIMESTAMP DEFAULT NOW(),
  stato VARCHAR(30) DEFAULT 'In sospeso'
);

-- ---------- Nutrition reference data ----------
CREATE TABLE IF NOT EXISTS lptapp.foodcompositionraw (
  food_code VARCHAR(50) PRIMARY KEY,
  name VARCHAR(255),
  category VARCHAR(255),
  energy_kcal NUMERIC(10,3),
  available_carbohydrates NUMERIC(10,3),
  lipids NUMERIC(10,3),
  proteins NUMERIC(10,3),
  soluble_sugars NUMERIC(10,3),
  total_fiber NUMERIC(10,3)
);

CREATE TABLE IF NOT EXISTS lptapp.food_and_nutritional_value (
  code VARCHAR(50) PRIMARY KEY,
  product_name VARCHAR(255),
  brands VARCHAR(255),
  categories TEXT,
  ingredients_text TEXT,
  energy_kcal_100g NUMERIC(10,3),
  carbohydrates_100g NUMERIC(10,3),
  fat_100g NUMERIC(10,3),
  proteins_100g NUMERIC(10,3),
  sugars_100g NUMERIC(10,3),
  fiber_100g NUMERIC(10,3),
  sodium_100g NUMERIC(10,3)
);

-- ---------- Endurance module (kept, unchanged) ----------
CREATE TABLE IF NOT EXISTS lptapp.endurance_plans (
  plan_id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES lptapp.utenti(utenteid) ON DELETE CASCADE,
  title VARCHAR(200) NOT NULL,
  block VARCHAR(20) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  weeks INT NOT NULL,
  weekly_volume_minutes INT,
  intensity_distribution VARCHAR(50),
  long_session_target VARCHAR(50),
  notes TEXT,
  is_active INT NOT NULL DEFAULT 1,
  zones_json TEXT,
  auto_progression INT,
  goal_title VARCHAR(200),
  goal_date DATE,
  goal_type VARCHAR(100),
  notifications_enabled INT,
  integrations_json TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lptapp.endurance_sessions (
  session_id SERIAL PRIMARY KEY,
  plan_id INT NOT NULL REFERENCES lptapp.endurance_plans(plan_id) ON DELETE CASCADE,
  day_of_week SMALLINT,
  "date" DATE,
  title VARCHAR(200) NOT NULL,
  zone VARCHAR(10),
  duration_minutes INT NOT NULL,
  duration_seconds INT,
  target VARCHAR(100),
  description TEXT,
  order_index INT,
  created_at TIMESTAMP DEFAULT NOW(),
  steps_text TEXT,
  steps_json TEXT,
  rpe_target SMALLINT,
  updated_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE lptapp.endurance_sessions ADD COLUMN IF NOT EXISTS sport VARCHAR(20);
ALTER TABLE lptapp.endurance_sessions ADD COLUMN IF NOT EXISTS elevation_m INT;
ALTER TABLE lptapp.endurance_sessions ADD COLUMN IF NOT EXISTS video_urls_json TEXT;

-- Libreria blocchi del coach (CoachPeaking: blocchi riutilizzabili negli allenamenti)
CREATE TABLE IF NOT EXISTS lptapp.endurance_block_library (
  block_id SERIAL PRIMARY KEY,
  pt_user_id INT NOT NULL REFERENCES lptapp.utenti(utenteid) ON DELETE CASCADE,
  sport VARCHAR(20),
  title VARCHAR(200) NOT NULL,
  block_json TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_endurance_block_library_coach ON lptapp.endurance_block_library(pt_user_id);

CREATE TABLE IF NOT EXISTS lptapp.endurance_checkins (
  checkin_id SERIAL PRIMARY KEY,
  session_id INT NOT NULL REFERENCES lptapp.endurance_sessions(session_id) ON DELETE CASCADE,
  user_id INT NOT NULL REFERENCES lptapp.utenti(utenteid) ON DELETE CASCADE,
  completed INT NOT NULL DEFAULT 0,
  performed_duration_minutes INT,
  distance_km NUMERIC(6,2),
  rpe SMALLINT,
  avg_hr INT,
  notes TEXT,
  feedback TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lptapp.endurance_zones (
  user_id INT PRIMARY KEY REFERENCES lptapp.utenti(utenteid) ON DELETE CASCADE,
  zones_json TEXT,
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lptapp.endurance_metrics_weekly (
  id SERIAL PRIMARY KEY,
  plan_id INT NOT NULL REFERENCES lptapp.endurance_plans(plan_id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  planned_minutes INT,
  completed_minutes INT,
  adherence_pct NUMERIC(5,2),
  tss NUMERIC(10,2),
  ctl NUMERIC(10,2),
  atl NUMERIC(10,2),
  tsb NUMERIC(10,2)
);

CREATE TABLE IF NOT EXISTS lptapp.endurance_goals (
  goal_id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES lptapp.utenti(utenteid) ON DELETE CASCADE,
  title VARCHAR(200) NOT NULL,
  goal_date DATE NOT NULL,
  goal_type VARCHAR(100),
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lptapp.endurance_notifications (
  user_id INT PRIMARY KEY REFERENCES lptapp.utenti(utenteid) ON DELETE CASCADE,
  enabled INT NOT NULL DEFAULT 1,
  preferences_json TEXT,
  updated_at TIMESTAMP DEFAULT NOW()
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

CREATE TABLE IF NOT EXISTS lptapp.endurance_integrations (
  integration_id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES lptapp.utenti(utenteid) ON DELETE CASCADE,
  provider VARCHAR(20) NOT NULL,
  connected INT NOT NULL DEFAULT 0,
  data_json TEXT,
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, provider)
);

CREATE TABLE IF NOT EXISTS lptapp.endurance_plan_templates (
  template_id SERIAL PRIMARY KEY,
  pt_user_id INT NOT NULL REFERENCES lptapp.utenti(utenteid) ON DELETE CASCADE,
  title VARCHAR(200) NOT NULL,
  block VARCHAR(20) NOT NULL,
  weeks INT NOT NULL,
  weekly_volume_minutes INT,
  intensity_distribution VARCHAR(50),
  long_session_target VARCHAR(50),
  notes TEXT,
  zones_json TEXT,
  auto_progression INT,
  goal_title VARCHAR(200),
  goal_date DATE,
  goal_type VARCHAR(100),
  notifications_enabled INT,
  integrations_json TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lptapp.endurance_plan_template_sessions (
  template_session_id SERIAL PRIMARY KEY,
  template_id INT NOT NULL REFERENCES lptapp.endurance_plan_templates(template_id) ON DELETE CASCADE,
  day_of_week SMALLINT,
  title VARCHAR(200) NOT NULL,
  zone VARCHAR(10),
  duration_minutes INT NOT NULL,
  target VARCHAR(100),
  description TEXT,
  order_index INT,
  steps_text TEXT,
  steps_json TEXT,
  rpe_target SMALLINT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ---------- Tests & training zones ----------
CREATE TABLE IF NOT EXISTS lptapp.test_types (
  test_type_id SERIAL PRIMARY KEY,
  sport VARCHAR(20) NOT NULL,
  code VARCHAR(80) NOT NULL,
  label VARCHAR(150) NOT NULL,
  result_unit VARCHAR(30) NOT NULL,
  result_label VARCHAR(100),
  zone_calc_method VARCHAR(80),
  description TEXT,
  warmup_protocol TEXT,
  test_instructions TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lptapp.athlete_test_results (
  test_result_id SERIAL PRIMARY KEY,
  athlete_id INT NOT NULL REFERENCES lptapp.utenti(utenteid) ON DELETE CASCADE,
  test_type_id INT NOT NULL REFERENCES lptapp.test_types(test_type_id) ON DELETE CASCADE,
  test_date DATE NOT NULL,
  raw_result VARCHAR(100) NOT NULL,
  notes TEXT,
  computed_zones JSONB,
  computed_efficiency_zones JSONB,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ---------- Training zones ----------
CREATE TABLE IF NOT EXISTS lptapp.training_zone_sets (
  zone_set_id SERIAL PRIMARY KEY,
  athlete_id INT NOT NULL REFERENCES lptapp.utenti(utenteid) ON DELETE CASCADE,
  sport VARCHAR(20),
  source_test_result_id INT REFERENCES lptapp.athlete_test_results(test_result_id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  zones JSONB,
  efficiency_zones JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_training_zone_sets_athlete ON lptapp.training_zone_sets(athlete_id);

-- ---------- Notifiche e check fotografici ----------
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

-- ---------- Note atleta sugli esercizi e collegamento video ----------
-- Note dell'atleta sul singolo esercizio (scheda palestra e allenamenti del calendario)
ALTER TABLE lptapp.esercizischeda ADD COLUMN IF NOT EXISTS note_atleta TEXT;
ALTER TABLE lptapp.esercizischeda ADD COLUMN IF NOT EXISTS note_atleta_at TIMESTAMP;
ALTER TABLE lptapp.calendar_workout_exercises ADD COLUMN IF NOT EXISTS note_atleta TEXT;
ALTER TABLE lptapp.calendar_workout_exercises ADD COLUMN IF NOT EXISTS note_atleta_at TIMESTAMP;

-- Video gia' caricati senza esercizio collegato: li collega all'esercizio con lo stesso nome
UPDATE lptapp.videotutorial v SET esercizioid = ef.esercizioid
FROM lptapp.esercizifull ef
WHERE v.esercizioid IS NULL AND LOWER(TRIM(v.titolo)) = LOWER(TRIM(ef.nomeesercizio));

CREATE INDEX IF NOT EXISTS idx_videotutorial_esercizio ON lptapp.videotutorial(esercizioid);
CREATE INDEX IF NOT EXISTS idx_esercizifull_nome_lower ON lptapp.esercizifull(LOWER(TRIM(nomeesercizio)));
-- 1) Sezione endurance visibile per singolo atleta (scelta dal coach nella sezione Atleti).
--    NULL = nessuna scelta: vale l'impostazione precedente del coach (utenti.endurance_enabled).
ALTER TABLE lptapp.utenti ADD COLUMN IF NOT EXISTS endurance_visibile BOOLEAN;

-- 2) Video di esecuzione e dubbi dell'atleta sul singolo esercizio di un allenamento di forza
CREATE TABLE IF NOT EXISTS lptapp.esecuzioni_video (
  esecuzione_id SERIAL PRIMARY KEY,
  exercise_id INT NOT NULL UNIQUE REFERENCES lptapp.calendar_workout_exercises(exercise_id) ON DELETE CASCADE,
  workout_id INT NOT NULL REFERENCES lptapp.calendar_workouts(workout_id) ON DELETE CASCADE,
  utenteid INT NOT NULL REFERENCES lptapp.utenti(utenteid) ON DELETE CASCADE,
  storage_key TEXT,
  mime VARCHAR(80),
  size_bytes INT,
  dubbi TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_esecuzioni_video_workout ON lptapp.esecuzioni_video(workout_id);

-- 3) Report dell'allenamento inviato dall'atleta al coach (video, note, dubbi, feedback)
CREATE TABLE IF NOT EXISTS lptapp.workout_reports (
  report_id SERIAL PRIMARY KEY,
  workout_id INT NOT NULL UNIQUE REFERENCES lptapp.calendar_workouts(workout_id) ON DELETE CASCADE,
  athlete_id INT NOT NULL REFERENCES lptapp.utenti(utenteid) ON DELETE CASCADE,
  coach_id INT REFERENCES lptapp.utenti(utenteid) ON DELETE SET NULL,
  contenuto_json TEXT,
  inviato_at TIMESTAMP NOT NULL DEFAULT NOW(),
  letto_at TIMESTAMP,
  risposta TEXT,
  risposta_at TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_workout_reports_coach ON lptapp.workout_reports(coach_id, inviato_at DESC);

-- Dati campione delle attivita' importate (FC, passo/velocita', quota, potenza, cadenza, giri)
-- per i grafici nel dettaglio dell'allenamento endurance.
CREATE TABLE IF NOT EXISTS lptapp.activity_streams (
  workout_id INT PRIMARY KEY REFERENCES lptapp.calendar_workouts(workout_id) ON DELETE CASCADE,
  source VARCHAR(20),
  samples_json TEXT,
  laps_json TEXT,
  zone_seconds_json TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Libreria unica del coach: piani di piu' settimane composti da allenamenti della libreria
-- (workouttemplates), da assegnare in un colpo al calendario di uno o piu' atleti.
CREATE TABLE IF NOT EXISTS lptapp.library_plans (
  plan_id SERIAL PRIMARY KEY,
  ptuserid INT NOT NULL REFERENCES lptapp.utenti(utenteid) ON DELETE CASCADE,
  nome VARCHAR(150) NOT NULL,
  descrizione TEXT,
  settimane INT NOT NULL DEFAULT 4,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP
);
CREATE TABLE IF NOT EXISTS lptapp.library_plan_items (
  item_id SERIAL PRIMARY KEY,
  plan_id INT NOT NULL REFERENCES lptapp.library_plans(plan_id) ON DELETE CASCADE,
  templateid INT NOT NULL REFERENCES lptapp.workouttemplates(templateid) ON DELETE CASCADE,
  settimana INT NOT NULL,
  giorno INT NOT NULL CHECK (giorno BETWEEN 1 AND 7)
);
CREATE INDEX IF NOT EXISTS idx_library_plan_items_plan ON lptapp.library_plan_items(plan_id);

-- Consigli del coach all'atleta (compaiono nella Home dell'atleta)
CREATE TABLE IF NOT EXISTS lptapp.coach_tips (
  tip_id SERIAL PRIMARY KEY,
  coach_id INT REFERENCES lptapp.utenti(utenteid) ON DELETE SET NULL,
  athlete_id INT NOT NULL REFERENCES lptapp.utenti(utenteid) ON DELETE CASCADE,
  testo TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_coach_tips_athlete ON lptapp.coach_tips(athlete_id, created_at DESC);

-- Schede di pesistica: 'settimanale' (ogni giorno si ripete ogni 7 giorni dalla sua data)
-- oppure 'auto' (giorni distribuiti sui giorni di allenamento indicati dall'atleta nel profilo)
ALTER TABLE lptapp.schedeallenamento ADD COLUMN IF NOT EXISTS programmazione VARCHAR(20) NOT NULL DEFAULT 'settimanale';

-- 20261123_ordine_esercizi_cognome.sql
-- Ordine degli esercizi nelle schede di pesistica (trascinabili dall'editor)
ALTER TABLE lptapp.esercizischeda ADD COLUMN IF NOT EXISTS order_index INT;
UPDATE lptapp.esercizischeda e SET order_index = o.pos
FROM (SELECT esercizioid, ROW_NUMBER() OVER (PARTITION BY schedaid ORDER BY esercizioid) - 1 AS pos FROM lptapp.esercizischeda) o
WHERE e.esercizioid = o.esercizioid AND e.order_index IS NULL;

-- Giorni della settimana scelti per la programmazione automatica (es. "1,3,5"), usati se si allunga la scadenza
ALTER TABLE lptapp.schedeallenamento ADD COLUMN IF NOT EXISTS giorni_settimana VARCHAR(20);

-- Cognome separato dal nome nella tabella utenti
ALTER TABLE lptapp.utenti ADD COLUMN IF NOT EXISTS cognome VARCHAR(100);
-- 1) cognome gia' presente nel profilo: lo copia e lo toglie dalla fine del nome ("Mario Rossi" + "Rossi" -> "Mario")
UPDATE lptapp.utenti u SET
  cognome = TRIM(p.cognome),
  nome = CASE WHEN LOWER(TRIM(u.nome)) LIKE '% ' || LOWER(TRIM(p.cognome))
              THEN TRIM(LEFT(TRIM(u.nome), LENGTH(TRIM(u.nome)) - LENGTH(TRIM(p.cognome))))
              ELSE TRIM(u.nome) END
FROM lptapp.profiloutente p
WHERE p.utenteid = u.utenteid AND u.cognome IS NULL AND COALESCE(TRIM(p.cognome), '') <> '';
-- 2) nessun cognome nel profilo e nome di due parole: "Mario Rossi" -> nome "Mario", cognome "Rossi"
UPDATE lptapp.utenti SET
  nome = regexp_replace(TRIM(nome), '\s+\S+$', ''),
  cognome = regexp_replace(TRIM(nome), '^\S+\s+', '')
WHERE cognome IS NULL AND TRIM(nome) ~ '^\S+\s+\S+$';
-- 3) restano da sistemare a mano (nomi di tre o piu' parole o senza cognome): controlla con
--    SELECT utenteid, nome, cognome, email FROM lptapp.utenti WHERE COALESCE(cognome, '') = '';

-- Sezione dieta visibile o no per singolo atleta (NULL = visibile)
ALTER TABLE lptapp.utenti ADD COLUMN IF NOT EXISTS dieta_visibile BOOLEAN;

-- 20261124_serie_eseguite.sql
-- Serie eseguite dall'atleta per ogni esercizio degli allenamenti di forza: [{"reps":8,"kg":60,"fatta":true}, ...]
-- Servono per l'analisi (volume, carico massimo, 1RM stimato, progressi rispetto alle volte precedenti).
ALTER TABLE lptapp.calendar_workout_exercises ADD COLUMN IF NOT EXISTS serie_eseguite_json TEXT;

-- 20261125_piani_assegnati.sql
-- Piani della libreria assegnati agli atleti: restano visibili (attivi, futuri e conclusi)
-- nelle sezioni Pesistica ed Endurance, con gli allenamenti creati in calendario.
CREATE TABLE IF NOT EXISTS lptapp.plan_assignments (
  assignment_id SERIAL PRIMARY KEY,
  plan_id INT REFERENCES lptapp.library_plans(plan_id) ON DELETE SET NULL,
  coach_id INT NOT NULL REFERENCES lptapp.utenti(utenteid) ON DELETE CASCADE,
  utenteid INT NOT NULL REFERENCES lptapp.utenti(utenteid) ON DELETE CASCADE,
  nome VARCHAR(150) NOT NULL,
  descrizione TEXT,
  settimane INT,
  data_inizio DATE NOT NULL,
  data_fine DATE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_plan_assignments_utente ON lptapp.plan_assignments(utenteid);
ALTER TABLE lptapp.calendar_workouts ADD COLUMN IF NOT EXISTS plan_assignment_id INT REFERENCES lptapp.plan_assignments(assignment_id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_calendar_workouts_plan_assignment ON lptapp.calendar_workouts(plan_assignment_id);

-- 20261126_developer_privacy_email.sql
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
