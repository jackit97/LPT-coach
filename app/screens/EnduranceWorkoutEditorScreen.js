import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, Pressable,
  ActivityIndicator, Alert, Modal, Platform,
} from 'react-native';
import api from '../api/client';
import DateField from '../components/DateField';
import OptionPicker from '../components/OptionPicker';
import ValuePicker from '../components/ValuePicker';
import { useAthlete } from '../context/AthleteContext';
import { colors, radius, spacing, typography } from '../theme';
import { toISODate } from '../utils/dates';
import {
  SPORTS, ZONE_COLORS, DEFAULT_ZONES, BIKE_SPEED_KMH, ZONE_TRIMP_WEIGHTS,
  parsePaceSeconds, parseTimeValue, formatHMS, formatKm, sportInfo,
} from '../utils/endurance';

const PHASES = [
  { key: 'Riscaldamento', label: 'Riscaldamento', color: '#23c6c8' },
  { key: 'Attivazione', label: 'Attivazione', color: '#1c84c6' },
  { key: 'Lavoro', label: 'Lavoro', color: '#1ab394' },
  { key: 'Recupero', label: 'Recupero', color: '#f8ac59' },
  { key: 'Defaticamento', label: 'Defaticamento', color: '#8a94a6' },
];

const UNITS = [
  { key: 'mt', label: 'mt' },
  { key: 'km', label: 'km' },
  { key: 'hh:mm:ss', label: 'hh:mm:ss' },
  { key: 'mm:ss', label: 'mm:ss' },
];

const ZONE_RANGES = ['zona intera', 'bassa', 'centrale', 'alta'];

// Zona "Z0" = recupero da fermo (CoachPeaking: "Recupero fermo"), sempre disponibile.
const REST_ZONE = { key: 'Z0', name: 'Recupero fermo', min: '', max: '' };

const BLOCK_PRESETS = [
  {
    title: 'Riscaldamento progressivo (15\')',
    type: 'Riscaldamento',
    repeats: '1',
    steps: [{ unit: 'hh:mm:ss', value: '00:15:00', zone: 'Z2', subzone: 'zona intera' }],
  },
  {
    title: 'Ripetute 6x (600m Z4 + 200m Z1)',
    type: 'Lavoro',
    repeats: '6',
    steps: [
      { unit: 'mt', value: '600', zone: 'Z4', subzone: 'zona intera' },
      { unit: 'mt', value: '200', zone: 'Z1', subzone: 'zona intera' },
    ],
  },
  {
    title: 'Ripetute 5x (1000m Z4 + 400m Z1)',
    type: 'Lavoro',
    repeats: '5',
    steps: [
      { unit: 'mt', value: '1000', zone: 'Z4', subzone: 'zona intera' },
      { unit: 'mt', value: '400', zone: 'Z1', subzone: 'zona intera' },
    ],
  },
  {
    title: 'Fartlek 10x (1\' Z5 + 1\' Z2)',
    type: 'Lavoro',
    repeats: '10',
    steps: [
      { unit: 'mm:ss', value: '01:00', zone: 'Z5', subzone: 'zona intera' },
      { unit: 'mm:ss', value: '01:00', zone: 'Z2', subzone: 'zona intera' },
    ],
  },
  {
    title: 'Defaticamento (10\')',
    type: 'Defaticamento',
    repeats: '1',
    steps: [{ unit: 'hh:mm:ss', value: '00:10:00', zone: 'Z1', subzone: 'zona intera' }],
  },
];

// Nessun valore di esempio: i campi vuoti mostrano solo il nome del campo
function emptyStep(zone = 'Z2', unit = 'mt', value = '') {
  return { unit, value, zone, subzone: 'zona intera', notes: '' };
}

function emptyBlock(type = 'Lavoro', title = '') {
  return {
    type,
    title,
    repeats: '1',
    notes: '',
    steps: [emptyStep(type === 'Riscaldamento' ? 'Z2' : type === 'Defaticamento' ? 'Z1' : 'Z4', type === 'Lavoro' ? 'mt' : 'hh:mm:ss', '')],
  };
}

export default function EnduranceWorkoutEditorScreen({ route, navigation }) {
  const workoutId = route.params?.workoutId;
  const isEdit = Boolean(workoutId);
  // Modalita' libreria: allenamento standard senza atleta ne' data
  const libraryTemplateId = route.params?.libraryTemplateId || null;
  const libraryMode = !!route.params?.libraryMode || !!libraryTemplateId;
  const { targetUserId, selectedAthlete } = useAthlete();

  const [date, setDate] = useState(route.params?.date || toISODate(new Date()));
  const [sport, setSport] = useState(route.params?.sport || 'corsa');
  const [title, setTitle] = useState('');
  const [autoDesc, setAutoDesc] = useState(false);
  const [stars, setStars] = useState(3);
  const [elevation, setElevation] = useState('0');
  const [generalZone, setGeneralZone] = useState('Z2');
  const [target, setTarget] = useState('');
  const [notes, setNotes] = useState(route.params?.coachNote || '');
  const [videoUrls, setVideoUrls] = useState([]);
  const [videoModal, setVideoModal] = useState(false);
  const [videoInput, setVideoInput] = useState('');
  const [blocks, setBlocks] = useState([
    emptyBlock('Riscaldamento'),
    emptyBlock('Lavoro'),
    emptyBlock('Defaticamento'),
  ]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(isEdit || !!route.params?.libraryTemplateId);
  const [athleteZones, setAthleteZones] = useState({});
  const [libraryBlocks, setLibraryBlocks] = useState([]);
  const [zoneViewMode, setZoneViewMode] = useState('tempo'); // 'tempo' | 'distanza'

  // Modals
  const [calcModal, setCalcModal] = useState(false);
  const [calcDist, setCalcDist] = useState('1000');
  const [calcPace, setCalcPace] = useState('04:30');
  const [importModal, setImportModal] = useState(false);
  const [sportModal, setSportModal] = useState(false);

  // Riempie l'editor da un allenamento del calendario (o da uno della libreria convertito nello stesso formato)
  const applyWorkout = (data) => {
        setDate(String(data.data).slice(0, 10));
        setTitle(data.titolo || '');
        setAutoDesc(false);
        setNotes(data.descrizione || '');
        const savedSport = data.sport || data.endurance?.sport;
        if (sportInfo(savedSport)) setSport(savedSport);
        if (data.endurance?.elevation_m) setElevation(String(data.endurance.elevation_m));
        if (data.rpe_pianificato) setStars(Math.min(5, Math.max(1, Math.round(Number(data.rpe_pianificato) / 2))));
        if (data.endurance?.video_urls_json) {
          try { const urls = JSON.parse(data.endurance.video_urls_json); if (Array.isArray(urls)) setVideoUrls(urls); } catch { /* ignore */ }
        }
        setGeneralZone(data.endurance?.zone || 'Z2');
        setTarget(data.endurance?.target || '');
        if (data.endurance?.steps_json) {
          try {
            const parsed = JSON.parse(data.endurance.steps_json);
            const loaded = parsed.map((b) => ({
              type: b.type || 'Lavoro',
              title: b.title || b.type || 'Fase',
              repeats: String(b.repeats || '1'),
              notes: b.notes || '',
              steps: (b.children && b.children.length ? b.children : [b]).map((c) => ({
                unit: c.unit || (c.meters ? 'mt' : 'mm:ss'),
                value: String(c.value ?? c.meters ?? c.duration ?? '600'),
                zone: c.zone || 'Z4',
                subzone: c.subzone || 'zona intera',
                notes: c.notes || '',
              })),
            }));
            if (loaded.length) setBlocks(loaded);
          } catch {
            // keep defaults
          }
        }
  };

  // Load workout if editing
  useEffect(() => {
    if (!workoutId) return;
    setLoading(true);
    api.get(`/calendar/${workoutId}`)
      .then(({ data }) => applyWorkout(data))
      .catch(() => Alert.alert('Errore', "Impossibile caricare l'allenamento"))
      .finally(() => setLoading(false));
  }, [workoutId]);

  // Libreria: carica l'allenamento standard da modificare
  useEffect(() => {
    if (!libraryTemplateId) return;
    setLoading(true);
    api.get(`/workouts/templates/${libraryTemplateId}`)
      .then(({ data: template }) => {
        let endurance = {};
        try { endurance = JSON.parse(template.endurance_json || '{}') || {}; } catch { endurance = {}; }
        applyWorkout({
          data: toISODate(new Date()),
          titolo: template.nometemplate,
          descrizione: template.notegenerali,
          sport: endurance.sport,
          rpe_pianificato: template.rpe_pianificato,
          endurance,
        });
      })
      .catch(() => Alert.alert('Errore', "Impossibile caricare l'allenamento della libreria"))
      .finally(() => setLoading(false));
  }, [libraryTemplateId]);

  // Zone dell'atleta (tutti gli sport): passo corsa /km, potenza bici W, passo nuoto /100m
  useEffect(() => {
    if (!targetUserId) return;
    api.get('/zones', { params: { utenteId: targetUserId } })
      .then(({ data }) => setAthleteZones(data.zones || {}))
      .catch(() => setAthleteZones({}));
  }, [targetUserId]);

  // Libreria blocchi personale del coach
  const loadLibrary = async () => {
    try {
      const { data } = await api.get('/endurance/blocks', { params: { sport } });
      setLibraryBlocks(data || []);
    } catch {
      setLibraryBlocks([]);
    }
  };
  useEffect(() => { loadLibrary(); }, [sport]);

  const currentSport = sportInfo(sport) || SPORTS[0];
  const cleanValue = (value) => String(value ?? '').replace(/\/km|\/100m|W/g, '').trim();
  const activeZones = useMemo(() => {
    const group = currentSport.zoneGroup;
    const fromAthlete = Array.isArray(athleteZones[group]) ? athleteZones[group] : [];
    const hasValues = fromAthlete.some((zone) => cleanValue(zone.min) || cleanValue(zone.max));
    const list = (hasValues ? fromAthlete : DEFAULT_ZONES[group] || DEFAULT_ZONES.pace)
      .filter((zone) => /^Z[1-7]$/.test(zone.key))
      .map((zone) => ({ key: zone.key, name: zone.name || zone.key, min: cleanValue(zone.min), max: cleanValue(zone.max) }));
    return list;
  }, [athleteZones, currentSport.zoneGroup]);
  const usingDefaultZones = !(athleteZones[currentSport.zoneGroup] || []).some((zone) => cleanValue(zone.min) || cleanValue(zone.max));

  const zoneRangeLabel = (zone) => {
    if (!zone || (!zone.min && !zone.max)) return '';
    return `${zone.min} - ${zone.max} ${currentSport.unit}`;
  };

  // Secondi necessari per percorrere 1 km nella zona indicata (per stimare tempo <-> distanza)
  const getSecondsPerKm = (zoneKey, subzone = 'zona intera') => {
    if (zoneKey === 'Z0') return 0;
    if (currentSport.key === 'ciclismo') {
      const speed = BIKE_SPEED_KMH[zoneKey] || 28;
      return 3600 / speed;
    }
    const found = activeZones.find((z) => z.key === zoneKey);
    const fallback = currentSport.key === 'nuoto' ? 130 : 300;
    if (!found) return fallback * (1000 / currentSport.base);
    const minSec = parsePaceSeconds(found.min) || fallback;
    const maxSec = parsePaceSeconds(found.max) || minSec;
    let pace = (minSec + maxSec) / 2;
    if (subzone === 'bassa') pace = minSec;
    if (subzone === 'alta') pace = maxSec;
    return pace * (1000 / currentSport.base);
  };

  // Step duration & distance calculation
  const calcStep = (step) => {
    const pace = getSecondsPerKm(step.zone, step.subzone);
    let seconds = 0;
    let meters = 0;

    if (step.unit === 'mt') {
      meters = Number(String(step.value).replace(',', '.')) || 0;
      seconds = (meters / 1000) * pace;
    } else if (step.unit === 'km') {
      const km = Number(String(step.value).replace(',', '.')) || 0;
      meters = km * 1000;
      seconds = km * pace;
    } else if (step.unit === 'hh:mm:ss' || step.unit === 'mm:ss') {
      seconds = parseTimeValue(step.value);
      meters = pace > 0 ? (seconds / pace) * 1000 : 0;
    }
    return { seconds, meters };
  };

  // Block calculations
  const calcBlock = (block) => {
    const repeats = Math.max(1, Number(block.repeats) || 1);
    let blockSeconds = 0;
    let blockMeters = 0;
    const stepCalcs = block.steps.map((step) => {
      const c = calcStep(step);
      blockSeconds += c.seconds * repeats;
      blockMeters += c.meters * repeats;
      return c;
    });
    return { seconds: blockSeconds, meters: blockMeters, stepCalcs };
  };

  // Overall workout totals
  const workoutTotals = useMemo(() => {
    let totalSeconds = 0;
    let totalMeters = 0;
    const zoneTime = { Z0: 0, Z1: 0, Z2: 0, Z3: 0, Z4: 0, Z5: 0, Z6: 0, Z7: 0 };
    const zoneDist = { Z0: 0, Z1: 0, Z2: 0, Z3: 0, Z4: 0, Z5: 0, Z6: 0, Z7: 0 };
    let activeWorkSeconds = 0;
    let recoverySeconds = 0;

    blocks.forEach((block) => {
      const repeats = Math.max(1, Number(block.repeats) || 1);
      block.steps.forEach((step) => {
        const c = calcStep(step);
        const s = c.seconds * repeats;
        const m = c.meters * repeats;
        totalSeconds += s;
        totalMeters += m;

        const zk = step.zone in zoneTime ? step.zone : 'Z2';
        zoneTime[zk] = (zoneTime[zk] || 0) + s;
        zoneDist[zk] = (zoneDist[zk] || 0) + m;

        if (block.type === 'Recupero' || step.zone === 'Z1' || step.zone === 'Z0') {
          recoverySeconds += s;
        } else {
          activeWorkSeconds += s;
        }
      });
    });

    // Trimp estimation
    let trimp = 0;
    Object.entries(zoneTime).forEach(([zk, sec]) => {
      trimp += (sec / 60) * (ZONE_TRIMP_WEIGHTS[zk] ?? 1);
    });

    // Stima kcal (atleta ~70 kg): corsa ~1 kcal/kg/km, bici ~10 kcal/min, nuoto ~9 kcal/min
    const kcal = currentSport.key === 'corsa'
      ? Math.round((totalMeters / 1000) * 72)
      : Math.round((totalSeconds / 60) * (currentSport.key === 'ciclismo' ? 10 : 9));

    // Density: active work vs rest
    const densita = recoverySeconds > 0
      ? (activeWorkSeconds / recoverySeconds).toFixed(1)
      : '1.0';

    return {
      totalSeconds,
      totalMeters,
      zoneTime,
      zoneDist,
      trimp: Math.round(trimp),
      kcal,
      densita,
    };
  }, [blocks, activeZones, currentSport.key]);

  // Auto-generate title if enabled
  useEffect(() => {
    if (!autoDesc || isEdit) return;
    const summaries = blocks.map((b) => {
      const reps = Number(b.repeats) || 1;
      const inner = b.steps.filter((st) => String(st.value || '').trim()).map((st) => `${st.value}${st.unit} ${st.zone}`).join(' + ');
      if (!inner) return '';
      return reps > 1 ? `${reps}x (${inner})` : inner;
    }).filter(Boolean);
    if (summaries.length) {
      setTitle(summaries.join(' + '));
    }
  }, [blocks, autoDesc, isEdit]);

  // Block management
  const updateBlockField = (index, field, value) => {
    setBlocks((curr) => curr.map((b, i) => (i === index ? { ...b, [field]: value } : b)));
  };

  const updateStepField = (blockIndex, stepIndex, field, value) => {
    setBlocks((curr) => curr.map((b, bi) => (bi === blockIndex
      ? { ...b, steps: b.steps.map((s, si) => (si === stepIndex ? { ...s, [field]: value } : s)) }
      : b)));
  };

  const addBlock = () => {
    setBlocks((curr) => [...curr, emptyBlock('Lavoro')]);
  };

  const duplicateBlock = (index) => {
    const copy = JSON.parse(JSON.stringify(blocks[index]));
    setBlocks((curr) => [...curr.slice(0, index + 1), copy, ...curr.slice(index + 1)]);
  };

  const removeBlock = (index) => {
    if (blocks.length <= 1) return Alert.alert('Attenzione', 'Devi avere almeno un blocco');
    setBlocks((curr) => curr.filter((_, i) => i !== index));
  };

  const addStepToBlock = (blockIndex) => {
    setBlocks((curr) => curr.map((b, bi) => (bi === blockIndex
      ? { ...b, steps: [...b.steps, emptyStep()] }
      : b)));
  };

  const duplicateStep = (blockIndex, stepIndex) => {
    setBlocks((curr) => curr.map((b, bi) => {
      if (bi !== blockIndex) return b;
      const copy = { ...b.steps[stepIndex] };
      return {
        ...b,
        steps: [...b.steps.slice(0, stepIndex + 1), copy, ...b.steps.slice(stepIndex + 1)],
      };
    }));
  };

  const removeStep = (blockIndex, stepIndex) => {
    setBlocks((curr) => curr.map((b, bi) => {
      if (bi !== blockIndex) return b;
      if (b.steps.length <= 1) return b;
      return { ...b, steps: b.steps.filter((_, si) => si !== stepIndex) };
    }));
  };

  const blockSummary = (block) => {
    const reps = Number(block.repeats) || 1;
    const inner = block.steps.map((st) => `${st.value}${st.unit} ${st.zone}`).join(' + ');
    return reps > 1 ? `${reps}x (${inner})` : inner;
  };

  const saveBlockToLibrary = async (block) => {
    const titleText = (block.title && !PHASES.some((phase) => phase.key === block.title) ? block.title : blockSummary(block)).slice(0, 200);
    try {
      await api.post('/endurance/blocks', {
        title: titleText,
        sport,
        block: { type: block.type, title: block.title, repeats: block.repeats, notes: block.notes, steps: block.steps },
      });
      await loadLibrary();
      Alert.alert('Libreria blocchi', `"${titleText}" salvato nella tua libreria`);
    } catch (err) {
      Alert.alert('Errore', err?.response?.data?.message || 'Impossibile salvare il blocco');
    }
  };

  const deleteLibraryBlock = async (blockId) => {
    try {
      await api.delete(`/endurance/blocks/${blockId}`);
      setLibraryBlocks((current) => current.filter((item) => item.block_id !== blockId));
    } catch (err) {
      Alert.alert('Errore', err?.response?.data?.message || 'Impossibile eliminare il blocco');
    }
  };

  const importPreset = (preset) => {
    const newBlock = {
      type: preset.type || 'Lavoro',
      title: preset.title || '',
      repeats: String(preset.repeats || '1'),
      notes: preset.notes || '',
      steps: (preset.steps || []).map((st) => ({ subzone: 'zona intera', ...st, notes: st.notes || '' })),
    };
    setBlocks((curr) => [...curr, newBlock]);
    setImportModal(false);
  };

  // Save to backend
  const saveWorkout = async () => {
    if (libraryMode ? !title.trim() : (!targetUserId || !date || !title.trim())) {
      return Alert.alert('Errore', libraryMode ? 'Compila il titolo.' : 'Compila titolo e data.');
    }
    if (!workoutTotals.totalSeconds) {
      return Alert.alert('Errore', 'Inserisci durata o distanza di almeno un intervallo.');
    }
    setSaving(true);
    try {
      const durationMinutes = Math.max(1, Math.ceil(workoutTotals.totalSeconds / 60));
      const stepsPayload = blocks.map((b) => {
        const reps = Number(b.repeats) || 1;
        const bCalc = calcBlock(b);
        return {
          type: b.type,
          title: b.title,
          repeats: String(reps),
          notes: b.notes,
          duration: formatHMS(bCalc.seconds),
          meters: Math.round(bCalc.meters),
          children: b.steps.map((s) => {
            const sc = calcStep(s);
            return {
              type: b.type,
              unit: s.unit,
              value: s.value,
              zone: s.zone,
              subzone: s.subzone,
              notes: s.notes,
              duration: formatHMS(sc.seconds),
              meters: Math.round(sc.meters),
            };
          }),
        };
      });

      const payload = {
        utenteId: targetUserId,
        date,
        title: title.trim(),
        zone: generalZone,
        durationMinutes,
        durationSeconds: Math.round(workoutTotals.totalSeconds),
        target: target || null,
        description: notes || null,
        rpeTarget: stars * 2, // 1-5 stelle -> RPE 2-10
        stepsJson: stepsPayload,
        sport,
        elevationM: Number(elevation) || null,
        videoUrls,
      };

      if (libraryMode) {
        const templatePayload = {
          nomeTemplate: payload.title,
          noteGenerali: payload.description,
          tipo: 'endurance',
          durataMinuti: payload.durationMinutes,
          durataSecondi: payload.durationSeconds,
          rpePianificato: payload.rpeTarget,
          endurance: {
            sport: payload.sport, zone: payload.zone, target: payload.target, description: payload.description,
            rpe_target: payload.rpeTarget, steps_json: payload.stepsJson, duration_minutes: payload.durationMinutes,
            duration_seconds: payload.durationSeconds, elevation_m: payload.elevationM, video_urls: payload.videoUrls,
          },
        };
        if (libraryTemplateId) await api.put(`/workouts/templates/${libraryTemplateId}`, templatePayload);
        else await api.post('/workouts/templates', templatePayload);
        navigation.goBack();
        return;
      }
      if (isEdit) {
        await api.put(`/endurance/workouts/${workoutId}`, payload);
      } else {
        await api.post('/endurance/workouts', payload);
      }

      if (isEdit) navigation.replace('WorkoutDetail', { workoutId });
      else navigation.goBack();
    } catch (err) {
      Alert.alert('Errore', err?.response?.data?.message || 'Impossibile salvare il workout');
    } finally {
      setSaving(false);
    }
  };

  // Calculator helper
  const calcPaceTime = useMemo(() => {
    const distM = Number(calcDist) || 0;
    const paceSec = parsePaceSeconds(calcPace) || 0;
    if (!distM || !paceSec) return '0:00:00';
    return formatHMS((distM / 1000) * paceSec);
  }, [calcDist, calcPace]);


  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#1ab394" />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      {/* COACHPEAKING TOP BAR */}
      <View style={styles.topBar}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backLink}>
          <Text style={styles.backLinkText}>{libraryMode ? '‹ Annulla e torna alla libreria' : '‹ Annulla e torna al calendario'}</Text>
        </Pressable>
        <Pressable style={styles.saveTopBtn} onPress={saveWorkout} disabled={saving}>
          {saving ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.saveTopBtnText}>{libraryMode ? 'Salva in libreria' : isEdit ? 'Salva modifiche' : 'Salva allenamento'}</Text>
          )}
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {/* WORKOUT HEADER CARD */}
        <View style={styles.headerCard}>
          <View style={styles.titleRow}>
            {/* Sport badge */}
            <Pressable style={[styles.sportBadge, { backgroundColor: currentSport.color }]} onPress={() => setSportModal(true)}>
              <Text style={styles.sportBadgeIcon}>{currentSport.icon}</Text>
            </Pressable>

            {/* Title input */}
            <TextInput
              value={title}
              onChangeText={setTitle}
              style={styles.titleInput}
              placeholder="Titolo"
              placeholderTextColor="#999"
            />
            <Text style={styles.pencilIcon}>✎</Text>
          </View>

          {/* Sub toolbar */}
          <View style={styles.subToolbar}>
            {/* Auto description switch */}
            <Pressable style={styles.toggleRow} onPress={() => setAutoDesc(!autoDesc)}>
              <View style={[styles.switchTrack, autoDesc && styles.switchTrackActive]}>
                <View style={[styles.switchThumb, autoDesc && styles.switchThumbActive]} />
              </View>
              <Text style={styles.switchLabel}>Descrizione automatica</Text>
            </Pressable>

            {/* Difficulty rating stars */}
            <View style={styles.starsRow}>
              {[1, 2, 3, 4, 5].map((s) => (
                <Pressable key={s} onPress={() => setStars(s)} hitSlop={4}>
                  <Text style={[styles.star, s <= stars && styles.starActive]}>★</Text>
                </Pressable>
              ))}
            </View>

            {/* Riferimento zone per lo sport */}
            <View style={styles.badgeSelector}>
              <Text style={styles.badgeSelectorText}>
                {currentSport.icon} {currentSport.key === 'ciclismo' ? 'Potenza' : 'Passo'} {currentSport.unit}{usingDefaultZones ? ' · zone standard' : ''}
              </Text>
            </View>

            {/* D+ elevation */}
            <View style={styles.elevRow}>
              <Text style={styles.elevLabel}>D+</Text>
              <TextInput
                value={elevation}
                onChangeText={setElevation}
                keyboardType="numeric"
                style={styles.elevInput}
              />
              <Text style={styles.elevUnit}>mt</Text>
            </View>

            {/* Date field (non serve per gli allenamenti della libreria) */}
            {!libraryMode && (
              <View style={{ width: 140 }}>
                <DateField value={date} onChange={setDate} />
              </View>
            )}

            {/* Calcolatore button */}
            <Pressable style={styles.calcBtn} onPress={() => setCalcModal(true)}>
              <Text style={styles.calcBtnText}>⚡ Calcolatore</Text>
            </Pressable>
          </View>
        </View>

        {/* KPI / STATS BAR (COACHPEAKING 5-COLUMN WHITE CARD) */}
        <View style={styles.kpiCard}>
          <View style={styles.kpiCol}>
            <Text style={styles.kpiLabel}>DURATA</Text>
            <Text style={styles.kpiValue}>{formatHMS(workoutTotals.totalSeconds)}</Text>
          </View>
          <View style={styles.kpiDivider} />
          <View style={styles.kpiCol}>
            <Text style={styles.kpiLabel}>DISTANZA</Text>
            <Text style={styles.kpiValue}>{formatKm(workoutTotals.totalMeters)}</Text>
          </View>
          <View style={styles.kpiDivider} />
          <View style={styles.kpiCol}>
            <Text style={styles.kpiLabel}>TRIMP</Text>
            <Text style={styles.kpiValue}>{workoutTotals.trimp || '-'}</Text>
          </View>
          <View style={styles.kpiDivider} />
          <View style={styles.kpiCol}>
            <Text style={styles.kpiLabel}>KCAL</Text>
            <Text style={styles.kpiValue}>{workoutTotals.kcal || '-'}</Text>
          </View>
          <View style={styles.kpiDivider} />
          <View style={styles.kpiCol}>
            <Text style={styles.kpiLabel}>DENSITÀ</Text>
            <Text style={styles.kpiValue}>{workoutTotals.densita || '-'}</Text>
          </View>
        </View>

        {/* WORKOUT PROFILE STEP BAR CHART */}
        <View style={styles.chartCard}>
          <View style={styles.chartBars}>
            {blocks.flatMap((b) => {
              const reps = Math.max(1, Number(b.repeats) || 1);
              return Array.from({ length: reps }, () => b.steps).flat();
            }).map((step, idx) => {
              const zoneNum = Number(String(step.zone).replace(/\D/g, '')) || 0;
              const heightPercent = Math.min(100, Math.max(8, zoneNum * 14));
              const color = ZONE_COLORS[step.zone] || '#1ab394';
              return (
                <View key={idx} style={styles.chartBarItem}>
                  <View style={[styles.chartBarFill, { height: `${heightPercent}%`, backgroundColor: color }]} />
                  <Text style={styles.chartBarLabel} numberOfLines={1}>{step.zone}</Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* BLOCKS SECTION */}
        <View style={styles.blocksSection}>
          {blocks.map((block, bi) => {
            const bCalc = calcBlock(block);
            const isRepeat = (Number(block.repeats) || 1) > 1 || block.steps.length > 1;
            const phaseObj = PHASES.find((p) => p.key === block.type) || PHASES[2];

            return (
              <View key={bi} style={styles.blockCard}>
                {/* Block header */}
                <View style={styles.blockHeader}>
                  <Text style={styles.dragGrip}>⋮⋮</Text>

                  {/* Phase selector pill */}
                  <OptionPicker
                    title="Fase del blocco"
                    value={block.type}
                    options={PHASES.map((phase) => ({ value: phase.key, label: phase.label, color: phase.color }))}
                    onChange={(value) => updateBlockField(bi, 'type', value)}
                    style={[styles.phasePill, { backgroundColor: phaseObj.color }]}
                    textStyle={styles.phasePillText}
                  />

                  {/* Block subtitle input */}
                  <TextInput
                    value={block.title}
                    onChangeText={(v) => updateBlockField(bi, 'title', v)}
                    style={styles.blockTitleInput}
                    placeholder="Descrizione blocco"
                    placeholderTextColor="#aaa"
                  />

                  {/* Block total summary */}
                  <Text style={styles.blockSummaryText}>
                    {formatHMS(bCalc.seconds)} · {formatKm(bCalc.meters)}
                  </Text>

                  {/* Azioni: salva in libreria, duplica, elimina */}
                  <Pressable onPress={() => saveBlockToLibrary(block)} hitSlop={6} style={styles.headerIconBtn}>
                    <Text style={styles.headerIcon}>☆</Text>
                  </Pressable>
                  <Pressable onPress={() => duplicateBlock(bi)} hitSlop={6} style={styles.headerIconBtn}>
                    <Text style={styles.headerIcon}>⧉</Text>
                  </Pressable>
                  <Pressable onPress={() => removeBlock(bi)} hitSlop={6} style={styles.headerIconBtn}>
                    <Text style={[styles.headerIcon, { color: '#dc2626' }]}>🗑</Text>
                  </Pressable>
                </View>

                {/* Steps container */}
                <View style={[styles.stepsContainer, isRepeat && styles.repeatContainer]}>
                  {/* Outer repeat bar */}
                  {isRepeat && (
                    <View style={styles.repeatTopBar}>
                      <View style={styles.repeatCountBox}>
                        <ValuePicker
                          value={String(block.repeats)}
                          field="repeats"
                          label="Ripetizioni"
                          compact
                          onChange={(v) => updateBlockField(bi, 'repeats', String(v).replace(/\D/g, '') || '1')}
                          style={styles.repeatInput}
                        />
                        <Text style={styles.repeatX}>x</Text>
                      </View>
                      <Text style={styles.repeatSummaryText}>
                        {formatHMS(bCalc.seconds)} · {formatKm(bCalc.meters)}
                      </Text>
                    </View>
                  )}

                  {/* Step rows */}
                  {block.steps.map((step, si) => {
                    const sc = calcStep(step);
                    const zColor = ZONE_COLORS[step.zone] || '#1ab394';
                    const zInfo = activeZones.find((z) => z.key === step.zone);

                    return (
                      <View key={si} style={styles.stepRow}>
                        {/* Repeat count if single step */}
                        {!isRepeat && (
                          <View style={styles.singleRepBox}>
                            <ValuePicker
                          value={String(block.repeats)}
                          field="repeats"
                          label="Ripetizioni"
                          compact
                          onChange={(v) => updateBlockField(bi, 'repeats', String(v).replace(/\D/g, '') || '1')}
                          style={styles.singleRepInput}
                        />
                            <Text style={styles.repeatX}>x</Text>
                          </View>
                        )}

                        {/* Step summary time/distance */}
                        <Text style={styles.stepSubSummary}>
                          {formatHMS(sc.seconds)} · {formatKm(sc.meters)}
                        </Text>

                        {/* Unit selector */}
                        <OptionPicker
                          title="Unità"
                          value={step.unit}
                          options={UNITS.map((u) => ({ value: u.key, label: u.label }))}
                          onChange={(value) => updateStepField(bi, si, 'unit', value)}
                          style={styles.unitBox}
                          textStyle={styles.unitText}
                        />

                        {/* Value input */}
                        {step.unit === 'mt' || step.unit === 'km' ? (
                          <ValuePicker
                            value={step.value}
                            unit={step.unit === 'mt' ? 'm' : 'km'}
                            label={step.unit === 'mt' ? 'Metri' : 'Chilometri'}
                            compact
                            onChange={(v) => updateStepField(bi, si, 'value', step.unit === 'km' ? String(v).replace(',', '.') : v)}
                            style={styles.stepValPicker}
                          />
                        ) : (
                          <TextInput
                            value={step.value}
                            onChangeText={(v) => updateStepField(bi, si, 'value', v)}
                            style={styles.stepValInput}
                            placeholder="Valore"
                          />
                        )}

                        {/* Zone dropdown */}
                        <OptionPicker
                          title="Zona di intensità"
                          value={step.zone}
                          options={[REST_ZONE, ...activeZones].map((z) => ({
                            value: z.key,
                            label: `${z.key} - ${z.name}${zoneRangeLabel(z) ? ` | ${zoneRangeLabel(z)}` : ''}`,
                            color: ZONE_COLORS[z.key],
                          }))}
                          onChange={(value) => updateStepField(bi, si, 'zone', value)}
                          style={styles.zoneBox}
                        >
                          <View style={[styles.zoneColorDot, { backgroundColor: zColor }]} />
                          <Text style={styles.zoneBoxText} numberOfLines={1}>
                            {step.zone} {zInfo ? `· ${zInfo.name}${zoneRangeLabel(zInfo) ? ` | ${zoneRangeLabel(zInfo)}` : ''}` : step.zone === 'Z0' ? '· Recupero fermo' : ''} ▾
                          </Text>
                        </OptionPicker>

                        {/* Subzone range */}
                        <OptionPicker
                          title="Parte della zona"
                          value={step.subzone}
                          options={ZONE_RANGES.map((r) => ({ value: r, label: r }))}
                          onChange={(value) => updateStepField(bi, si, 'subzone', value)}
                          style={styles.subzoneBox}
                          textStyle={styles.subzoneText}
                        />

                        {/* Step actions: Duplicate, Delete */}
                        <Pressable onPress={() => duplicateStep(bi, si)} hitSlop={4} style={styles.stepActionBtn}>
                          <Text style={styles.stepActionIcon}>⧉</Text>
                        </Pressable>
                        <Pressable onPress={() => removeStep(bi, si)} hitSlop={4} style={styles.stepActionBtn}>
                          <Text style={[styles.stepActionIcon, { color: '#dc2626' }]}>✕</Text>
                        </Pressable>
                      </View>
                    );
                  })}

                  {/* Add step inside repeat group */}
                  <Pressable style={styles.addStepBtn} onPress={() => addStepToBlock(bi)}>
                    <Text style={styles.addStepBtnText}>+ Aggiungi intervallo</Text>
                  </Pressable>
                </View>

                {/* Optional block notes */}
                <TextInput
                  value={block.notes}
                  onChangeText={(v) => updateBlockField(bi, 'notes', v)}
                  style={styles.blockNotesInput}
                  placeholder="Note sul blocco"
                  placeholderTextColor="#aaa"
                />
              </View>
            );
          })}

          {/* Action buttons at bottom of blocks */}
          <View style={styles.blocksActionsRow}>
            <Pressable style={styles.addBlockBigBtn} onPress={addBlock}>
              <Text style={styles.addBlockBigText}>+ Aggiungi blocco</Text>
            </Pressable>
            <Pressable style={styles.importBlockBtn} onPress={() => setImportModal(true)}>
              <Text style={styles.importBlockText}>⇪ Importa blocco</Text>
            </Pressable>
          </View>
        </View>

        {/* BOTTOM ANALYSIS SECTION (ZONE DI ALLENAMENTO, NOTE, VIDEO) */}
        <View style={styles.bottomGrid}>
          <View style={styles.bottomCard}>
            <View style={styles.bottomCardHeader}>
              <Text style={styles.bottomCardTitle}>Zone di allenamento</Text>
              <View style={styles.radioGroup}>
                <Pressable
                  style={[styles.radioItem, zoneViewMode === 'tempo' && styles.radioItemActive]}
                  onPress={() => setZoneViewMode('tempo')}
                >
                  <Text style={[styles.radioText, zoneViewMode === 'tempo' && styles.radioTextActive]}>Tempo</Text>
                </Pressable>
                <Pressable
                  style={[styles.radioItem, zoneViewMode === 'distanza' && styles.radioItemActive]}
                  onPress={() => setZoneViewMode('distanza')}
                >
                  <Text style={[styles.radioText, zoneViewMode === 'distanza' && styles.radioTextActive]}>Distanza</Text>
                </Pressable>
              </View>
            </View>

            <View style={styles.zoneTable}>
              <View style={styles.zoneTableRow}>
                <View style={styles.zoneTableCellLeft}>
                  <View style={[styles.zoneSquare, { backgroundColor: ZONE_COLORS.Z0 }]} />
                  <Text style={styles.zoneTableName}>Recupero fermo</Text>
                </View>
                <Text style={styles.zoneTableValue}>
                  {zoneViewMode === 'tempo' ? formatHMS(workoutTotals.zoneTime.Z0 || 0) : '0.0 km'}
                </Text>
              </View>

              {activeZones.map((z) => {
                const zColor = ZONE_COLORS[z.key] || '#1ab394';
                const timeSec = workoutTotals.zoneTime[z.key] || 0;
                const distM = workoutTotals.zoneDist[z.key] || 0;
                return (
                  <View key={z.key} style={styles.zoneTableRow}>
                    <View style={styles.zoneTableCellLeft}>
                      <View style={[styles.zoneSquare, { backgroundColor: zColor }]} />
                      <Text style={styles.zoneTableName}>
                        {z.key} - {z.name}{zoneRangeLabel(z) ? ` | ${zoneRangeLabel(z)}` : ''}
                      </Text>
                    </View>
                    <Text style={styles.zoneTableValue}>
                      {zoneViewMode === 'tempo' ? formatHMS(timeSec) : formatKm(distM)}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>

          <View style={styles.bottomCard}>
            <View style={styles.bottomCardHeader}>
              <Text style={styles.bottomCardTitle}>Note</Text>
              <Text style={styles.inlineChip}>Coach</Text>
            </View>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              style={styles.notesTextarea}
              multiline
              placeholder="Note per l'atleta"
              placeholderTextColor="#aaa"
            />

          </View>

        </View>
      </ScrollView>

      {/* FLOATING CALCULATOR MODAL (CALCOLATORE PASSO) */}
      <Modal visible={calcModal} transparent animationType="fade" onRequestClose={() => setCalcModal(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.calcDialog}>
            <View style={styles.dialogHeader}>
              <Text style={styles.dialogTitle}>Calcolatore passo</Text>
              <Pressable onPress={() => setCalcModal(false)}>
                <Text style={styles.dialogClose}>✕</Text>
              </Pressable>
            </View>
            <View style={styles.calcBody}>
              <Text style={styles.calcFieldLabel}>Distanza (mt)</Text>
              <TextInput
                value={calcDist}
                onChangeText={setCalcDist}
                keyboardType="numeric"
                style={styles.calcInput}
              />
              <Text style={styles.calcFieldLabel}>Passo (min/Km)</Text>
              <TextInput
                value={calcPace}
                onChangeText={setCalcPace}
                style={styles.calcInput}
                placeholder="mm:ss"
              />
              <Text style={styles.calcFieldLabel}>Tempo calcolato</Text>
              <View style={styles.calcResultBox}>
                <Text style={styles.calcResultText}>{calcPaceTime}</Text>
              </View>
            </View>
            <Pressable style={styles.dialogOkBtn} onPress={() => setCalcModal(false)}>
              <Text style={styles.dialogOkBtnText}>Chiudi</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* IMPORT PRESET BLOCK MODAL */}
      <Modal visible={importModal} transparent animationType="fade" onRequestClose={() => setImportModal(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.importDialog}>
            <View style={styles.dialogHeader}>
              <Text style={styles.dialogTitle}>Libreria blocchi</Text>
              <Pressable onPress={() => setImportModal(false)}>
                <Text style={styles.dialogClose}>✕</Text>
              </Pressable>
            </View>
            <ScrollView style={{ maxHeight: 420 }}>
              <Text style={styles.librarySection}>I miei blocchi · {currentSport.label}</Text>
              {libraryBlocks.length === 0 && (
                <Text style={styles.libraryEmpty}>Nessun blocco salvato. Usa ☆ su un blocco per aggiungerlo alla libreria.</Text>
              )}
              {libraryBlocks.map((item) => (
                <View key={item.block_id} style={styles.libraryRow}>
                  <Pressable style={[styles.presetItem, { flex: 1 }]} onPress={() => importPreset({ ...item.block, title: item.block.title || item.title })}>
                    <Text style={styles.presetTitle}>{item.title}</Text>
                    <Text style={styles.presetMeta}>Fase: {item.block.type} · {item.block.repeats || 1}x serie</Text>
                  </Pressable>
                  <Pressable onPress={() => deleteLibraryBlock(item.block_id)} hitSlop={6} style={styles.libraryDelete}>
                    <Text style={{ color: '#dc2626', fontWeight: '700' }}>✕</Text>
                  </Pressable>
                </View>
              ))}
              <Text style={styles.librarySection}>Blocchi predefiniti</Text>
              {BLOCK_PRESETS.map((p, pi) => (
                <Pressable key={pi} style={styles.presetItem} onPress={() => importPreset(p)}>
                  <Text style={styles.presetTitle}>{p.title}</Text>
                  <Text style={styles.presetMeta}>
                    Fase: {p.type} · {p.repeats}x serie
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* SPORT MODAL */}
      <Modal visible={sportModal} transparent animationType="fade" onRequestClose={() => setSportModal(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.importDialog}>
            <View style={styles.dialogHeader}>
              <Text style={styles.dialogTitle}>Seleziona sport</Text>
              <Pressable onPress={() => setSportModal(false)}>
                <Text style={styles.dialogClose}>✕</Text>
              </Pressable>
            </View>
            <View style={styles.sportsGrid}>
              {SPORTS.map((s) => (
                <Pressable
                  key={s.key}
                  style={[styles.sportItemBtn, sport === s.key && { borderColor: s.color, backgroundColor: `${s.color}15` }]}
                  onPress={() => { setSport(s.key); setSportModal(false); }}
                >
                  <Text style={styles.sportItemIcon}>{s.icon}</Text>
                  <Text style={styles.sportItemLabel}>{s.label}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        </View>
      </Modal>

      {/* VIDEO URL MODAL */}
      <Modal visible={videoModal} transparent animationType="fade" onRequestClose={() => setVideoModal(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.calcDialog}>
            <View style={styles.dialogHeader}>
              <Text style={styles.dialogTitle}>Aggiungi URL video</Text>
              <Pressable onPress={() => setVideoModal(false)}>
                <Text style={styles.dialogClose}>✕</Text>
              </Pressable>
            </View>
            <TextInput
              value={videoInput}
              onChangeText={setVideoInput}
              placeholder="URL video"
              style={styles.calcInput}
            />
            <Pressable
              style={styles.dialogOkBtn}
              onPress={() => {
                if (videoInput.trim()) setVideoUrls([...videoUrls, videoInput.trim()]);
                setVideoInput('');
                setVideoModal(false);
              }}
            >
              <Text style={styles.dialogOkBtnText}>Aggiungi</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f2f4f8' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // Top bar
  topBar: {
    height: 52,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e7eaec',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
  },
  backLink: { paddingVertical: 6 },
  backLinkText: { color: '#1ab394', fontWeight: '700', fontSize: 13 },
  saveTopBtn: {
    backgroundColor: '#1ab394',
    paddingHorizontal: spacing.lg,
    paddingVertical: 8,
    borderRadius: 4,
  },
  saveTopBtnText: { color: '#ffffff', fontWeight: '700', fontSize: 13 },

  scrollContent: { padding: spacing.lg, paddingBottom: 60, maxWidth: 1200, width: '100%', alignSelf: 'center' },

  // Header Card
  headerCard: {
    backgroundColor: '#ffffff',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#e7eaec',
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  sportBadge: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sportBadgeIcon: { fontSize: 22 },
  titleInput: {
    flex: 1,
    fontSize: 22,
    fontWeight: '700',
    color: '#2f4050',
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#e7eaec',
  },
  pencilIcon: { fontSize: 16, color: '#aaa', marginLeft: spacing.xs },

  subToolbar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.md,
    paddingTop: spacing.sm,
  },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  switchTrack: {
    width: 34,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#ccc',
    padding: 2,
    justifyContent: 'center',
  },
  switchTrackActive: { backgroundColor: '#1ab394' },
  switchThumb: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#fff',
  },
  switchThumbActive: { transform: [{ translateX: 16 }] },
  switchLabel: { fontSize: 12, color: '#676a6c', fontWeight: '600' },

  starsRow: { flexDirection: 'row', gap: 2 },
  star: { fontSize: 16, color: '#d1d5db' },
  starActive: { color: '#f59e0b' },

  badgeSelector: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    backgroundColor: '#f3f4f6',
    borderRadius: 4,
  },
  badgeSelectorText: { fontSize: 12, fontWeight: '600', color: '#374151' },

  elevRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  elevLabel: { fontSize: 12, fontWeight: '700', color: '#374151' },
  elevInput: {
    borderWidth: 1,
    borderColor: '#e7eaec',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    width: 48,
    fontSize: 12,
    textAlign: 'center',
  },
  elevUnit: { fontSize: 12, color: '#676a6c' },

  calcBtn: {
    borderWidth: 1,
    borderColor: '#1ab394',
    borderRadius: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    backgroundColor: '#f0fdf4',
  },
  calcBtnText: { color: '#1ab394', fontWeight: '700', fontSize: 12 },

  // KPI Card
  kpiCard: {
    backgroundColor: '#ffffff',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#e7eaec',
    flexDirection: 'row',
    paddingVertical: spacing.md,
    marginBottom: spacing.md,
  },
  kpiCol: { flex: 1, alignItems: 'center' },
  kpiDivider: { width: 1, backgroundColor: '#e7eaec', marginVertical: 4 },
  kpiLabel: { fontSize: 11, fontWeight: '700', color: '#888888', letterSpacing: 0.5 },
  kpiValue: { fontSize: 20, fontWeight: '800', color: '#2f4050', marginTop: 2 },

  // Step Bar Chart Card
  chartCard: {
    backgroundColor: '#ffffff',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#e7eaec',
    padding: spacing.md,
    marginBottom: spacing.md,
    minHeight: 110,
    justifyContent: 'flex-end',
  },
  chartBars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 80,
    gap: 2,
  },
  chartBarItem: {
    flex: 1,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  chartBarFill: {
    width: '100%',
    minWidth: 4,
    borderTopLeftRadius: 2,
    borderTopRightRadius: 2,
  },
  chartBarLabel: { fontSize: 8, color: '#888', marginTop: 2 },

  // Blocks
  blocksSection: { marginBottom: spacing.md },
  blockCard: {
    backgroundColor: '#ffffff',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#e7eaec',
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  blockHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: '#f2f4f8',
  },
  dragGrip: { fontSize: 14, color: '#aaa', fontWeight: '800' },
  phasePill: {
    borderRadius: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  phasePillText: { color: '#ffffff', fontWeight: '700', fontSize: 11 },
  blockTitleInput: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: '#2f4050',
    paddingVertical: 2,
  },
  blockSummaryText: { fontSize: 12, fontWeight: '700', color: '#676a6c' },
  headerIconBtn: { padding: 4 },
  headerIcon: { fontSize: 16, color: '#676a6c' },

  // Steps
  stepsContainer: { marginTop: spacing.sm },
  repeatContainer: {
    backgroundColor: '#fbfcfd',
    borderWidth: 1,
    borderColor: '#e7eaec',
    borderLeftWidth: 3,
    borderLeftColor: '#1ab394',
    borderRadius: 4,
    padding: spacing.sm,
  },
  repeatTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  repeatCountBox: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  repeatInput: { width: 48, minHeight: 28, borderRadius: 4, borderColor: '#e7eaec' },
  repeatX: { fontSize: 13, fontWeight: '700', color: '#676a6c' },
  repeatSummaryText: { fontSize: 11, fontWeight: '700', color: '#676a6c' },

  singleRepBox: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  singleRepInput: { width: 46, minHeight: 28, borderRadius: 4, borderColor: '#e7eaec' },

  stepRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: '#f0f2f5',
  },
  stepSubSummary: { width: 110, fontSize: 11, fontWeight: '600', color: '#888' },
  unitBox: {
    position: 'relative',
    borderWidth: 1,
    borderColor: '#e7eaec',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 4,
    backgroundColor: '#fff',
    minWidth: 50,
  },
  unitText: { fontSize: 12, fontWeight: '600', color: '#333' },
  stepValPicker: { width: 84, minHeight: 28, borderRadius: 4, borderColor: '#e7eaec' },
  stepValInput: {
    borderWidth: 1,
    borderColor: '#e7eaec',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    width: 70,
    fontSize: 12,
    fontWeight: '600',
    backgroundColor: '#fff',
  },
  zoneBox: {
    position: 'relative',
    flex: 2,
    minWidth: 170,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: '#e7eaec',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#fff',
  },
  zoneColorDot: { width: 10, height: 10, borderRadius: 2 },
  zoneBoxText: { fontSize: 12, fontWeight: '600', color: '#333', flex: 1 },
  subzoneBox: {
    position: 'relative',
    borderWidth: 1,
    borderColor: '#e7eaec',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 4,
    backgroundColor: '#fff',
    minWidth: 80,
  },
  subzoneText: { fontSize: 11, fontWeight: '600', color: '#666' },


  stepActionBtn: { padding: 4 },
  stepActionIcon: { fontSize: 14, color: '#676a6c' },

  addStepBtn: {
    alignSelf: 'flex-start',
    marginTop: spacing.xs,
    paddingVertical: 4,
    paddingHorizontal: spacing.sm,
  },
  addStepBtnText: { color: '#1ab394', fontWeight: '700', fontSize: 11 },

  blockNotesInput: {
    borderTopWidth: 1,
    borderTopColor: '#f2f4f8',
    paddingTop: spacing.xs,
    marginTop: spacing.xs,
    fontSize: 12,
    color: '#555',
  },

  blocksActionsRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  addBlockBigBtn: {
    backgroundColor: '#1ab394',
    paddingVertical: 10,
    paddingHorizontal: spacing.lg,
    borderRadius: 4,
  },
  addBlockBigText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  importBlockBtn: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e7eaec',
    paddingVertical: 10,
    paddingHorizontal: spacing.lg,
    borderRadius: 4,
  },
  importBlockText: { color: '#2f4050', fontWeight: '700', fontSize: 13 },

  // Bottom Grid
  bottomGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  bottomCard: {
    flex: 1,
    minWidth: 320,
    backgroundColor: '#ffffff',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#e7eaec',
    padding: spacing.md,
  },
  bottomCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  bottomCardTitle: { fontSize: 14, fontWeight: '700', color: '#2f4050' },
  inlineChip: {
    backgroundColor: '#ecfdf5',
    color: '#047857',
    borderRadius: 999,
    fontSize: 10,
    fontWeight: '700',
    paddingHorizontal: 8,
    paddingVertical: 3,
    overflow: 'hidden',
  },
  radioGroup: { flexDirection: 'row', gap: spacing.sm },
  radioItem: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#e7eaec',
  },
  radioItemActive: { backgroundColor: '#1ab394', borderColor: '#1ab394' },
  radioText: { fontSize: 11, fontWeight: '600', color: '#676a6c' },
  radioTextActive: { color: '#ffffff' },

  zoneTable: { marginTop: spacing.xs },
  zoneTableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: '#f2f4f8',
  },
  zoneTableCellLeft: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  zoneSquare: { width: 10, height: 10, borderRadius: 2 },
  zoneTableName: { fontSize: 11, fontWeight: '600', color: '#333' },
  zoneTableValue: { fontSize: 11, fontWeight: '700', color: '#2f4050' },

  notesTextarea: {
    borderWidth: 1,
    borderColor: '#e7eaec',
    borderRadius: 6,
    padding: spacing.sm,
    fontSize: 12,
    color: '#333',
    minHeight: 96,
    textAlignVertical: 'top',
    marginTop: spacing.xs,
    backgroundColor: '#fbfcfd',
  },

  librarySection: { fontSize: 11, fontWeight: '800', color: '#667085', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: spacing.sm, marginBottom: spacing.xs },
  libraryEmpty: { fontSize: 12, color: '#98a2b3', marginBottom: spacing.sm },
  libraryRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  libraryDelete: { padding: spacing.sm },

  videoItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f8fafc',
    padding: 6,
    borderRadius: 4,
    marginTop: 4,
  },
  videoItemText: { fontSize: 11, color: '#1c84c6', flex: 1 },
  addVideoBtn: {
    borderWidth: 1,
    borderColor: '#e7eaec',
    borderRadius: 4,
    paddingVertical: 6,
    alignItems: 'center',
    marginTop: spacing.sm,
    backgroundColor: '#fbfcfd',
  },
  addVideoText: { fontSize: 12, fontWeight: '700', color: '#1ab394' },

  // Modals
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.md,
  },
  calcDialog: {
    backgroundColor: '#ffffff',
    borderRadius: 6,
    padding: spacing.lg,
    width: '100%',
    maxWidth: 380,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 8,
  },
  importDialog: {
    backgroundColor: '#ffffff',
    borderRadius: 6,
    padding: spacing.lg,
    width: '100%',
    maxWidth: 480,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 8,
  },
  dialogHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#e7eaec',
    paddingBottom: spacing.sm,
    marginBottom: spacing.md,
  },
  dialogTitle: { fontSize: 16, fontWeight: '700', color: '#2f4050' },
  dialogClose: { fontSize: 16, color: '#aaa', fontWeight: '800' },
  calcBody: { gap: spacing.xs },
  calcFieldLabel: { fontSize: 12, fontWeight: '700', color: '#676a6c', marginTop: spacing.xs },
  calcInput: {
    borderWidth: 1,
    borderColor: '#e7eaec',
    borderRadius: 4,
    padding: spacing.sm,
    fontSize: 13,
  },
  calcResultBox: {
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#1ab394',
    borderRadius: 4,
    padding: spacing.sm,
    alignItems: 'center',
    marginTop: 4,
  },
  calcResultText: { color: '#1ab394', fontWeight: '800', fontSize: 18 },
  dialogOkBtn: {
    backgroundColor: '#1ab394',
    borderRadius: 4,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  dialogOkBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },

  presetItem: {
    borderBottomWidth: 1,
    borderBottomColor: '#f2f4f8',
    paddingVertical: spacing.sm,
  },
  presetTitle: { fontSize: 13, fontWeight: '700', color: '#2f4050' },
  presetMeta: { fontSize: 11, color: '#888', marginTop: 2 },

  sportsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  sportItemBtn: {
    flex: 1,
    minWidth: 100,
    borderWidth: 1,
    borderColor: '#e7eaec',
    borderRadius: 6,
    padding: spacing.md,
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  sportItemIcon: { fontSize: 28 },
  sportItemLabel: { fontSize: 12, fontWeight: '700', color: '#333', marginTop: 4 },
});
