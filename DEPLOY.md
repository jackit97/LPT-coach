# Deploy - LPT Coach

## 1. Database - Neon Postgres

1. Crea un progetto su https://neon.tech e copia la connection string (`DATABASE_URL`,
   deve includere `sslmode=require`).
2. Esegui lo schema e (opzionale) il seed demo con `psql`. Lo schema crea le tabelle
   dentro `lptapp`, quindi configura anche il Worker con `DB_SCHEMA=lptapp`:

   ```bash
   psql "$DATABASE_URL" -f db/schema.sql
   psql "$DATABASE_URL" -f db/seed.sql   # opzionale, crea coach.demo@lptcoach.local / Demo1234!
   ```

## 2. Backend - Cloudflare Workers

```bash
cd worker
npm install
npx wrangler login
npx wrangler secret put DATABASE_URL   # incolla la connection string Neon
npx wrangler secret put JWT_SECRET     # stringa lunga e casuale
npm run deploy
```

Per riusare lo stesso database/schema del progetto `LPTapp` senza passare da
Render, imposta anche lo schema usato dal vecchio backend:

```toml
# worker/wrangler.toml
[vars]
CORS_ORIGIN = "*"
DB_SCHEMA = "lptapp"
```

In alternativa puoi aggiungere `DB_SCHEMA=lptapp` dalle variabili del Worker
nella dashboard Cloudflare.

In locale puoi ottenere lo stesso effetto creando `worker/.dev.vars` con:

```env
DATABASE_URL=postgresql://...
JWT_SECRET=change_this_secret
DB_SCHEMA=lptapp
```

Poi avvia il backend diretto su Cloudflare Worker con `npm run dev` oppure
pubblicalo con `npm run deploy`.

In alternativa a `DATABASE_URL` puoi impostare singolarmente `PGHOST`, `PGDATABASE`,
`PGUSER`, `PGPASSWORD`, `PGPORT`, `PGSSL` (stessa convenzione del vecchio backend
Express) e il worker costruisce da solo la connection string.

Il worker si avvia comunque anche se il DB non e' ancora configurato (stesso
comportamento tollerante del vecchio `DB_ALLOW_START_WITHOUT_DB`): `GET /health`
risponde sempre, e le rotte che toccano il database restituiscono un 503 chiaro
invece di un errore generico finche' non imposti i secret.

Il worker espone: `POST /auth/login`, `POST /auth/register`, `GET /users/me`,
`GET/POST /users/clients`, `GET/POST /calendar`, `GET/PUT/DELETE /calendar/:id`,
`PUT /calendar/:id/exercises`, `POST /calendar/:id/feedback`.

Dopo il deploy annota l'URL (es. `https://lpt-worker.<subdomain>.workers.dev`).

## 2b. Backend alternativo - Render + Neon

Per far girare la nuova API come il vecchio progetto, carica questa cartella in un repository Git e
collegalo a Render. Il file `render.yaml` alla radice del progetto configura automaticamente il Web
Service con root directory `worker`, comando build `npm ci`, avvio `npm start` e health check
`/health`.

Nella dashboard Render inserisci `DATABASE_URL` come secret con la connection string Neon. `JWT_SECRET`
viene generato automaticamente. Dopo il deploy, copia l'URL del servizio Render, ad esempio
`https://lpt-coach-api.onrender.com`.

Per far puntare il frontend Pages a Render, in Cloudflare Pages aggiungi la variabile di ambiente
`EXPO_PUBLIC_API_BASE` con quell'URL e ridistribuisci `app/dist` dopo aver eseguito:

```bash
cd app
EXPO_PUBLIC_API_BASE=https://lpt-coach-api.onrender.com npm run build:web
npx wrangler pages deploy dist --project-name=lpt-coach
```

## 3. Frontend web - Cloudflare Pages

L'app e' un'unica codebase Expo che esporta anche una versione web statica.

```bash
cd app
npm install
EXPO_PUBLIC_API_BASE=https://lpt-worker.<subdomain>.workers.dev npm run build:web
```

Questo genera `app/dist/` (output statico). Collega la repo a Cloudflare Pages oppure pubblica
manualmente:

```bash
npx wrangler pages deploy dist --project-name=lpt-coach
```

Configura la build di Pages (se colleghi la repo direttamente):
- Build command: `cd app && npm install && npm run build:web`
- Output directory: `app/dist`
- Variabile d'ambiente: `EXPO_PUBLIC_API_BASE=https://lpt-worker.<subdomain>.workers.dev`

## 4. App mobile - iOS (.ipa) e Android (.apk) con EAS

```bash
cd app
npm install -g eas-cli   # se non gia' installato
eas login
eas build:configure      # crea/collega il progetto EAS, aggiorna app.json > extra.eas.projectId
```

### Android APK scaricabile via QR

```bash
eas build --platform android --profile preview
```

Al termine della build, EAS mostra un link (e relativo QR code) alla pagina di download
dell'.apk: basta inquadrare il QR con il telefono Android per installarlo direttamente
(assicurati che "origini sconosciute" sia abilitato).

### iOS .ipa

```bash
eas build --platform ios --profile preview
```

Richiede un account Apple Developer collegato (`eas credentials`) per firmare la build.
Il file .ipa risultante puo' essere:
- installato via TestFlight (`eas submit --platform ios`), oppure
- scaricato/distribuito come build "internal" (ad-hoc) tramite il link/QR fornito da EAS,
  se i device sono registrati nel provisioning profile.

### Variabili d'ambiente per le build EAS

Imposta `EXPO_PUBLIC_API_BASE` come variabile EAS (Project Settings > Environment Variables su
expo.dev) cosi' le build puntano al Worker di produzione.

## 5. Riepilogo variabili

| Dove | Chiave | Valore |
|---|---|---|
| Worker (secret) | `DATABASE_URL` | connection string Neon |
| Worker (secret) | `JWT_SECRET` | stringa casuale lunga |
| Worker (var) | `DB_SCHEMA` | `lptapp` |
| Pages / EAS | `EXPO_PUBLIC_API_BASE` | URL pubblico del Worker |
