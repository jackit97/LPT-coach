import { Hono } from 'hono';
import { db } from '../db.js';
import { authenticate, roleCheck } from '../auth.js';

const app = new Hono();
app.use('*', authenticate());

// Current user profile
app.get('/me', async (c) => {
  const user = c.get('user');
  const sql = db(c.env);
  const rows = await sql`
    SELECT u.utenteid, u.nome, u.email, u.ruolo, u.dataregistrazione, u.endurance_enabled,
           p.cognome, p.pesokg, p.altezzacm, p.obiettivoallenamento,
           p.durata_allenamento_minuti, p.giorni_allenamento, p.livellofitness,
           p.datanascita, p.sesso
    FROM utenti u LEFT JOIN profiloutente p ON p.utenteid = u.utenteid
    WHERE u.utenteid = ${user.userId}
  `;
  if (!rows[0]) return c.json({ message: 'Not found' }, 404);
  const row = rows[0];
  let enduranceVisible = !!row.endurance_enabled;
  if (row.ruolo === 'cliente') {
    // Single-coach app: any athlete follows the (unique) coach's endurance setting, linked or not
    const coachRows = await sql`SELECT endurance_enabled FROM utenti WHERE ruolo = 'personal_trainer' ORDER BY utenteid ASC`;
    enduranceVisible = coachRows.length ? coachRows.every((coach) => coach.endurance_enabled) : true;
  }
  return c.json({ ...row, endurance_visible: enduranceVisible });
});

// Coach: toggle visibility of endurance sections for themselves and their athletes
app.put('/me/endurance-settings', roleCheck('personal_trainer'), async (c) => {
  const user = c.get('user');
  const { enabled } = await c.req.json();
  const sql = db(c.env);
  await sql`UPDATE utenti SET endurance_enabled = ${!!enabled} WHERE utenteid = ${user.userId}`;
  return c.json({ endurance_enabled: !!enabled });
});

app.put('/me/profile', async (c) => {
  const user = c.get('user');
  const { nome, cognome, pesokg, altezzacm, obiettivoallenamento, durataAllenamentoMinuti, giorniAllenamento, livellofitness, datanascita, sesso } = await c.req.json();
  const sql = db(c.env);
  if (nome?.trim()) await sql`UPDATE utenti SET nome = ${nome.trim()} WHERE utenteid = ${user.userId}`;
  const rows = await sql`
    INSERT INTO profiloutente (utenteid, cognome, pesokg, altezzacm, obiettivoallenamento, durata_allenamento_minuti, giorni_allenamento, livellofitness, datanascita, sesso)
    VALUES (${user.userId}, ${cognome || null}, ${pesokg || null}, ${altezzacm || null}, ${obiettivoallenamento || null}, ${durataAllenamentoMinuti || null}, ${giorniAllenamento || null}, ${livellofitness || null}, ${datanascita || null}, ${sesso || null})
    ON CONFLICT (utenteid) DO UPDATE SET
      cognome = EXCLUDED.cognome, pesokg = EXCLUDED.pesokg, altezzacm = EXCLUDED.altezzacm,
      obiettivoallenamento = EXCLUDED.obiettivoallenamento, durata_allenamento_minuti = EXCLUDED.durata_allenamento_minuti,
      giorni_allenamento = EXCLUDED.giorni_allenamento, livellofitness = EXCLUDED.livellofitness
      , datanascita = EXCLUDED.datanascita, sesso = EXCLUDED.sesso
    RETURNING *
  `;
  if (user.ruolo === 'cliente') {
    // Single-coach app: auto-attach the athlete to the (unique) coach once they save their profile
    const coachRows = await sql`SELECT utenteid FROM utenti WHERE ruolo = 'personal_trainer' ORDER BY utenteid ASC LIMIT 1`;
    if (coachRows[0]) {
      await sql`
        INSERT INTO pt_clienti (pt_userid, cliente_userid, attivo)
        VALUES (${coachRows[0].utenteid}, ${user.userId}, 1)
        ON CONFLICT (pt_userid, cliente_userid) DO UPDATE SET attivo = 1
      `;
    }
  }
  return c.json(rows[0]);
});

// Coach: list assigned athletes (clients)
app.get('/clients', roleCheck('personal_trainer'), async (c) => {
  const user = c.get('user');
  const sql = db(c.env);
  const rows = await sql`
        SELECT u.utenteid, u.nome, u.email, u.dataregistrazione,
          p.cognome, p.pesokg, p.altezzacm, p.obiettivoallenamento,
          p.durata_allenamento_minuti, p.giorni_allenamento, p.livellofitness
           , p.datanascita, p.sesso
    FROM pt_clienti pc
    JOIN utenti u ON u.utenteid = pc.cliente_userid
        LEFT JOIN profiloutente p ON p.utenteid = u.utenteid
    WHERE pc.pt_userid = ${user.userId} AND pc.attivo = 1
    ORDER BY u.nome ASC
  `;
  return c.json(rows);
});

// Coach: attach an existing athlete (by email) to their client list
app.post('/clients', roleCheck('personal_trainer'), async (c) => {
  const user = c.get('user');
  const { email } = await c.req.json();
  if (!email) return c.json({ message: 'email richiesta' }, 400);

  const sql = db(c.env);
  const athlete = await sql`SELECT utenteid FROM utenti WHERE email = ${email} AND ruolo = 'cliente' LIMIT 1`;
  if (!athlete[0]) return c.json({ message: 'Atleta non trovato' }, 404);

  await sql`
    INSERT INTO pt_clienti (pt_userid, cliente_userid, attivo)
    VALUES (${user.userId}, ${athlete[0].utenteid}, 1)
    ON CONFLICT (pt_userid, cliente_userid) DO UPDATE SET attivo = 1
  `;
  return c.json({ message: 'Atleta collegato' });
});

export default app;
