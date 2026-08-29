-- Demo seed data. Password for both demo users: Demo1234!
-- Bcrypt hash below corresponds to "Demo1234!" (cost 10).
INSERT INTO utenti (nome, email, passwordhash, ruolo)
SELECT x.nome, x.email, x.passwordhash, x.ruolo
FROM (VALUES
  ('Marco Coach', 'coach.demo@lptcoach.local', '$2b$10$83.64ovff3YS.lGR9KpInefvZfBcH9Qch.7i.H8XKIINlz1Oz8mqi', 'personal_trainer'),
  ('Giulia Atleta', 'atleta.demo@lptcoach.local', '$2b$10$83.64ovff3YS.lGR9KpInefvZfBcH9Qch.7i.H8XKIINlz1Oz8mqi', 'cliente')
) AS x(nome, email, passwordhash, ruolo)
WHERE NOT EXISTS (SELECT 1 FROM utenti u WHERE u.email = x.email);

INSERT INTO pt_clienti (pt_userid, cliente_userid, attivo)
SELECT c.utenteid, a.utenteid, 1
FROM utenti c, utenti a
WHERE c.email = 'coach.demo@lptcoach.local' AND a.email = 'atleta.demo@lptcoach.local'
  AND NOT EXISTS (SELECT 1 FROM pt_clienti pc WHERE pc.pt_userid = c.utenteid AND pc.cliente_userid = a.utenteid);

INSERT INTO calendar_workouts (utenteid, coach_userid, data, tipo, titolo, descrizione, durata_minuti, rpe_pianificato, colore, stato)
SELECT a.utenteid, c.utenteid, CURRENT_DATE, 'forza', 'Full Body A', 'Squat, panca, rematore', 60, 7, '#2563eb', 'pianificato'
FROM utenti a, utenti c
WHERE a.email = 'atleta.demo@lptcoach.local' AND c.email = 'coach.demo@lptcoach.local'
  AND NOT EXISTS (SELECT 1 FROM calendar_workouts w WHERE w.utenteid = a.utenteid AND w.titolo = 'Full Body A' AND w.data = CURRENT_DATE);

INSERT INTO calendar_workout_exercises (workout_id, nome, serie, ripetizioni, carico, recupero, order_index)
SELECT w.workout_id, x.nome, x.serie, x.ripetizioni, x.carico, x.recupero, x.order_index
FROM calendar_workouts w
JOIN (VALUES
  ('Squat', 4, '8', '70kg', '90s', 0),
  ('Panca piana', 4, '8', '50kg', '90s', 1),
  ('Rematore bilanciere', 3, '10', '40kg', '60s', 2)
) AS x(nome, serie, ripetizioni, carico, recupero, order_index) ON true
WHERE w.titolo = 'Full Body A' AND w.data = CURRENT_DATE
  AND NOT EXISTS (SELECT 1 FROM calendar_workout_exercises e WHERE e.workout_id = w.workout_id AND e.nome = x.nome);

INSERT INTO calendar_workouts (utenteid, coach_userid, data, tipo, titolo, descrizione, durata_minuti, rpe_pianificato, colore, stato)
SELECT a.utenteid, c.utenteid, CURRENT_DATE + INTERVAL '2 day', 'endurance', 'Corsa lenta Z2', 'Fondo aerobico', 45, 4, '#16a34a', 'pianificato'
FROM utenti a, utenti c
WHERE a.email = 'atleta.demo@lptcoach.local' AND c.email = 'coach.demo@lptcoach.local'
  AND NOT EXISTS (SELECT 1 FROM calendar_workouts w WHERE w.utenteid = a.utenteid AND w.titolo = 'Corsa lenta Z2');

INSERT INTO calendar_workouts (utenteid, coach_userid, data, tipo, titolo, descrizione, durata_minuti, colore, stato)
SELECT a.utenteid, c.utenteid, CURRENT_DATE - INTERVAL '2 day', 'riposo', 'Riposo attivo', 'Stretching e mobilita', 20, '#9ca3af', 'completato'
FROM utenti a, utenti c
WHERE a.email = 'atleta.demo@lptcoach.local' AND c.email = 'coach.demo@lptcoach.local'
  AND NOT EXISTS (SELECT 1 FROM calendar_workouts w WHERE w.utenteid = a.utenteid AND w.titolo = 'Riposo attivo');
