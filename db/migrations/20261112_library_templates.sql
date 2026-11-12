ALTER TABLE lptapp.workouttemplates ADD COLUMN IF NOT EXISTS tipo VARCHAR(30) NOT NULL DEFAULT 'forza';
ALTER TABLE lptapp.workouttemplates ADD COLUMN IF NOT EXISTS durata_minuti INT;
ALTER TABLE lptapp.workouttemplates ADD COLUMN IF NOT EXISTS durata_secondi INT;
ALTER TABLE lptapp.workouttemplates ADD COLUMN IF NOT EXISTS endurance_json TEXT;
ALTER TABLE lptapp.workouttemplateexercises ADD COLUMN IF NOT EXISTS carico VARCHAR(50);
