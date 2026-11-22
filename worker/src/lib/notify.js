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

