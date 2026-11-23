# Integrazione Garmin Connect (Developer Program)

## Cosa fa
- **Attività svolte → LPT** (Activity API, push): quando l'atleta sincronizza l'orologio, Garmin invia l'attività al worker
  (`/garmin/push/...`); l'allenamento compare da solo nel calendario come completato, con grafici, giri e serie di forza.
  Doppioni con import da file/Strava vengono riconosciuti.
- **Allenamenti LPT → Garmin** (Training API V2): gli allenamenti pianificati da oggi a +7 giorni (endurance: corsa, bici,
  nuoto con step, ripetute e zone; forza/funzionale: esercizi con serie, ripetizioni, carico e recupero) vengono creati e
  pianificati nel calendario Garmin. Un cron ogni 15 minuti li tiene allineati (modifiche del coach, eliminazioni, spostamenti).
  L'atleta può anche inviare subito dalla scheda Profilo o dal dettaglio del workout.
- Restano import manuale (.fit/.tcx/.gpx) ed export .FIT.

## Configurazione
1. Secret del worker: `npx wrangler secret put GARMIN_CLIENT_ID` e `npx wrangler secret put GARMIN_CLIENT_SECRET`.
2. Migrazione: `db/migrations/20261127_garmin.sql` (già inclusa in `db/schema.sql`).
3. Portale Garmin → API Tools → Endpoint Configuration (https://apis.garmin.com/tools/endpoints), modalità **Push**:
   - Activity Files → `https://lpt-worker.gc-jack1997.workers.dev/garmin/push/activity-files`
   - Activities → `https://lpt-worker.gc-jack1997.workers.dev/garmin/push/activities`
   - Manually Updated Activities → `https://lpt-worker.gc-jack1997.workers.dev/garmin/push/manually-updated-activities`
   - Activity Details (facoltativo) → `https://lpt-worker.gc-jack1997.workers.dev/garmin/push/activity-details`
   - Deregistrations → `https://lpt-worker.gc-jack1997.workers.dev/garmin/push/deregistrations`
   - User Permissions Change → `https://lpt-worker.gc-jack1997.workers.dev/garmin/push/permissions`
4. Redirect URL dell'app Garmin: `https://lpt-worker.gc-jack1997.workers.dev/garmin/callback`.

## Collegamento atleta
Profilo → Connessioni → Garmin Connect → «Connetti con Garmin» → login Garmin, consenso (condivisione attività +
importazione allenamenti) → ritorno in LPT Coach. Sull'orologio gli allenamenti arrivano dopo la sincronizzazione
con l'app Garmin Connect.
