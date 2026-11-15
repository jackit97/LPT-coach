// Costanti e calcoli endurance condivisi dalle schermate (stile CoachPeaking).
// Il TRIMP usa gli stessi coefficienti del backend (worker/src/lib/trainingLoad.js).

export const ZONE_TRIMP_WEIGHTS = { Z0: 0, Z1: 1, Z2: 1.5, Z3: 2.2, Z4: 3.2, Z5: 4.5, Z6: 6, Z7: 8 };

export const ZONE_COLORS = {
  Z0: '#cccccc',
  Z1: '#8ed1d1',
  Z2: '#58c86b',
  Z3: '#f5e832',
  Z4: '#f4a340',
  Z5: '#ef4141',
  Z6: '#a83232',
  Z7: '#d96be8',
};

// zoneGroup: chiave nelle zone atleta; unit: unita' mostrata; base: metri a cui si riferisce il passo.
export const SPORTS = [
  { key: 'corsa', label: 'Corsa', icon: '🏃', color: '#f37021', zoneGroup: 'pace', unit: '/km', base: 1000 },
  { key: 'ciclismo', label: 'Ciclismo', icon: '🚴', color: '#1ab394', zoneGroup: 'power', unit: 'W', base: null },
  { key: 'nuoto', label: 'Nuoto', icon: '🏊', color: '#1c84c6', zoneGroup: 'swimPace', unit: '/100m', base: 100 },
];

export const sportInfo = (key) => SPORTS.find((sport) => sport.key === key) || null;

export const DEFAULT_ZONES = {
  pace: [
    { key: 'Z1', name: 'Recupero', min: '07:26', max: '06:14' },
    { key: 'Z2', name: 'Aerobico', min: '06:14', max: '05:30' },
    { key: 'Z3', name: 'Medio', min: '05:30', max: '04:56' },
    { key: 'Z4', name: 'Soglia', min: '04:56', max: '04:30' },
    { key: 'Z5', name: 'VO2Max', min: '04:30', max: '04:06' },
    { key: 'Z6', name: 'Anaerobico', min: '04:06', max: '03:45' },
    { key: 'Z7', name: 'Sprint', min: '03:45', max: '03:18' },
  ],
  swimPace: [
    { key: 'Z1', name: 'Recupero', min: '02:35', max: '02:22' },
    { key: 'Z2', name: 'Aerobico', min: '02:22', max: '02:13' },
    { key: 'Z3', name: 'Medio', min: '02:13', max: '02:07' },
    { key: 'Z4', name: 'Soglia', min: '02:07', max: '02:02' },
    { key: 'Z5', name: 'VO2Max', min: '02:02', max: '01:57' },
    { key: 'Z6', name: 'Anaerobico', min: '01:57', max: '01:51' },
    { key: 'Z7', name: 'Sprint', min: '01:51', max: '01:41' },
  ],
  power: [
    { key: 'Z1', name: 'Recupero', min: '', max: '' },
    { key: 'Z2', name: 'Aerobico', min: '', max: '' },
    { key: 'Z3', name: 'Medio', min: '', max: '' },
    { key: 'Z4', name: 'Soglia', min: '', max: '' },
    { key: 'Z5', name: 'VO2Max', min: '', max: '' },
    { key: 'Z6', name: 'Anaerobico', min: '', max: '' },
    { key: 'Z7', name: 'Sprint', min: '', max: '' },
  ],
};

// Velocita' indicativa per zona in bici (km/h): serve solo a stimare i km di un lavoro a tempo.
export const BIKE_SPEED_KMH = { Z0: 0, Z1: 22, Z2: 26, Z3: 29, Z4: 32, Z5: 35, Z6: 38, Z7: 40 };

export function parsePaceSeconds(value) {
  const match = String(value || '').match(/(\d+):([0-5]\d)/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

export function parseTimeValue(value) {
  const text = String(value || '').trim();
  if (text.includes(':')) {
    const parts = text.split(':').map(Number);
    if (parts.length === 3 && parts.every(Number.isFinite)) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2 && parts.every(Number.isFinite)) return parts[0] * 60 + parts[1];
  }
  const num = Number(text.replace(',', '.'));
  return Number.isFinite(num) ? num * 60 : 0;
}

export function formatHMS(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0:00:00';
  const total = Math.round(seconds);
  return `${Math.floor(total / 3600)}:${String(Math.floor((total % 3600) / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

// Formato compatto per il calendario: 45', 1h20
export function formatShortDuration(seconds) {
  const total = Math.round(Number(seconds) || 0);
  if (total <= 0) return '0\'';
  const h = Math.floor(total / 3600);
  const m = Math.round((total % 3600) / 60);
  if (!h) return `${m}'`;
  return `${h}h${String(m).padStart(2, '0')}`;
}

export function formatKm(meters, digits = 1) {
  if (!Number.isFinite(meters) || meters <= 0) return `${(0).toFixed(digits)} km`;
  return `${(meters / 1000).toFixed(digits)} km`;
}

export function trimpFromZoneSeconds(zoneSeconds = {}) {
  return Math.round(Object.entries(zoneSeconds).reduce((sum, [zone, sec]) => sum + ((Number(sec) || 0) / 60) * (ZONE_TRIMP_WEIGHTS[zone] ?? 1), 0));
}

// Lettura della performance come nell'articolo CoachPeaking "Carico acuto, cronico e performance".
export function performanceStatus(value) {
  const v = Number(value) || 0;
  if (v > 30) return { label: 'Possibile perdita di forma', color: '#b45309' };
  if (v >= 10) return { label: 'Pronto per la prestazione', color: '#059669' };
  if (v > -10) return { label: 'Fase di scarico / recupero', color: '#2563eb' };
  if (v >= -30) return { label: 'Fase di carico', color: '#7c3aed' };
  return { label: 'Carico molto elevato', color: '#dc2626' };
}

// RPE (1-10) -> zona equivalente: stessa tabella del backend, per stimare il TRIMP di forza/funzionale.
export function rpeToZone(rpe) {
  const value = Number(rpe);
  if (!Number.isFinite(value) || value <= 0) return null;
  if (value <= 2) return 'Z1';
  if (value <= 4) return 'Z2';
  if (value <= 5) return 'Z3';
  if (value <= 7) return 'Z4';
  if (value <= 8) return 'Z5';
  if (value <= 9) return 'Z6';
  return 'Z7';
}

// Forza/funzionale: TRIMP ridotto del 40% (stesso fattore del backend, NON_ENDURANCE_FACTOR)
export function trimpFromRpe(minutes, rpe, fallbackZone = 'Z3') {
  const zone = rpeToZone(rpe) || fallbackZone;
  return Math.round(trimpFromZoneSeconds({ [zone]: (Number(minutes) || 0) * 60 }) * 0.6);
}
