// Valutazione corporea: stime da plicometria e misure antropometriche.
// Lo stesso file e' usato dal worker (worker/src/lib) e dall'app (app/utils): tenerli identici.
//
// Pliche in mm, circonferenze in cm, peso in kg, altezza in cm.
// Formule:
//  - densita' corporea: Jackson & Pollock 7 e 3 pliche (1978/1980), Durnin & Womersley 4 pliche (1974)
//  - % grasso dalla densita': Siri (1961)
//  - % grasso da circonferenze: US Navy (Hodgdon & Beckett 1984)
//  - massa muscolare scheletrica: Lee et al. (2000), con circonferenze corrette per la plica
//  - metabolismo basale: Mifflin-St Jeor (1990), Harris-Benedict rivista (Roza & Shizgal 1984),
//    Katch-McArdle e Cunningham (dalla massa magra)
//  - area muscolare del braccio corretta: Heymsfield et al. (1982)

export const SKINFOLDS = [
  { key: 'pettorale', label: 'Pettorale', region: 'tronco' },
  { key: 'ascellare', label: 'Ascellare media', region: 'tronco' },
  { key: 'tricipite', label: 'Tricipite', region: 'braccia' },
  { key: 'bicipite', label: 'Bicipite', region: 'braccia' },
  { key: 'sottoscapolare', label: 'Sottoscapolare', region: 'tronco' },
  { key: 'sovrailiaca', label: 'Sovrailiaca', region: 'tronco' },
  { key: 'addominale', label: 'Addominale', region: 'tronco' },
  { key: 'coscia', label: 'Coscia', region: 'gambe' },
  { key: 'polpaccio', label: 'Polpaccio mediale', region: 'gambe' },
];

export const CIRCUMFERENCES = [
  { key: 'collo', label: 'Collo' },
  { key: 'spalle', label: 'Spalle' },
  { key: 'torace', label: 'Torace' },
  { key: 'vita', label: 'Vita (punto più stretto)' },
  { key: 'addome', label: 'Addome (ombelico)' },
  { key: 'fianchi', label: 'Fianchi / glutei' },
  { key: 'braccio_dx', label: 'Braccio dx (rilassato)', pair: 'braccio' },
  { key: 'braccio_sx', label: 'Braccio sx (rilassato)', pair: 'braccio' },
  { key: 'braccio_contratto_dx', label: 'Braccio dx (contratto)', pair: 'braccio_contratto' },
  { key: 'braccio_contratto_sx', label: 'Braccio sx (contratto)', pair: 'braccio_contratto' },
  { key: 'avambraccio_dx', label: 'Avambraccio dx', pair: 'avambraccio' },
  { key: 'avambraccio_sx', label: 'Avambraccio sx', pair: 'avambraccio' },
  { key: 'coscia_dx', label: 'Coscia dx (metà)', pair: 'coscia' },
  { key: 'coscia_sx', label: 'Coscia sx (metà)', pair: 'coscia' },
  { key: 'polpaccio_dx', label: 'Polpaccio dx', pair: 'polpaccio' },
  { key: 'polpaccio_sx', label: 'Polpaccio sx', pair: 'polpaccio' },
  { key: 'polso', label: 'Polso' },
];

export const PROTOCOLS = [
  { key: 'jp7', label: 'Jackson-Pollock 7 pliche', sites: () => ['pettorale', 'ascellare', 'tricipite', 'sottoscapolare', 'addominale', 'sovrailiaca', 'coscia'] },
  { key: 'jp3', label: 'Jackson-Pollock 3 pliche', sites: (sex) => (sex === 'F' ? ['tricipite', 'sovrailiaca', 'coscia'] : ['pettorale', 'addominale', 'coscia']) },
  { key: 'dw4', label: 'Durnin-Womersley 4 pliche', sites: () => ['bicipite', 'tricipite', 'sottoscapolare', 'sovrailiaca'] },
];

export const ACTIVITY_LEVELS = [
  { value: 1.2, label: 'Sedentario' },
  { value: 1.375, label: 'Leggero (1-3 allenamenti/sett.)' },
  { value: 1.55, label: 'Moderato (3-5 allenamenti/sett.)' },
  { value: 1.725, label: 'Alto (6-7 allenamenti/sett.)' },
  { value: 1.9, label: 'Molto alto (2 al giorno / lavoro fisico)' },
];

const num = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(String(value).replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : null;
};
const round = (value, digits = 1) => (Number.isFinite(value) ? Math.round(value * 10 ** digits) / 10 ** digits : null);
const log10 = (value) => Math.log(value) / Math.LN10;

export function normalizeSex(value) {
  const text = String(value || '').trim().toUpperCase();
  if (text.startsWith('F') || text.startsWith('D')) return 'F';
  if (text.startsWith('M') || text.startsWith('U')) return 'M';
  return null;
}

export function ageFrom(birthDate, onDate = new Date()) {
  if (!birthDate) return null;
  const birth = new Date(String(birthDate).slice(0, 10) + 'T12:00:00Z');
  const ref = new Date(String(onDate instanceof Date ? onDate.toISOString() : onDate).slice(0, 10) + 'T12:00:00Z');
  if (Number.isNaN(birth.getTime()) || Number.isNaN(ref.getTime())) return null;
  let age = ref.getUTCFullYear() - birth.getUTCFullYear();
  if (ref.getUTCMonth() < birth.getUTCMonth() || (ref.getUTCMonth() === birth.getUTCMonth() && ref.getUTCDate() < birth.getUTCDate())) age -= 1;
  return age > 0 && age < 120 ? age : null;
}

const siri = (density) => (density ? 495 / density - 450 : null);

function sumOf(pliche, sites) {
  const values = sites.map((site) => num(pliche[site]));
  return values.every((value) => value !== null) ? values.reduce((a, b) => a + b, 0) : null;
}

function densityFor(protocol, sex, age, pliche) {
  if (!sex || !age) return null;
  const sites = PROTOCOLS.find((p) => p.key === protocol)?.sites(sex) || [];
  const sum = sumOf(pliche, sites);
  if (!sum) return null;
  if (protocol === 'jp7') {
    return sex === 'M'
      ? 1.112 - 0.00043499 * sum + 0.00000055 * sum * sum - 0.00028826 * age
      : 1.097 - 0.00046971 * sum + 0.00000056 * sum * sum - 0.00012828 * age;
  }
  if (protocol === 'jp3') {
    return sex === 'M'
      ? 1.10938 - 0.0008267 * sum + 0.0000016 * sum * sum - 0.0002574 * age
      : 1.0994921 - 0.0009929 * sum + 0.0000023 * sum * sum - 0.0001392 * age;
  }
  if (protocol === 'dw4') {
    const table = sex === 'M'
      ? [[19, 1.1620, 0.0630], [29, 1.1631, 0.0632], [39, 1.1422, 0.0544], [49, 1.1620, 0.0700], [200, 1.1715, 0.0779]]
      : [[19, 1.1549, 0.0678], [29, 1.1599, 0.0717], [39, 1.1423, 0.0632], [49, 1.1333, 0.0612], [200, 1.1339, 0.0645]];
    const [, c, m] = table.find(([maxAge]) => age <= maxAge);
    return c - m * log10(sum);
  }
  return null;
}

function navyBodyFat(sex, heightCm, circ) {
  const neck = num(circ.collo);
  const waist = num(circ.addome) || num(circ.vita);
  if (!heightCm || !neck || !waist) return null;
  if (sex === 'M') {
    if (waist <= neck) return null;
    return 495 / (1.0324 - 0.19077 * log10(waist - neck) + 0.15456 * log10(heightCm)) - 450;
  }
  if (sex === 'F') {
    const hip = num(circ.fianchi);
    if (!hip || waist + hip <= neck) return null;
    return 495 / (1.29579 - 0.35004 * log10(waist + hip - neck) + 0.221 * log10(heightCm)) - 450;
  }
  return null;
}

// Categorie % grasso (American Council on Exercise)
export function bodyFatCategory(sex, bf) {
  if (bf === null || bf === undefined || !sex) return null;
  const limits = sex === 'M'
    ? [[6, 'Grasso essenziale', '#0EA5E9'], [14, 'Atletico', '#16A34A'], [18, 'Fitness', '#22C55E'], [25, 'Nella media', '#F59E0B'], [Infinity, 'Elevato', '#DC2626']]
    : [[14, 'Grasso essenziale', '#0EA5E9'], [21, 'Atletico', '#16A34A'], [25, 'Fitness', '#22C55E'], [32, 'Nella media', '#F59E0B'], [Infinity, 'Elevato', '#DC2626']];
  const [, label, color] = limits.find(([max]) => bf < max);
  return { label, color };
}

function bmiCategory(bmi) {
  if (!bmi) return null;
  if (bmi < 18.5) return 'Sottopeso';
  if (bmi < 25) return 'Normopeso';
  if (bmi < 30) return 'Sovrappeso';
  return 'Obesità';
}

const corrected = (girthCm, skinfoldMm) => (girthCm && skinfoldMm !== null ? girthCm - Math.PI * (skinfoldMm / 10) : null);
const meanOf = (...values) => { const list = values.filter((v) => v !== null && v !== undefined); return list.length ? list.reduce((a, b) => a + b, 0) / list.length : null; };

// Calcola tutte le stime possibili con i dati inseriti. Ritorna sempre un oggetto: i campi non calcolabili sono null.
export function computeAssessment(input = {}) {
  const sex = normalizeSex(input.sesso);
  const age = num(input.eta);
  const weight = num(input.peso_kg);
  const heightCm = num(input.altezza_cm);
  const heightM = heightCm ? heightCm / 100 : null;
  const pliche = input.pliche || {};
  const circ = input.circonferenze || {};
  const pal = num(input.livello_attivita) || 1.55;
  const missing = [];
  if (!sex) missing.push('sesso');
  if (!age) missing.push('età');
  if (!weight) missing.push('peso');
  if (!heightCm) missing.push('altezza');

  // % grasso con ogni metodo applicabile
  const methods = [];
  for (const protocol of PROTOCOLS) {
    const density = densityFor(protocol.key, sex, age, pliche);
    if (density) methods.push({ key: protocol.key, label: protocol.label, density: round(density, 4), bf: round(siri(density), 1), sum: round(sumOf(pliche, protocol.sites(sex)), 1) });
  }
  const navy = navyBodyFat(sex, heightCm, circ);
  if (navy !== null && navy > 2 && navy < 70) methods.push({ key: 'navy', label: 'US Navy (circonferenze)', bf: round(navy, 1) });

  const preferred = input.protocollo || 'jp7';
  const main = methods.find((m) => m.key === preferred) || methods.find((m) => m.key !== 'navy') || methods[0] || null;
  const bf = main && main.bf > 2 && main.bf < 70 ? main.bf : null;

  const fatMass = weight && bf !== null ? weight * bf / 100 : null;
  const leanMass = weight && fatMass !== null ? weight - fatMass : null;
  const bmi = weight && heightM ? weight / (heightM * heightM) : null;
  const ffmi = leanMass && heightM ? leanMass / (heightM * heightM) : null;
  const ffmiNorm = ffmi && heightM ? ffmi + 6.1 * (1.8 - heightM) : null;

  // somme delle pliche
  const measuredFolds = SKINFOLDS.map((site) => ({ ...site, mm: num(pliche[site.key]) })).filter((site) => site.mm !== null);
  const sumAll = measuredFolds.length ? measuredFolds.reduce((total, site) => total + site.mm, 0) : null;

  // distribuzione del grasso: quota di ogni plica sul totale e confronto con la media delle pliche misurate
  const meanFold = measuredFolds.length ? sumAll / measuredFolds.length : null;
  const fatSites = measuredFolds.map((site) => ({
    key: site.key, label: site.label, region: site.region, mm: site.mm,
    quota: round((site.mm / sumAll) * 100, 0),
    indice: round(site.mm / meanFold, 2), // >1 = sopra la media del soggetto (grasso localizzato)
  })).sort((a, b) => b.mm - a.mm);
  const regions = ['tronco', 'braccia', 'gambe'].map((region) => {
    const list = measuredFolds.filter((site) => site.region === region);
    return list.length ? { region, media_mm: round(list.reduce((t, s) => t + s.mm, 0) / list.length, 1), siti: list.length } : null;
  }).filter(Boolean);

  // muscolo: circonferenze corrette per lo spessore della plica (muscolo + osso)
  const arm = meanOf(num(circ.braccio_dx), num(circ.braccio_sx));
  const thigh = meanOf(num(circ.coscia_dx), num(circ.coscia_sx));
  const calf = meanOf(num(circ.polpaccio_dx), num(circ.polpaccio_sx));
  const tsf = num(pliche.tricipite);
  const thighFold = num(pliche.coscia);
  const calfFold = num(pliche.polpaccio);
  const muscleSites = [
    { key: 'braccio', label: 'Braccio', girth: arm, fold: tsf, dx: num(circ.braccio_dx), sx: num(circ.braccio_sx) },
    { key: 'coscia', label: 'Coscia', girth: thigh, fold: thighFold, dx: num(circ.coscia_dx), sx: num(circ.coscia_sx) },
    { key: 'polpaccio', label: 'Polpaccio', girth: calf, fold: calfFold, dx: num(circ.polpaccio_dx), sx: num(circ.polpaccio_sx) },
  ].map((site) => {
    const cg = corrected(site.girth, site.fold);
    const area = cg ? (cg * cg) / (4 * Math.PI) : null;
    const asym = site.dx && site.sx ? ((site.dx - site.sx) / Math.max(site.dx, site.sx)) * 100 : null;
    return {
      key: site.key, label: site.label,
      circonferenza: round(site.girth, 1),
      circonferenza_muscolare: round(cg, 1),
      area_muscolare_cm2: round(site.key === 'braccio' && area ? area - (sex === 'F' ? 6.5 : 10) : area, 1),
      asimmetria_pct: round(asym, 1),
      lato_maggiore: asym === null || Math.abs(asym) < 1 ? null : asym > 0 ? 'dx' : 'sx',
    };
  }).filter((site) => site.circonferenza);

  const cag = corrected(arm, tsf);
  const ctg = corrected(thigh, thighFold);
  const ccg = corrected(calf, calfFold);
  const skeletalMuscle = heightM && cag && ctg && ccg && sex && age
    ? heightM * (0.00744 * cag * cag + 0.00088 * ctg * ctg + 0.00441 * ccg * ccg) + 2.4 * (sex === 'M' ? 1 : 0) - 0.048 * age + 7.8
    : null;

  // metabolismo
  const mifflin = weight && heightCm && age && sex ? 10 * weight + 6.25 * heightCm - 5 * age + (sex === 'M' ? 5 : -161) : null;
  const harris = weight && heightCm && age && sex
    ? (sex === 'M' ? 88.362 + 13.397 * weight + 4.799 * heightCm - 5.677 * age : 447.593 + 9.247 * weight + 3.098 * heightCm - 4.33 * age)
    : null;
  const katch = leanMass ? 370 + 21.6 * leanMass : null;
  const cunningham = leanMass ? 500 + 22 * leanMass : null;
  const bmr = katch || mifflin;
  const tdee = bmr ? bmr * pal : null;

  // rapporti e rischio
  const waist = num(circ.vita) || num(circ.addome);
  const hip = num(circ.fianchi);
  const whr = waist && hip ? waist / hip : null;
  const whtr = waist && heightCm ? waist / heightCm : null;
  const whrRisk = whr && sex ? (whr >= (sex === 'M' ? 0.9 : 0.85) ? 'Aumentato' : 'Basso') : null;
  const whtrRisk = whtr ? (whtr >= 0.6 ? 'Alto' : whtr >= 0.5 ? 'Aumentato' : 'Basso') : null;

  // struttura ossea (altezza / polso)
  const wrist = num(circ.polso);
  const frameRatio = wrist && heightCm ? heightCm / wrist : null;
  const frame = frameRatio && sex
    ? (sex === 'M' ? (frameRatio > 10.4 ? 'Esile' : frameRatio >= 9.6 ? 'Media' : 'Robusta') : (frameRatio > 11 ? 'Esile' : frameRatio >= 10.1 ? 'Media' : 'Robusta'))
    : null;

  // peso a una % di grasso obiettivo, mantenendo la massa magra attuale
  const target = num(input.obiettivo_bf);
  const targetWeight = leanMass && target && target < 60 ? leanMass / (1 - target / 100) : null;

  return {
    sesso: sex, eta: age, peso_kg: weight, altezza_cm: heightCm, missing,
    metodo: main ? { key: main.key, label: main.label } : null,
    metodi: methods,
    massa_grassa_pct: bf,
    categoria_grasso: bodyFatCategory(sex, bf),
    massa_grassa_kg: round(fatMass, 1),
    massa_magra_kg: round(leanMass, 1),
    massa_muscolare_kg: round(skeletalMuscle, 1),
    massa_muscolare_pct: skeletalMuscle && weight ? round((skeletalMuscle / weight) * 100, 1) : null,
    bmi: round(bmi, 1), bmi_categoria: bmiCategory(bmi),
    ffmi: round(ffmi, 1), ffmi_normalizzato: round(ffmiNorm, 1),
    somma_pliche: round(sumAll, 1), pliche_misurate: measuredFolds.length,
    distribuzione_grasso: fatSites, regioni_grasso: regions,
    muscolo: muscleSites,
    metabolismo: {
      basale: round(bmr, 0),
      fonte_basale: katch ? 'Katch-McArdle (massa magra)' : mifflin ? 'Mifflin-St Jeor' : null,
      mifflin: round(mifflin, 0), harris_benedict: round(harris, 0), katch_mcardle: round(katch, 0), cunningham: round(cunningham, 0),
      livello_attivita: pal,
      totale: round(tdee, 0),
    },
    vita_fianchi: round(whr, 2), vita_fianchi_rischio: whrRisk,
    vita_altezza: round(whtr, 2), vita_altezza_rischio: whtrRisk,
    struttura_ossea: frame,
    obiettivo_bf: target,
    peso_obiettivo_kg: round(targetWeight, 1),
  };
}

// Differenze rispetto alla valutazione precedente (stesso atleta)
export function compareAssessments(current, previous) {
  if (!current || !previous) return null;
  const diff = (a, b) => (a !== null && a !== undefined && b !== null && b !== undefined ? round(a - b, 1) : null);
  const r = current.risultati || {};
  const p = previous.risultati || {};
  const folds = {};
  for (const site of SKINFOLDS) folds[site.key] = diff(num(current.pliche?.[site.key]), num(previous.pliche?.[site.key]));
  const circs = {};
  for (const site of CIRCUMFERENCES) circs[site.key] = diff(num(current.circonferenze?.[site.key]), num(previous.circonferenze?.[site.key]));
  return {
    data_precedente: previous.data,
    peso_kg: diff(num(current.peso_kg), num(previous.peso_kg)),
    massa_grassa_pct: diff(r.massa_grassa_pct, p.massa_grassa_pct),
    massa_grassa_kg: diff(r.massa_grassa_kg, p.massa_grassa_kg),
    massa_magra_kg: diff(r.massa_magra_kg, p.massa_magra_kg),
    massa_muscolare_kg: diff(r.massa_muscolare_kg, p.massa_muscolare_kg),
    somma_pliche: diff(r.somma_pliche, p.somma_pliche),
    pliche: folds,
    circonferenze: circs,
  };
}
