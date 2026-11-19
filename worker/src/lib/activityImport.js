import { Decoder, Stream } from '@garmin/fitsdk';

// Import di attivita' da file esportati da Garmin Connect, Apple Health (app di export), Coros, Suunto, ecc.
// Formati: .fit (binario Garmin), .tcx e .gpx (XML). Restituisce un riepilogo uniforme.

const SPORT_KEYS = [
  [/run|walk|hike|trail|treadmill|corsa/i, 'corsa'],
  [/cycl|bik|ride|bici/i, 'ciclismo'],
  [/swim|nuoto/i, 'nuoto'],
];
const SPORT_LABELS = { corsa: 'Corsa', ciclismo: 'Bici', nuoto: 'Nuoto' };

export function sportKey(raw) {
  const text = String(raw || '');
  for (const [pattern, key] of SPORT_KEYS) if (pattern.test(text)) return key;
  return null;
}

const STRENGTH = /training|strength|weight|crossfit|hiit|fitness_equipment|cardio/i;

function haversine(a, b) {
  const R = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Dislivello positivo con soglia per ignorare il rumore dell'altimetro/GPS
function ascentFrom(elevations, threshold = 2) {
  let total = 0;
  let ref = null;
  for (const value of elevations) {
    if (!Number.isFinite(value)) continue;
    if (ref === null) { ref = value; continue; }
    if (value - ref >= threshold) { total += value - ref; ref = value; } else if (value < ref) ref = value;
  }
  return Math.round(total);
}

const average = (values) => {
  const list = values.filter((value) => Number.isFinite(value) && value > 0);
  return list.length ? Math.round(list.reduce((sum, value) => sum + value, 0) / list.length) : null;
};

function parseFit(bytes) {
  const stream = Stream.fromByteArray(bytes);
  const decoder = new Decoder(stream);
  if (!decoder.isFIT()) throw new ImportError('Il file non è un .fit valido');
  const { messages, errors } = decoder.read({ convertDateTimesToDates: true, mergeHeartRates: true });
  if (errors?.length && !messages?.sessionMesgs?.length && !messages?.recordMesgs?.length) {
    throw new ImportError(`File .fit danneggiato: ${errors[0]?.message || 'lettura non riuscita'}`);
  }
  const fileType = messages.fileIdMesgs?.[0]?.type;
  if (fileType && fileType !== 'activity') {
    throw new ImportError(fileType === 'workout'
      ? 'Questo .fit è un allenamento pianificato, non un\'attività svolta: esporta l\'attività completata'
      : `Questo .fit non contiene un'attività (tipo: ${fileType})`);
  }
  const records = messages.recordMesgs || [];
  const sessions = messages.sessionMesgs || [];
  const session = sessions[0] || {};
  const start = session.startTime || records[0]?.timestamp || messages.activityMesgs?.[0]?.timestamp;
  if (!start) throw new ImportError('Il file .fit non contiene la data dell\'attività');
  const sum = (key) => sessions.reduce((total, row) => total + (Number(row[key]) || 0), 0);
  const durationSeconds = Math.round(sum('totalTimerTime') || sum('totalElapsedTime')
    || (records.length > 1 ? (records[records.length - 1].timestamp - records[0].timestamp) / 1000 : 0));
  const distanceMeters = sum('totalDistance') || Number(records[records.length - 1]?.distance) || 0;
  const hrValues = records.map((row) => Number(row.heartRate));
  const elevations = records.map((row) => Number(row.enhancedAltitude ?? row.altitude));
  const rawSport = [session.sport, session.subSport, messages.sportMesgs?.[0]?.name].filter(Boolean).join(' ');
  // Ora locale dell'attivita': activity.localTimestamp e' l'orologio locale espresso come se fosse UTC
  const activity = messages.activityMesgs?.[0];
  const localOffsetSeconds = activity?.localTimestamp !== undefined && activity?.timestamp
    ? Math.round(Number(activity.localTimestamp) - (new Date(activity.timestamp).getTime() / 1000 - 631065600)) : null;
  return {
    format: 'fit',
    localOffsetSeconds: Number.isFinite(localOffsetSeconds) && Math.abs(localOffsetSeconds) <= 14 * 3600 ? localOffsetSeconds : null,
    rawSport,
    start: new Date(start),
    durationSeconds,
    distanceMeters,
    avgHr: Number(session.avgHeartRate) || average(hrValues),
    maxHr: Number(session.maxHeartRate) || (hrValues.some(Number.isFinite) ? Math.max(...hrValues.filter(Number.isFinite)) : null),
    elevGainM: Number.isFinite(Number(session.totalAscent)) && session.totalAscent !== undefined
      ? Math.round(Number(session.totalAscent)) : ascentFrom(elevations),
    calories: Number(session.totalCalories) || null,
    name: messages.workoutMesgs?.[0]?.wktName || null,
  };
}

// --- XML (TCX/GPX): parser minimale a espressioni regolari, i Worker non hanno DOMParser ---
const tagValues = (xml, tag) => [...xml.matchAll(new RegExp(`<(?:\\w+:)?${tag}\\b[^>]*>([^<]*)</(?:\\w+:)?${tag}>`, 'gi'))].map((match) => match[1].trim());
const firstTag = (xml, tag) => tagValues(xml, tag)[0];
const blocks = (xml, tag) => [...xml.matchAll(new RegExp(`<(?:\\w+:)?${tag}\\b[^>]*?(?:/>|>([\\s\\S]*?)</(?:\\w+:)?${tag}>)`, 'gi'))];

function parseTcx(xml) {
  const activity = xml.match(/<Activity\b[^>]*Sport="([^"]*)"/i);
  const laps = blocks(xml, 'Lap');
  if (!laps.length) throw new ImportError('Il file .tcx non contiene attività');
  const lapStart = xml.match(/<Lap\b[^>]*StartTime="([^"]+)"/i)?.[1];
  const startText = firstTag(xml, 'Id') || lapStart;
  let durationSeconds = 0;
  let distanceMeters = 0;
  let calories = 0;
  for (const lap of laps) {
    const body = lap[1] || '';
    const withoutTrack = body.replace(/<Track\b[\s\S]*?<\/Track>/gi, '');
    durationSeconds += Number(firstTag(withoutTrack, 'TotalTimeSeconds')) || 0;
    distanceMeters += Number(firstTag(withoutTrack, 'DistanceMeters')) || 0;
    calories += Number(firstTag(withoutTrack, 'Calories')) || 0;
  }
  const points = blocks(xml, 'Trackpoint').map((match) => match[1] || '');
  const hrValues = points.map((point) => Number(point.match(/<HeartRateBpm\b[^>]*>\s*<Value>(\d+)/i)?.[1]));
  const elevations = points.map((point) => Number(firstTag(point, 'AltitudeMeters')));
  if (!distanceMeters) {
    const distances = points.map((point) => Number(firstTag(point, 'DistanceMeters'))).filter(Number.isFinite);
    distanceMeters = distances.length ? Math.max(...distances) : 0;
  }
  const start = new Date(startText);
  if (Number.isNaN(start.getTime())) throw new ImportError('Il file .tcx non contiene la data dell\'attività');
  return {
    format: 'tcx',
    rawSport: activity?.[1] || '',
    start,
    durationSeconds: Math.round(durationSeconds),
    distanceMeters,
    avgHr: average(hrValues),
    maxHr: hrValues.some((value) => value > 0) ? Math.max(...hrValues.filter((value) => value > 0)) : null,
    elevGainM: ascentFrom(elevations),
    calories: calories || null,
    name: firstTag(xml, 'Notes') || null,
  };
}

function parseGpx(xml) {
  const points = blocks(xml, 'trkpt').map((match) => {
    const open = match[0].match(/<(?:\w+:)?trkpt\b([^>]*)>/i)?.[1] || match[0];
    const body = match[1] || '';
    return {
      lat: Number(open.match(/lat="([^"]+)"/i)?.[1]),
      lon: Number(open.match(/lon="([^"]+)"/i)?.[1]),
      ele: Number(firstTag(body, 'ele')),
      time: firstTag(body, 'time') ? new Date(firstTag(body, 'time')) : null,
      hr: Number(firstTag(body, 'hr')),
    };
  }).filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lon));
  if (!points.length) throw new ImportError('Il file .gpx non contiene un percorso registrato');
  let distanceMeters = 0;
  let movingSeconds = 0;
  for (let i = 1; i < points.length; i += 1) {
    const step = haversine(points[i - 1], points[i]);
    distanceMeters += step;
    const dt = points[i].time && points[i - 1].time ? (points[i].time - points[i - 1].time) / 1000 : 0;
    // pause: piu' di 30 s quasi fermi non contano nel tempo in movimento
    if (dt > 0 && !(dt > 30 && step / dt < 0.3)) movingSeconds += dt;
  }
  const times = points.map((point) => point.time).filter((time) => time && !Number.isNaN(time.getTime()));
  const start = times[0] || (firstTag(xml, 'time') ? new Date(firstTag(xml, 'time')) : null);
  if (!start || Number.isNaN(start.getTime())) throw new ImportError('Il file .gpx non contiene gli orari: serve un\'attività registrata, non un percorso');
  const hrValues = points.map((point) => point.hr);
  return {
    format: 'gpx',
    rawSport: firstTag(xml, 'type') || '',
    start,
    durationSeconds: Math.round(movingSeconds || (times.length > 1 ? (times[times.length - 1] - times[0]) / 1000 : 0)),
    distanceMeters,
    avgHr: average(hrValues),
    maxHr: hrValues.some((value) => value > 0) ? Math.max(...hrValues.filter((value) => value > 0)) : null,
    elevGainM: ascentFrom(points.map((point) => point.ele)),
    calories: null,
    name: firstTag(xml.match(/<trk\b[\s\S]*/i)?.[0] || '', 'name') || null,
  };
}

export class ImportError extends Error {}

// Garmin Connect "Esporta originale" scarica uno .zip con dentro il .fit: estrae il primo file attivita'.
async function unzipActivity(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i -= 1) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new ImportError('Archivio .zip non valido');
  const entries = view.getUint16(eocd + 10, true);
  let pos = view.getUint32(eocd + 16, true);
  for (let n = 0; n < entries; n += 1) {
    if (view.getUint32(pos, true) !== 0x02014b50) break;
    const method = view.getUint16(pos + 10, true);
    const compressedSize = view.getUint32(pos + 20, true);
    const nameLength = view.getUint16(pos + 28, true);
    const extraLength = view.getUint16(pos + 30, true);
    const commentLength = view.getUint16(pos + 32, true);
    const localOffset = view.getUint32(pos + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(pos + 46, pos + 46 + nameLength));
    pos += 46 + nameLength + extraLength + commentLength;
    if (!/\.(fit|tcx|gpx)$/i.test(name)) continue;
    const dataStart = localOffset + 30 + view.getUint16(localOffset + 26, true) + view.getUint16(localOffset + 28, true);
    const data = bytes.subarray(dataStart, dataStart + compressedSize);
    if (method === 0) return { bytes: data, name };
    if (method !== 8) throw new ImportError('Compressione .zip non supportata');
    const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return { bytes: new Uint8Array(await new Response(stream).arrayBuffer()), name };
  }
  throw new ImportError('Lo .zip non contiene file .fit, .tcx o .gpx');
}

export async function parseActivityUpload(bytes, filename = '') {
  const isZip = bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
  if (isZip || /\.zip$/i.test(filename)) {
    const inner = await unzipActivity(bytes);
    return parseActivityFile(inner.bytes, inner.name);
  }
  return parseActivityFile(bytes, filename);
}

// Giorno locale (YYYY-MM-DD) dell'attivita': offset del file .fit se presente, altrimenti fuso dell'utente
export function localDay(parsed, timeZone = 'Europe/Rome') {
  if (Number.isFinite(parsed.localOffsetSeconds)) {
    return new Date(parsed.start.getTime() + parsed.localOffsetSeconds * 1000).toISOString().slice(0, 10);
  }
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(parsed.start);
  } catch {
    return parsed.start.toISOString().slice(0, 10);
  }
}

export function parseActivityFile(bytes, filename = '') {
  if (!bytes?.length) throw new ImportError('File vuoto');
  const ext = String(filename).toLowerCase().split('.').pop();
  const looksFit = bytes.length > 12 && String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]) === '.FIT';
  let parsed;
  if (ext === 'fit' || looksFit) parsed = parseFit(bytes);
  else {
    const text = new TextDecoder('utf-8').decode(bytes);
    if (ext === 'tcx' || /<TrainingCenterDatabase/i.test(text)) parsed = parseTcx(text);
    else if (ext === 'gpx' || /<gpx\b/i.test(text)) parsed = parseGpx(text);
    else throw new ImportError('Formato non supportato: carica un file .fit, .tcx o .gpx');
  }
  const key = sportKey(parsed.rawSport);
  const strength = !key && STRENGTH.test(parsed.rawSport);
  const label = key ? SPORT_LABELS[key] : strength ? 'Allenamento' : 'Attività';
  return {
    ...parsed,
    sport: key,
    tipo: strength ? 'forza' : 'endurance',
    distanceKm: parsed.distanceMeters ? Number((parsed.distanceMeters / 1000).toFixed(2)) : 0,
    title: parsed.name && !/^\d{4}-\d{2}-\d{2}/.test(parsed.name) ? String(parsed.name).slice(0, 120) : `${label} importata`,
  };
}
