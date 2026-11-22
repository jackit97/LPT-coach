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
