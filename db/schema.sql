-- ============================================================================
-- LPT Coach - Consolidated Neon Postgres schema
-- Same table names/columns as the legacy LPTapp DB (Postgres dialect), plus
-- the new calendar-first workout model that powers the redesigned app.
-- Safe to run multiple times (IF NOT EXISTS everywhere).
-- ============================================================================

-- ---------- Core users ----------
CREATE TABLE IF NOT EXISTS utenti (
  utenteid SERIAL PRIMARY KEY,
  nome VARCHAR(100) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  passwordhash VARCHAR(255) NOT NULL,
  ruolo VARCHAR(30) NOT NULL, -- 'cliente' | 'personal_trainer'
  dataregistrazione TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS profiloutente (
  profiloid SERIAL PRIMARY KEY,
  utenteid INT NOT NULL UNIQUE REFERENCES utenti(utenteid) ON DELETE CASCADE,
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

-- Coach <-> athlete relationship (who trains whom)
CREATE TABLE IF NOT EXISTS pt_clienti (
  pt_cliente_id SERIAL PRIMARY KEY,
  pt_userid INT NOT NULL REFERENCES utenti(utenteid) ON DELETE CASCADE,
  cliente_userid INT NOT NULL REFERENCES utenti(utenteid) ON DELETE CASCADE,
  attivo INT NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(pt_userid, cliente_userid)
);

-- ---------- Legacy strength workout model (kept for compatibility) ----------
CREATE TABLE IF NOT EXISTS schedeallenamento (
  schedaid SERIAL PRIMARY KEY,
  utenteid INT NOT NULL REFERENCES utenti(utenteid) ON DELETE CASCADE,
  nomescheda VARCHAR(100),
  datainizio DATE,
  datafine DATE,
  attiva INT NOT NULL DEFAULT 1,
  notegenerali TEXT
);

CREATE TABLE IF NOT EXISTS esercizischeda (
  esercizioid SERIAL PRIMARY KEY,
  schedaid INT NOT NULL REFERENCES schedeallenamento(schedaid) ON DELETE CASCADE,
  nomeesercizio VARCHAR(100),
  serie INT,
  ripetizioni VARCHAR(50),
  descrizione TEXT,
  videourl VARCHAR(255),
  recupero VARCHAR(50),
  noteutente TEXT
);

CREATE TABLE IF NOT EXISTS workouttemplates (
  templateid SERIAL PRIMARY KEY,
  ptuserid INT NOT NULL REFERENCES utenti(utenteid) ON DELETE CASCADE,
  nometemplate VARCHAR(150) NOT NULL,
  notegenerali TEXT,
  createdat TIMESTAMP DEFAULT NOW(),
  updatedat TIMESTAMP
);

CREATE TABLE IF NOT EXISTS workouttemplateexercises (
  templateexerciseid SERIAL PRIMARY KEY,
  templateid INT NOT NULL REFERENCES workouttemplates(templateid) ON DELETE CASCADE,
  nomeesercizio VARCHAR(100) NOT NULL,
  serie INT,
  ripetizioni VARCHAR(50),
  descrizione TEXT,
  videourl VARCHAR(255),
  recupero VARCHAR(50),
  orderindex INT
);

CREATE TABLE IF NOT EXISTS esercizifull (
  esercizioid SERIAL PRIMARY KEY,
  nomeesercizio VARCHAR(150) NOT NULL
);

-- ---------- NEW: calendar-first workout model (core of the redesign) ----------
-- One row = one workout shown on a single calendar day, for one athlete.
CREATE TABLE IF NOT EXISTS calendar_workouts (
  workout_id SERIAL PRIMARY KEY,
  utenteid INT NOT NULL REFERENCES utenti(utenteid) ON DELETE CASCADE,
  coach_userid INT REFERENCES utenti(utenteid) ON DELETE SET NULL,
  data DATE NOT NULL,
  tipo VARCHAR(30) NOT NULL DEFAULT 'forza', -- forza | endurance | riposo | test | mobilita
  titolo VARCHAR(200) NOT NULL,
  descrizione TEXT,
  durata_minuti INT,
  rpe_pianificato SMALLINT,
  colore VARCHAR(20),
  stato VARCHAR(20) NOT NULL DEFAULT 'pianificato', -- pianificato | completato | saltato
  schedaid INT REFERENCES schedeallenamento(schedaid) ON DELETE SET NULL,
  endurance_session_id INT,
  order_index INT DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_calendar_workouts_utente_data ON calendar_workouts(utenteid, data);
CREATE INDEX IF NOT EXISTS idx_calendar_workouts_coach ON calendar_workouts(coach_userid, data);

-- Exercises attached directly to a calendar workout (simple strength blocks)
CREATE TABLE IF NOT EXISTS calendar_workout_exercises (
  exercise_id SERIAL PRIMARY KEY,
  workout_id INT NOT NULL REFERENCES calendar_workouts(workout_id) ON DELETE CASCADE,
  nome VARCHAR(150) NOT NULL,
  serie INT,
  ripetizioni VARCHAR(50),
  carico VARCHAR(50),
  recupero VARCHAR(50),
  note TEXT,
  video_url VARCHAR(255),
  order_index INT DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_calendar_workout_exercises_workout ON calendar_workout_exercises(workout_id);

-- Athlete feedback for a specific calendar workout
CREATE TABLE IF NOT EXISTS workout_feedback (
  feedback_id SERIAL PRIMARY KEY,
  workout_id INT NOT NULL REFERENCES calendar_workouts(workout_id) ON DELETE CASCADE,
  utenteid INT NOT NULL REFERENCES utenti(utenteid) ON DELETE CASCADE,
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
CREATE TABLE IF NOT EXISTS diete (
  dietaid SERIAL PRIMARY KEY,
  utenteid INT NOT NULL REFERENCES utenti(utenteid) ON DELETE CASCADE,
  datainizio DATE,
  datafine DATE,
  attiva INT NOT NULL DEFAULT 1,
  notegenerali TEXT,
  macrototali VARCHAR(255),
  nome VARCHAR(120)
);

CREATE TABLE IF NOT EXISTS pastidieta (
  pastoid SERIAL PRIMARY KEY,
  dietaid INT NOT NULL REFERENCES diete(dietaid) ON DELETE CASCADE,
  tipopasto VARCHAR(50),
  descrizione TEXT
);

-- ---------- Videos ----------
CREATE TABLE IF NOT EXISTS videotutorial (
  videoid SERIAL PRIMARY KEY,
  titolo VARCHAR(100),
  esercizioid INT,
  descrizione TEXT,
  videourl VARCHAR(255),
  creatodaid INT REFERENCES utenti(utenteid),
  datacaricamento TIMESTAMP DEFAULT NOW()
);

-- ---------- Payments ----------
CREATE TABLE IF NOT EXISTS pagamenti (
  pagamentoid SERIAL PRIMARY KEY,
  utenteid INT NOT NULL REFERENCES utenti(utenteid) ON DELETE CASCADE,
  datapagamento TIMESTAMP,
  importo NUMERIC(10,2) NOT NULL,
  scadenza DATE,
  causale VARCHAR(255),
  creatodaid INT REFERENCES utenti(utenteid),
  datacreazione TIMESTAMP DEFAULT NOW(),
  stato VARCHAR(30) DEFAULT 'In sospeso'
);

-- ---------- Nutrition reference data ----------
CREATE TABLE IF NOT EXISTS foodcompositionraw (
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

CREATE TABLE IF NOT EXISTS food_and_nutritional_value (
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
CREATE TABLE IF NOT EXISTS endurance_plans (
  plan_id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES utenti(utenteid) ON DELETE CASCADE,
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

CREATE TABLE IF NOT EXISTS endurance_sessions (
  session_id SERIAL PRIMARY KEY,
  plan_id INT NOT NULL REFERENCES endurance_plans(plan_id) ON DELETE CASCADE,
  day_of_week SMALLINT,
  "date" DATE,
  title VARCHAR(200) NOT NULL,
  zone VARCHAR(10),
  duration_minutes INT NOT NULL,
  target VARCHAR(100),
  description TEXT,
  order_index INT,
  created_at TIMESTAMP DEFAULT NOW(),
  steps_text TEXT,
  steps_json TEXT,
  rpe_target SMALLINT,
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS endurance_checkins (
  checkin_id SERIAL PRIMARY KEY,
  session_id INT NOT NULL REFERENCES endurance_sessions(session_id) ON DELETE CASCADE,
  user_id INT NOT NULL REFERENCES utenti(utenteid) ON DELETE CASCADE,
  completed INT NOT NULL DEFAULT 0,
  performed_duration_minutes INT,
  distance_km NUMERIC(6,2),
  rpe SMALLINT,
  avg_hr INT,
  notes TEXT,
  feedback TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS endurance_zones (
  user_id INT PRIMARY KEY REFERENCES utenti(utenteid) ON DELETE CASCADE,
  zones_json TEXT,
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS endurance_metrics_weekly (
  id SERIAL PRIMARY KEY,
  plan_id INT NOT NULL REFERENCES endurance_plans(plan_id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  planned_minutes INT,
  completed_minutes INT,
  adherence_pct NUMERIC(5,2),
  tss NUMERIC(10,2),
  ctl NUMERIC(10,2),
  atl NUMERIC(10,2),
  tsb NUMERIC(10,2)
);

CREATE TABLE IF NOT EXISTS endurance_goals (
  goal_id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES utenti(utenteid) ON DELETE CASCADE,
  title VARCHAR(200) NOT NULL,
  goal_date DATE NOT NULL,
  goal_type VARCHAR(100),
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS endurance_notifications (
  user_id INT PRIMARY KEY REFERENCES utenti(utenteid) ON DELETE CASCADE,
  enabled INT NOT NULL DEFAULT 1,
  preferences_json TEXT,
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS endurance_activities (
  activity_id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES utenti(utenteid) ON DELETE CASCADE,
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

CREATE TABLE IF NOT EXISTS endurance_integrations (
  integration_id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES utenti(utenteid) ON DELETE CASCADE,
  provider VARCHAR(20) NOT NULL,
  connected INT NOT NULL DEFAULT 0,
  data_json TEXT,
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, provider)
);

CREATE TABLE IF NOT EXISTS endurance_plan_templates (
  template_id SERIAL PRIMARY KEY,
  pt_user_id INT NOT NULL REFERENCES utenti(utenteid) ON DELETE CASCADE,
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

CREATE TABLE IF NOT EXISTS endurance_plan_template_sessions (
  template_session_id SERIAL PRIMARY KEY,
  template_id INT NOT NULL REFERENCES endurance_plan_templates(template_id) ON DELETE CASCADE,
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

-- ---------- Test & training zones ----------
CREATE TABLE IF NOT EXISTS training_zone_sets (
  zone_set_id SERIAL PRIMARY KEY,
  athlete_id INT NOT NULL REFERENCES utenti(utenteid) ON DELETE CASCADE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  zones JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_training_zone_sets_athlete ON training_zone_sets(athlete_id);
