// Superserie: gli esercizi da eseguire uno dopo l'altro, senza recupero in mezzo, condividono
// la stessa lettera (A, B, C...). Nell'editor si collega un esercizio al successivo.

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

const letterOf = (exercise) => (exercise?.superserie ? String(exercise.superserie).trim().toUpperCase() : '');

// true se l'esercizio i e' collegato al successivo
export function linkedToNext(list, index) {
  const current = letterOf(list[index]);
  return !!current && current === letterOf(list[index + 1]);
}

// riassegna le lettere in ordine (A, B, ...) e toglie i gruppi rimasti con un solo esercizio
function assign(list, links) {
  const out = list.map((exercise) => ({ ...exercise, superserie: null }));
  let group = 0;
  let i = 0;
  while (i < out.length) {
    let end = i;
    while (end < out.length - 1 && links[end]) end += 1;
    if (end > i) {
      const letter = LETTERS[group % LETTERS.length];
      for (let k = i; k <= end; k += 1) out[k].superserie = letter;
      group += 1;
    }
    i = end + 1;
  }
  return out;
}

export function normalizeSupersets(list = []) {
  return assign(list, list.map((_, index) => linkedToNext(list, index)));
}

export function toggleSupersetLink(list = [], index) {
  const links = list.map((_, i) => linkedToNext(list, i));
  links[index] = !links[index];
  return assign(list, links);
}

// Per la visualizzazione: lettera del gruppo e posizione nel gruppo ("A1", "A2"...)
export function supersetInfo(list = []) {
  const counters = {};
  return list.map((exercise, index) => {
    const letter = letterOf(exercise);
    const grouped = letter && (linkedToNext(list, index) || (index > 0 && linkedToNext(list, index - 1)));
    if (!grouped) return null;
    counters[letter] = (counters[letter] || 0) + 1;
    return {
      letter,
      label: `${letter}${counters[letter]}`,
      first: !(index > 0 && linkedToNext(list, index - 1)),
      last: !linkedToNext(list, index),
    };
  });
}

export const SUPERSET_COLOR = '#8e44ad';
