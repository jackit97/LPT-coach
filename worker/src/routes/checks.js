import { Hono } from 'hono';
import { sign, verify } from 'hono/jwt';
import { db } from '../db.js';
import { authenticate, roleCheck } from '../auth.js';
import { resolveTargetUserId, assertAccessToAthlete, assertCoachOwnsAthlete } from '../utils.js';
import { notify, coachOf, userName, fmtDay } from '../lib/notify.js';

// Check fotografici: il coach richiede un check, l'atleta carica le foto (fronte/lato/retro),
// il coach le guarda e lascia un commento.
// Le foto vanno nel bucket R2 "CHECK_PHOTOS" se collegato al Worker, altrimenti nel database (bytea).

const app = new Hono();
// Le immagini vengono richieste da <Image> senza header: sono protette da un token firmato nell'URL
app.use('*', async (c, next) => (/\/photos\/\d+\/file$/.test(c.req.path) ? next() : authenticate()(c, next)));

const POSES = ['fronte', 'lato', 'retro', 'altro'];
const MAX_BYTES = 4 * 1024 * 1024;
const PHOTO_TTL = 60 * 60 * 6;

const secret = (env) => env.JWT_SECRET || 'dev-secret';

function base64ToBytes(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function photoUrl(c, photoId) {
  const token = await sign({ pid: photoId, purpose: 'check-photo', exp: Math.floor(Date.now() / 1000) + PHOTO_TTL }, secret(c.env));
  const origin = new URL(c.req.url).origin;
  return `${origin}/checks/photos/${photoId}/file?t=${encodeURIComponent(token)}`;
}

async function withPhotos(c, sql, checks) {
  if (!checks.length) return [];
  const ids = checks.map((check) => check.check_id);
  const photos = await sql`SELECT photo_id, check_id, posa, created_at FROM body_check_photos WHERE check_id = ANY(${ids}) ORDER BY photo_id ASC`;
  const byCheck = new Map();
  for (const photo of photos) {
    const list = byCheck.get(photo.check_id) || [];
    list.push({ ...photo, url: await photoUrl(c, photo.photo_id) });
    byCheck.set(photo.check_id, list);
  }
  return checks.map((check) => ({ ...check, foto: byCheck.get(check.check_id) || [] }));
}

async function loadCheck(sql, user, id) {
  const rows = await sql`SELECT * FROM body_checks WHERE check_id = ${id}`;
  const check = rows[0];
  if (!check) return { error: 'Check non trovato', status: 404 };
  if (!await assertAccessToAthlete(sql, user, check.athlete_id)) return { error: 'Accesso negato', status: 403 };
  return { check };
}

// GET /checks/inbox - coach: check inviati dagli atleti e ancora da commentare
app.get('/inbox', roleCheck('personal_trainer'), async (c) => {
  const user = c.get('user');
  const sql = db(c.env);
  const rows = await sql`
    SELECT b.*, u.nome AS atleta_nome
    FROM body_checks b
    JOIN pt_clienti pc ON pc.cliente_userid = b.athlete_id AND pc.pt_userid = ${user.userId} AND pc.attivo = 1
    JOIN utenti u ON u.utenteid = b.athlete_id
    WHERE b.stato = 'inviato'
    ORDER BY b.inviato_at ASC
  `;
  return c.json(rows);
});

// GET /checks?utenteId= - storico check di un atleta (con URL firmati delle foto)
app.get('/', async (c) => {
  const user = c.get('user');
  const { utenteId, error } = resolveTargetUserId(user, c.req.query('utenteId'));
  if (error) return c.json({ message: error }, 400);
  const sql = db(c.env);
  if (!await assertAccessToAthlete(sql, user, utenteId)) return c.json({ message: 'Accesso negato' }, 403);
  const rows = await sql`SELECT * FROM body_checks WHERE athlete_id = ${utenteId} ORDER BY created_at DESC, check_id DESC`;
  return c.json(await withPhotos(c, sql, rows));
});

// GET /checks/:id - dettaglio + check precedente per il confronto
app.get('/:id{[0-9]+}', async (c) => {
  const sql = db(c.env);
  const loaded = await loadCheck(sql, c.get('user'), Number(c.req.param('id')));
  if (loaded.error) return c.json({ message: loaded.error }, loaded.status);
  const [check] = await withPhotos(c, sql, [loaded.check]);
  const previousRows = await sql`
    SELECT * FROM body_checks
    WHERE athlete_id = ${check.athlete_id} AND check_id <> ${check.check_id} AND stato IN ('inviato', 'revisionato')
      AND COALESCE(inviato_at, created_at) < COALESCE(${check.inviato_at}::timestamp, NOW())
    ORDER BY COALESCE(inviato_at, created_at) DESC LIMIT 1
  `;
  const [precedente] = await withPhotos(c, sql, previousRows);
  return c.json({ ...check, precedente: precedente || null });
});

// POST /checks - il coach richiede un check all'atleta
app.post('/', roleCheck('personal_trainer'), async (c) => {
  const user = c.get('user');
  const { utenteId, scadenza, nota } = await c.req.json();
  if (!utenteId) return c.json({ message: 'utenteId richiesto' }, 400);
  const sql = db(c.env);
  if (!await assertCoachOwnsAthlete(sql, user.userId, Number(utenteId))) return c.json({ message: 'Accesso negato' }, 403);
  const rows = await sql`
    INSERT INTO body_checks (athlete_id, coach_id, stato, scadenza, nota_richiesta)
    VALUES (${utenteId}, ${user.userId}, 'richiesto', ${scadenza || null}, ${nota || null})
    RETURNING *
  `;
  await notify(sql, Number(utenteId), {
    tipo: 'check_richiesto',
    mittenteId: user.userId,
    titolo: 'Nuovo check fotografico richiesto',
    messaggio: `${scadenza ? `Da inviare entro il ${fmtDay(scadenza)}. ` : ''}${nota || 'Carica le foto fronte, lato e retro.'}`,
    link: { screen: 'CheckDetail', params: { checkId: rows[0].check_id } },
  });
  return c.json({ ...rows[0], foto: [] }, 201);
});

// POST /checks/:id/photos { posa, data (base64 o data URL), mime } - l'atleta carica una foto
app.post('/:id{[0-9]+}/photos', async (c) => {
  const user = c.get('user');
  const sql = db(c.env);
  const loaded = await loadCheck(sql, user, Number(c.req.param('id')));
  if (loaded.error) return c.json({ message: loaded.error }, loaded.status);
  if (user.ruolo !== 'cliente') return c.json({ message: 'Le foto le carica l\'atleta' }, 403);
  if (loaded.check.stato === 'revisionato') return c.json({ message: 'Il check è già stato commentato dal coach' }, 400);
  const body = await c.req.json().catch(() => ({}));
  const posa = POSES.includes(body.posa) ? body.posa : 'altro';
  const match = String(body.data || '').match(/^(?:data:(image\/[a-z+.-]+);base64,)?([A-Za-z0-9+/=\s]+)$/);
  if (!match) return c.json({ message: 'Immagine non valida' }, 400);
  const mime = match[1] || (/^image\/(jpeg|png|webp)$/.test(body.mime) ? body.mime : 'image/jpeg');
  if (!/^image\/(jpeg|png|webp)$/.test(mime)) return c.json({ message: 'Formato non supportato (usa JPG, PNG o WebP)' }, 400);
  const b64 = match[2].replace(/\s/g, '');
  const size = Math.floor((b64.length * 3) / 4);
  if (size > MAX_BYTES) return c.json({ message: 'Foto troppo grande (max 4 MB)' }, 400);

  // Una sola foto per posa (tranne "altro"): la nuova sostituisce la precedente
  if (posa !== 'altro') {
    const old = await sql`SELECT photo_id, storage, storage_key FROM body_check_photos WHERE check_id = ${loaded.check.check_id} AND posa = ${posa}`;
    for (const photo of old) await deletePhoto(c, sql, photo);
  }

  const useR2 = !!c.env.CHECK_PHOTOS;
  const inserted = await sql`
    INSERT INTO body_check_photos (check_id, posa, storage, mime, size_bytes)
    VALUES (${loaded.check.check_id}, ${posa}, ${useR2 ? 'r2' : 'db'}, ${mime}, ${size})
    RETURNING photo_id, check_id, posa, created_at
  `;
  const photo = inserted[0];
  if (useR2) {
    const key = `checks/${loaded.check.athlete_id}/${loaded.check.check_id}/${photo.photo_id}`;
    await c.env.CHECK_PHOTOS.put(key, base64ToBytes(b64), { httpMetadata: { contentType: mime } });
    await sql`UPDATE body_check_photos SET storage_key = ${key} WHERE photo_id = ${photo.photo_id}`;
  } else {
    await sql`INSERT INTO body_check_photo_data (photo_id, data) VALUES (${photo.photo_id}, decode(${b64}, 'base64'))`;
  }
  return c.json({ ...photo, url: await photoUrl(c, photo.photo_id) }, 201);
});

async function deletePhoto(c, sql, photo) {
  if (photo.storage === 'r2' && photo.storage_key && c.env.CHECK_PHOTOS) {
    try { await c.env.CHECK_PHOTOS.delete(photo.storage_key); } catch (error) { console.error('R2 delete', error.message); }
  }
  await sql`DELETE FROM body_check_photos WHERE photo_id = ${photo.photo_id}`;
}

// DELETE /checks/photos/:photoId - l'atleta rimuove una foto prima del commento del coach
app.delete('/photos/:photoId{[0-9]+}', async (c) => {
  const user = c.get('user');
  const sql = db(c.env);
  const rows = await sql`
    SELECT p.*, b.athlete_id, b.stato FROM body_check_photos p JOIN body_checks b ON b.check_id = p.check_id
    WHERE p.photo_id = ${Number(c.req.param('photoId'))}
  `;
  const photo = rows[0];
  if (!photo || photo.athlete_id !== user.userId) return c.json({ message: 'Foto non trovata' }, 404);
  if (photo.stato === 'revisionato') return c.json({ message: 'Il check è già stato commentato' }, 400);
  await deletePhoto(c, sql, photo);
  return c.json({ ok: true });
});

// GET /checks/photos/:photoId/file?t= - immagine (token firmato, valido qualche ora)
app.get('/photos/:photoId{[0-9]+}/file', async (c) => {
  const photoId = Number(c.req.param('photoId'));
  try {
    const payload = await verify(c.req.query('t') || '', secret(c.env), 'HS256');
    if (payload.purpose !== 'check-photo' || payload.pid !== photoId) throw new Error('token');
  } catch {
    return c.json({ message: 'Link foto scaduto' }, 403);
  }
  const sql = db(c.env);
  const rows = await sql`SELECT photo_id, storage, storage_key, mime FROM body_check_photos WHERE photo_id = ${photoId}`;
  const photo = rows[0];
  if (!photo) return c.json({ message: 'Foto non trovata' }, 404);
  const headers = { 'Content-Type': photo.mime || 'image/jpeg', 'Cache-Control': 'private, max-age=3600' };
  if (photo.storage === 'r2') {
    if (!c.env.CHECK_PHOTOS) return c.json({ message: 'Archivio foto non configurato' }, 503);
    const object = await c.env.CHECK_PHOTOS.get(photo.storage_key);
    if (!object) return c.json({ message: 'Foto non trovata' }, 404);
    return new Response(object.body, { headers });
  }
  const data = await sql`SELECT encode(data, 'base64') AS b64 FROM body_check_photo_data WHERE photo_id = ${photoId}`;
  if (!data[0]) return c.json({ message: 'Foto non trovata' }, 404);
  return new Response(base64ToBytes(String(data[0].b64).replace(/\s/g, '')), { headers });
});

// POST /checks/:id/submit { nota, pesoKg } - l'atleta invia il check al coach
app.post('/:id{[0-9]+}/submit', async (c) => {
  const user = c.get('user');
  const sql = db(c.env);
  const loaded = await loadCheck(sql, user, Number(c.req.param('id')));
  if (loaded.error) return c.json({ message: loaded.error }, loaded.status);
  if (user.ruolo !== 'cliente') return c.json({ message: 'Solo l\'atleta può inviare il check' }, 403);
  if (loaded.check.stato === 'revisionato') return c.json({ message: 'Il check è già stato commentato' }, 400);
  const count = await sql`SELECT COUNT(*)::int AS n FROM body_check_photos WHERE check_id = ${loaded.check.check_id}`;
  if (!count[0].n) return c.json({ message: 'Carica almeno una foto prima di inviare' }, 400);
  const { nota, pesoKg } = await c.req.json().catch(() => ({}));
  const peso = Number(String(pesoKg ?? '').replace(',', '.'));
  const rows = await sql`
    UPDATE body_checks SET stato = 'inviato', nota_atleta = ${nota || null}, peso_kg = ${Number.isFinite(peso) && peso > 0 ? peso : null}, inviato_at = NOW()
    WHERE check_id = ${loaded.check.check_id} RETURNING *
  `;
  const coachId = loaded.check.coach_id || await coachOf(sql, user.userId);
  await notify(sql, coachId, {
    tipo: 'check_inviato',
    mittenteId: user.userId,
    titolo: `${await userName(sql, user.userId)} ha inviato il check`,
    messaggio: `${count[0].n} foto${rows[0].peso_kg ? ` · peso ${rows[0].peso_kg} kg` : ''}${nota ? ` · "${String(nota).slice(0, 120)}"` : ''}`,
    link: { screen: 'CheckDetail', params: { checkId: loaded.check.check_id, athleteId: user.userId } },
  });
  return c.json(rows[0]);
});

// PUT /checks/:id/review { commento } - il coach commenta il check
app.put('/:id{[0-9]+}/review', roleCheck('personal_trainer'), async (c) => {
  const user = c.get('user');
  const sql = db(c.env);
  const loaded = await loadCheck(sql, user, Number(c.req.param('id')));
  if (loaded.error) return c.json({ message: loaded.error }, loaded.status);
  const { commento } = await c.req.json().catch(() => ({}));
  if (!String(commento || '').trim()) return c.json({ message: 'Scrivi un commento' }, 400);
  const rows = await sql`
    UPDATE body_checks SET stato = 'revisionato', commento_coach = ${String(commento).trim()}, revisionato_at = NOW(), coach_id = COALESCE(coach_id, ${user.userId})
    WHERE check_id = ${loaded.check.check_id} RETURNING *
  `;
  await notify(sql, loaded.check.athlete_id, {
    tipo: 'check_commentato',
    mittenteId: user.userId,
    titolo: 'Il coach ha commentato il tuo check',
    messaggio: String(commento).trim().slice(0, 200),
    link: { screen: 'CheckDetail', params: { checkId: loaded.check.check_id } },
  });
  return c.json(rows[0]);
});

// DELETE /checks/:id - il coach elimina un check (e le foto)
app.delete('/:id{[0-9]+}', roleCheck('personal_trainer'), async (c) => {
  const sql = db(c.env);
  const loaded = await loadCheck(sql, c.get('user'), Number(c.req.param('id')));
  if (loaded.error) return c.json({ message: loaded.error }, loaded.status);
  const photos = await sql`SELECT photo_id, storage, storage_key FROM body_check_photos WHERE check_id = ${loaded.check.check_id}`;
  for (const photo of photos) await deletePhoto(c, sql, photo);
  await sql`DELETE FROM body_checks WHERE check_id = ${loaded.check.check_id}`;
  return c.json({ ok: true });
});

export default app;
