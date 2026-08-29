# LPT Coach

Redesign completo (estetico e funzionale) dell'app LPT: calendario allenamenti in stile
TrainingPeaks, condiviso da coach e atleta. Stesso nome tabelle/funzionalita del DB originale.

## Struttura

```
db/         schema.sql (Neon Postgres) + seed.sql demo
worker/     backend Cloudflare Worker (Hono + @neondatabase/serverless)
app/        app Expo (React Native + Web) - calendario, dettaglio workout, feedback
```

## Flusso calendario (nucleo della redesign)

- Ogni workout e' una riga in `calendar_workouts` (una data precisa, un atleta).
- Il coach crea/modifica un workout dal calendario (tap su un giorno vuoto = crea, tap su un
  workout esistente = apre il dettaglio con pulsante "Modifica").
- Gli esercizi di forza vivono in `calendar_workout_exercises` (editabili dal coach).
- L'atleta, dal dettaglio del workout, lascia un feedback (`workout_feedback`): completato/saltato,
  RPE, sensazione, durata effettiva, note. Lo stato del workout si aggiorna automaticamente.
- Tabelle legacy (diete, pagamenti, endurance avanzato, video, schede/esercizi "classici") sono
  presenti nello schema e ora hanno anche le proprie schermate/API, con lo stesso pattern
  atleta-selezionato-dal-coach usato dal calendario:
  - **Diete**: lista, dettaglio con pasti, editor coach.
  - **Pagamenti**: lista con stato (pagato/in sospeso), creazione e marcatura "pagato" dal coach.
  - **Endurance**: piani + sessioni (coach), check-in di sessione (atleta).
  - **Video tutorial**: libreria condivisa, il coach aggiunge link (YouTube/Vimeo/CDN), tutti la
    possono consultare.

Navigazione: dopo il login l'app mostra una tab bar (Calendario, Diete, Pagamenti, Endurance,
Video, Atleti per il coach). Il coach sceglie l'atleta attivo da un selettore orizzontale in cima
a ogni tab (o dalla tab "Atleti"); la scelta resta condivisa tra tutte le sezioni.

Vedi [DEPLOY.md](DEPLOY.md) per il deploy completo (Cloudflare Workers+Pages, Neon, build iOS/Android).
