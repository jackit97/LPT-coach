// Nome e cognome sono colonne separate (utenti.nome / utenti.cognome)
export const fullName = (person, fallback = 'Atleta') => [person?.nome, person?.cognome].map((part) => String(part || '').trim()).filter(Boolean).join(' ') || fallback;
export const firstName = (person) => String(person?.nome || '').trim().split(/\s+/)[0] || '';
export const initials = (name) => String(name || '').trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0].toUpperCase()).join('') || '?';
