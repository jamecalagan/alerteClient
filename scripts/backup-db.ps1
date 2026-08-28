# Sauvegarde complete de la base Supabase (structure + donnees) via pg_dump.
#
# Pre-requis :
#   1. pg_dump doit etre installe (deja le cas ici : PostgreSQL 17 detecte).
#   2. Definir la variable d'environnement SUPABASE_DB_URL avec la chaine de
#      connexion Postgres du projet (PAS l'URL/clé anon de supabaseClient.js,
#      qui ne permet pas pg_dump).
#
# Ou trouver la chaine de connexion :
#   Dashboard Supabase -> Project Settings -> Database -> Connection string
#   -> onglet "URI". Prendre de preference la connexion "Session pooler"
#   (port 5432) si la connexion directe (IPv6) ne passe pas depuis ce PC.
#   Remplacer [YOUR-PASSWORD] par le mot de passe de la base (pas votre
#   mot de passe de compte Supabase).
#
# Utilisation (PowerShell) :
#   $env:SUPABASE_DB_URL = "postgresql://postgres.xxxx:MOTDEPASSE@aws-0-eu-west-3.pooler.supabase.com:5432/postgres"
#   .\scripts\backup-db.ps1
#
# Chaque execution cree un fichier .sql horodate dans le dossier backups/
# (ignore par git - ne pas commiter de sauvegarde contenant des donnees clients).

param(
    [string]$OutDir = (Join-Path $PSScriptRoot "..\backups")
)

if (-not $env:SUPABASE_DB_URL) {
    Write-Error "Variable SUPABASE_DB_URL non definie. Voir les commentaires en tete de ce script."
    exit 1
}

if (-not (Test-Path $OutDir)) {
    New-Item -ItemType Directory -Path $OutDir | Out-Null
}

$timestamp = Get-Date -Format "yyyy-MM-dd_HHmmss"
$outFile = Join-Path $OutDir "alerteclient_backup_$timestamp.sql"

Write-Host "Sauvegarde en cours vers $outFile ..."

& pg_dump $env:SUPABASE_DB_URL --no-owner --no-privileges --format=plain -f $outFile

if ($LASTEXITCODE -eq 0) {
    Write-Host "Sauvegarde terminee avec succes : $outFile"
} else {
    Write-Error "Echec de pg_dump (code de sortie $LASTEXITCODE)"
    exit $LASTEXITCODE
}
