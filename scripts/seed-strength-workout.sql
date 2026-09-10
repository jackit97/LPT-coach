-- Demo strength schedule for the existing athlete gc.jack1997@gmail.com.
-- Safe to run repeatedly: sheet and exercise inserts are duplicate-guarded.

INSERT INTO lptapp.schedeallenamento (utenteid, nomescheda, datainizio, datafine, attiva, notegenerali)
SELECT u.utenteid, x.nome_scheda, x.data_scheda, x.data_scheda, 1, 'Scheda dimostrativa con tre giornate di allenamento'
FROM lptapp.utenti u
CROSS JOIN (VALUES
  ('Scheda forza - Giorno A', CURRENT_DATE),
  ('Scheda forza - Giorno B', CURRENT_DATE + 2),
  ('Scheda forza - Giorno C', CURRENT_DATE + 4)
) x(nome_scheda, data_scheda)
WHERE u.email = 'gc.jack1997@gmail.com' AND u.ruolo = 'cliente'
  AND NOT EXISTS (SELECT 1 FROM lptapp.schedeallenamento s WHERE s.utenteid = u.utenteid AND s.nomescheda = x.nome_scheda);

INSERT INTO lptapp.esercizischeda (schedaid, nomeesercizio, serie, ripetizioni, descrizione, recupero)
SELECT s.schedaid, x.nome, x.serie, x.ripetizioni, x.descrizione, x.recupero
FROM lptapp.schedeallenamento s
JOIN lptapp.utenti u ON u.utenteid = s.utenteid
JOIN (VALUES
  ('Scheda forza - Giorno A', 'Squat', 4, '8', 'Lower body principale', '90s'),
  ('Scheda forza - Giorno A', 'Panca piana', 4, '8', 'Spinta orizzontale', '90s'),
  ('Scheda forza - Giorno B', 'Trazioni', 4, '6', 'Tirata verticale', '120s'),
  ('Scheda forza - Giorno B', 'Military press manubri', 3, '10', 'Spalle', '75s'),
  ('Scheda forza - Giorno C', 'Affondi manubri', 3, '10', 'Gambe e stabilita', '90s'),
  ('Scheda forza - Giorno C', 'Alzate posteriori', 3, '12', 'Deltoidi posteriori', '60s')
) x(nome_scheda, nome, serie, ripetizioni, descrizione, recupero) ON true
JOIN lptapp.esercizifull catalog ON catalog.nomeesercizio = x.nome
WHERE u.email = 'gc.jack1997@gmail.com'
  AND s.nomescheda = x.nome_scheda
  AND NOT EXISTS (SELECT 1 FROM lptapp.esercizischeda e WHERE e.schedaid = s.schedaid AND e.nomeesercizio = x.nome);