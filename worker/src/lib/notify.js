import { appUrl, emailConfigured, emailLayout, sendEmail } from './mailer.js';

// Notifiche in-app. Non devono mai far fallire l'operazione principale: gli errori vengono solo loggati
// (ad es. se la migration delle notifiche non e' ancora stata applicata).

export async function notify(sql, userId, { tipo, titolo, messaggio = null, link = null, mittenteId = null }) {
  if (!userId || !titolo) return;
  try {
    await sql`
      INSERT INTO notifiche (utenteid, mittente_id, tipo, titolo, messaggio, link_json)
      VALUES (${userId}, ${mittenteId}, ${tipo}, ${String(titolo).slice(0, 200)}, ${messaggio}, ${link ? JSON.stringify(link) : null})
    `;
  } catch (error) {
    console.error('Notifica non salvata:', error.message);
  }
  await emailNotification(sql, userId, { titolo, messaggio });
}

// La stessa notifica arriva anche via email, se l'indirizzo e' verificato e l'utente non le ha disattivate
async function emailNotification(sql, userId, { titolo, messaggio }) {
  const env = sql.env;
  if (!emailConfigured(env)) return;
  try {
    const rows = await sql`
      SELECT email, nome, email_verificata, notifiche_email FROM utenti WHERE utenteid = ${userId}
    `;
    const user = rows[0];
    if (!user?.email || !user.email_verificata || user.notifiche_email === false) return;
    const text = [`Ciao ${String(user.nome || '').trim()},`, messaggio || '', 'Apri LPT Coach per vedere i dettagli.'].filter(Boolean).join('\n');
    await sendEmail(env, {
      to: user.email,
      subject: String(titolo).slice(0, 150),
      text,
      html: emailLayout({ title: titolo, text, buttonLabel: 'Apri LPT Coach', buttonUrl: appUrl(env) }),
    });
  } catch (error) {
    console.error('Email notifica non inviata:', error?.message); // es. migrazione 20261126 non ancora applicata
  }
}

export async function coachOf(sql, athleteId) {
  try {
    const rows = await sql`SELECT pt_userid FROM pt_clienti WHERE cliente_userid = ${athleteId} AND attivo = 1 ORDER BY pt_cliente_id ASC LIMIT 1`;
    return rows[0]?.pt_userid || null;
  } catch {
    return null;
  }
}

export async function userName(sql, userId) {
  try {
    const rows = await sql`SELECT TRIM(CONCAT_WS(' ', nome, cognome)) AS nome FROM utenti WHERE utenteid = ${userId}`;
    return rows[0]?.nome || 'Atleta';
  } catch {
    return 'Atleta';
  }
}

export const fmtDay = (value) => {
  const iso = value instanceof Date
    ? `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
    : String(value || '').slice(0, 10);
  const [y, m, d] = iso.split('-');
  return d && m ? `${d}/${m}` : iso;
};

// Notifica all'atleta un nuovo allenamento assegnato dal coach.
export async function notifyNewWorkout(sql, workout, coachId) {
  await notify(sql, workout.utenteid, {
    tipo: 'workout',
    mittenteId: coachId,
    titolo: `Nuovo allenamento: ${workout.titolo}`,
    messaggio: `Programmato per il ${fmtDay(workout.data)}`,
    link: { screen: 'WorkoutDetail', params: { workoutId: workout.workout_id } },
  });
}

