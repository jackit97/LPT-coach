# LPT Coach

Applicazione per la gestione del rapporto tra personal trainer e atleti. Include calendario,
workout, pesistica, endurance, diete, pagamenti, video tutorial e zone di allenamento.
La codebase e' condivisa tra web, Android e iOS.

## Linguaggi e tecnologie

| Area | Linguaggio / formato | Uso |
|---|---|---|
| Frontend | JavaScript moderno (ES modules, JSX) | Componenti React e logica delle schermate |
| Frontend | JSX | Descrizione della UI React Native |
| Backend | JavaScript moderno (ES modules) | API Hono eseguite su Cloudflare Workers |
| Database | SQL PostgreSQL | Schema, seed, indici, relazioni e migrazioni |
| Configurazione | JSON, YAML, TOML, PowerShell | Expo, package, Render, Wrangler e script Windows |
| Markup web | HTML/CSS generati da Expo Web | Output statico pubblicato su Cloudflare Pages |

Il frontend usa Expo 54, React 19, React Native 0.81 e React Navigation 7. Il backend usa
Cloudflare Workers, Hono, JWT HS256 e `@neondatabase/serverless`; PostgreSQL viene fornito da
Neon. Axios gestisce le chiamate HTTP e AsyncStorage conserva token e utente sul dispositivo.

## Struttura del repository

```text
app/       Frontend Expo per Android, iOS e web
  App.js   Provider, autenticazione e navigazione principale
  api/     Client Axios e configurazione API
  context/ Stato autenticazione e atleta selezionato
  components/ Componenti riutilizzabili
  screens/ Schermate e editor dei moduli
worker/    Backend Cloudflare Worker
  src/index.js  App Hono, CORS e registrazione delle route
  src/auth.js   JWT e controlli ruolo
  src/db.js     Connessione PostgreSQL e schema dinamico
  src/utils.js  Controlli coach-atleta
  src/routes/   Endpoint organizzati per dominio
db/        schema.sql, seed.sql e migrazioni
scripts/   Utility per deploy, dati e verifiche
DEPLOY.md  Procedure di pubblicazione
```

## Architettura

`app/App.js` monta `AuthProvider`, `NavigationContainer`, `RootNavigator` e, dopo il login,
`AthleteProvider` e la tab bar principale. Ogni tab contiene uno stack per lista, dettaglio ed
editor. Il coach seleziona un atleta in `AthleteContext`; l'atleta usa sempre il proprio id.

Il Worker monta le route in `worker/src/index.js`, abilita CORS e restituisce `503` se il database
non e' configurato. Le query sono parametrizzate e lo schema PostgreSQL prevede foreign key,
cancellazioni a cascata e indici sulle ricerche principali.

## Funzionalita

- **Calendario**: ogni riga di `calendar_workouts` rappresenta un workout per atleta e data.
  Gli esercizi sono in `calendar_workout_exercises`; il feedback atleta e' in
  `workout_feedback` e contiene completamento, RPE, sensazione, durata e note.
- **Pesistica**: schede legacy, esercizi, schede calendario e template del coach.
- **Diete**: diete, pasti e ricerca di alimenti.
- **Pagamenti**: importo, scadenza, causale e stato.
- **Endurance**: piani, sessioni, check-in, metriche, obiettivi e template.
- **Zone**: test atleta, risultati e zone di allenamento calcolate.
- **Video**: libreria di link tutorial condivisi.
- **Garmin FIT**: download di workout endurance in formato `.fit` tramite FitWriter.

Il modulo endurance puo' essere disabilitato dal profilo coach. Il flag `utenti.endurance_enabled`
diventa `endurance_visible` nell'API e nasconde le tab e le azioni endurance al coach e agli atleti
collegati.

## Database

[db/schema.sql](db/schema.sql) crea lo schema PostgreSQL `lptapp` ed e' idempotente. Le aree
principali sono `utenti`, `profiloutente`, `pt_clienti`, calendario, schede, diete, pagamenti,
video, endurance, test e zone. Le migrazioni disponibili sono:

- `20260904_duration_seconds.sql`: aggiunge le durate in secondi.
- `20260910_endurance_toggle.sql`: aggiunge il flag endurance per utente.

Inizializzazione:

```bash
psql "$DATABASE_URL" -f db/schema.sql
psql "$DATABASE_URL" -f db/seed.sql
```

Il seed e' opzionale e crea dati demo. Le credenziali demo non vanno usate in produzione.

## API

Le API sono REST e usano `Authorization: Bearer <jwt>` sulle route protette.

| Prefisso | Funzioni |
|---|---|
| `/auth` | login, registrazione, logout |
| `/users` | profilo, clienti, impostazioni endurance |
| `/calendar` | CRUD workout, esercizi, feedback, schede forza |
| `/diets` | CRUD diete, pasti e ricerca alimenti |
| `/payments` | CRUD pagamenti |
| `/endurance` | piani, sessioni, check-in, template e FIT |
| `/videos` | lista, creazione, eliminazione video |
| `/exercises` | lista e creazione esercizi |
| `/workouts` | template e assegnazione schede |
| `/zones` | test, risultati e zone |
| `/pt` | statistiche coach |
| `/health` | stato Worker e `dbConfigured`, senza auth |

I dettagli dei payload sono nei file corrispondenti di `worker/src/routes/`.

## Autenticazione e ruoli

I ruoli sono `cliente` e `personal_trainer`. Il JWT HS256 dura 7 giorni, viene salvato in
AsyncStorage e aggiunto automaticamente dal client Axios. `authenticate()` restituisce `401` per
token assente/non valido; `roleCheck()` restituisce `403` per operazioni riservate al coach.

Ogni accesso a un atleta viene verificato dal backend tramite `pt_clienti`; la selezione nel
frontend non e' una misura di sicurezza. Password, JWT secret e connection string non devono essere
committati.

## Configurazione locale

```bash
cd worker
npm install
cd ../app
npm install
```

Creare `worker/.dev.vars`:

```env
DATABASE_URL=postgresql://utente:password@host/database?sslmode=require
JWT_SECRET=stringa-lunga-e-casuale
DB_SCHEMA=lptapp
CORS_ORIGIN=http://localhost:8081
```

Il frontend usa l'URL in `app/config.js`, sovrascrivibile con `EXPO_PUBLIC_API_BASE`.

## Comandi

Da `app/`:

```bash
npm run start
npm run start:web
npm run build:web
npm run build:android:preview
npm run build:android:apk
npm run build:ios:preview
npm run build:ios:release
```

Da `worker/`:

```bash
npm run dev
npm run start
npm run deploy
npm run tail
```

Non sono presenti script npm per test, lint o typecheck: prima del deploy verificare almeno
`/health`, login, selezione atleta, CRUD calendario e il modulo modificato.

## Deploy

Il flusso principale usa Neon, Cloudflare Workers e Cloudflare Pages:

1. Applicare schema, seed opzionale e migrazioni su Neon.
2. Configurare `DATABASE_URL`, `JWT_SECRET`, `DB_SCHEMA` e `CORS_ORIGIN` nel Worker.
3. Eseguire `npm run deploy` da `worker/`.
4. Eseguire `npm run build:web` da `app/` con `EXPO_PUBLIC_API_BASE` e pubblicare `dist` su Pages.
5. Usare EAS per le build Android/iOS configurate in `app/app.json`.

Per la procedura completa e l'alternativa Render vedere [DEPLOY.md](DEPLOY.md). Il file
`render.yaml` configura il backend Render con root directory `worker`.

## Convenzioni

- Le modifiche database partono da `db/schema.sql` e hanno una migration successiva.
- Le nuove API vanno nella route di dominio e vanno registrate in `worker/src/index.js`.
- Le route protette devono usare autenticazione, ruolo e controlli ownership appropriati.
- Il frontend usa `app/api/client.js` per mantenere uniforme l'invio del token.
- Le schermate coach rispettano l'atleta scelto da `AthleteContext`.
- Restano compatibili i nomi delle tabelle del progetto LPT originale.
- In produzione restringere `CORS_ORIGIN`: il default Wrangler e' `*`.
