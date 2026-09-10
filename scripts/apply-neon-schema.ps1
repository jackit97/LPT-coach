$ErrorActionPreference = 'Stop'

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$schemaPath = Join-Path $repoRoot 'db\schema.sql'
$workerDir = Join-Path $repoRoot 'worker'
$legacyBackendDir = 'C:\Users\Giacomo\LPTapp\backend'

if (-not (Test-Path (Join-Path $legacyBackendDir 'node_modules\pg'))) {
  throw "Pacchetto pg non trovato in $legacyBackendDir. Esegui prima npm install in quella cartella."
}

$bstr = [IntPtr]::Zero

try {
  if ($env:DATABASE_URL) {
    $databaseUrl = $env:DATABASE_URL.Trim()
  } else {
    $secureUrl = Read-Host 'Incolla DATABASE_URL Neon' -AsSecureString
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureUrl)
    $databaseUrl = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr).Trim()
  }
  $databaseUrl = $databaseUrl.Trim('"', "'")
  $databaseUri = [Uri]$databaseUrl
  if ($databaseUri.Scheme -notin @('postgresql', 'postgres')) {
    throw 'DATABASE_URL non valida: deve iniziare con postgresql:// oppure postgres://.'
  }
  if (-not $databaseUri.Host) {
    throw 'DATABASE_URL non valida: host Neon mancante.'
  }
  Write-Host "Connessione Neon rilevata per host: $($databaseUri.Host)"
  $env:DATABASE_URL = $databaseUrl

  $nodeScript = @'
const fs = require('fs');
const { Pool } = require('pg');

const schema = fs.readFileSync(process.env.LPT_COACH_SCHEMA_PATH, 'utf8');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

(async () => {
  await pool.query(schema);
  const check = await pool.query(`
    select
      to_regclass('lptapp.utenti')::text as utenti,
      to_regclass('lptapp.calendar_workouts')::text as calendar_workouts,
      to_regclass('lptapp.training_zone_sets')::text as training_zone_sets
  `);
  console.log(JSON.stringify(check.rows[0], null, 2));
  await pool.end();
})().catch(async (err) => {
  console.error(err.message || err);
  await pool.end().catch(() => {});
  process.exit(1);
});
'@

  $env:LPT_COACH_SCHEMA_PATH = $schemaPath
  Push-Location $legacyBackendDir
  try {
    node -e $nodeScript
    if ($LASTEXITCODE -ne 0) { throw 'Applicazione schema fallita.' }
  } finally {
    Pop-Location
    Remove-Item Env:LPT_COACH_SCHEMA_PATH -ErrorAction SilentlyContinue
  }

  Push-Location $workerDir
  try {
    $databaseUrl | npx wrangler secret put DATABASE_URL
    if ($LASTEXITCODE -ne 0) { throw 'Configurazione DATABASE_URL su Wrangler fallita.' }

    $jwtBytes = New-Object byte[] 32
    $rng = New-Object Security.Cryptography.RNGCryptoServiceProvider
    try {
      $rng.GetBytes($jwtBytes)
    } finally {
      $rng.Dispose()
    }
    $jwtSecret = [Convert]::ToBase64String($jwtBytes)
    $jwtSecret | npx wrangler secret put JWT_SECRET
    if ($LASTEXITCODE -ne 0) { throw 'Configurazione JWT_SECRET su Wrangler fallita.' }
  } finally {
    Pop-Location
  }

  Write-Host 'Schema Neon applicato e secret Worker configurati.'
} finally {
  if ($bstr -ne [IntPtr]::Zero) {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  }
  Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
}