-- Interruttore unico per le sezioni "Check fotografici" e "Valutazione corporea" dell'atleta
ALTER TABLE lptapp.utenti ADD COLUMN IF NOT EXISTS progressi_visibile BOOLEAN NOT NULL DEFAULT TRUE;
-- Data in cui fare la prossima valutazione corporea (avviso nel Coach Assistant nei 7 giorni prima)
ALTER TABLE lptapp.body_assessments ADD COLUMN IF NOT EXISTS prossima_data DATE;
