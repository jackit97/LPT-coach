// Shared helpers for coach/athlete ownership checks across resource routes.

export async function assertCoachOwnsAthlete(sql, coachId, athleteId) {
  const rows = await sql`
    SELECT 1 FROM pt_clienti WHERE pt_userid = ${coachId} AND cliente_userid = ${athleteId} AND attivo = 1
  `;
  return rows.length > 0;
}

// Resolves which utenteId a request should operate on, given the authenticated user
// and an optional ?utenteId= query param (only coaches may pass one explicitly).
export function resolveTargetUserId(user, queryUtenteId) {
  if (user.ruolo === 'cliente') return { utenteId: user.userId, error: null };
  if (!queryUtenteId) return { utenteId: null, error: 'utenteId richiesto per il coach' };
  return { utenteId: Number(queryUtenteId), error: null };
}

export async function assertAccessToAthlete(sql, user, athleteId) {
  if (user.ruolo === 'cliente') return user.userId === athleteId;
  return assertCoachOwnsAthlete(sql, user.userId, athleteId);
}
