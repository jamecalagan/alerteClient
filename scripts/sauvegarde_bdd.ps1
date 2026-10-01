# Sauvegarde de la base Supabase d'AlerteClient (schéma public : tables + données).
#
# Utilisation (PowerShell) :
#   powershell -ExecutionPolicy Bypass -File scripts\sauvegarde_bdd.ps1
#
# La chaîne de connexion (avec le mot de passe) est demandée de façon masquée
# et n'est jamais enregistrée. Elle se trouve dans le tableau de bord Supabase :
#   bouton "Connect" > onglet "Connection string" > "Session pooler" (URI)
#   en remplaçant [YOUR-PASSWORD] par le mot de passe de la base.
#
# Les sauvegardes sont écrites HORS du dossier du projet (elles contiennent les
# données clients et ne doivent jamais partir sur GitHub) :
#   Documents\Sauvegardes_AlerteClient\
#
# Note : les fichiers des buckets Storage (photos, vidéos) ne sont PAS dans la
# base et ne sont donc pas inclus dans cette sauvegarde.

$ErrorActionPreference = "Stop"

$pgDump = "C:\Program Files\PostgreSQL\17\bin\pg_dump.exe"
if (-not (Test-Path $pgDump)) {
    Write-Host "pg_dump introuvable : $pgDump" -ForegroundColor Red
    exit 1
}

$secure = Read-Host "Colle la chaine de connexion Supabase (Session pooler)" -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
$uri = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)

if ([string]::IsNullOrWhiteSpace($uri) -or $uri -notmatch "^postgres(ql)?://") {
    Write-Host "Chaine de connexion invalide (elle doit commencer par postgresql://)." -ForegroundColor Red
    exit 1
}
if ($uri -match "\[YOUR-PASSWORD\]") {
    Write-Host "Remplace [YOUR-PASSWORD] par le vrai mot de passe de la base." -ForegroundColor Red
    exit 1
}

$destDir = Join-Path ([Environment]::GetFolderPath("MyDocuments")) "Sauvegardes_AlerteClient"
New-Item -ItemType Directory -Force -Path $destDir | Out-Null

$stamp = Get-Date -Format "yyyy-MM-dd_HH-mm"
$dumpFile = Join-Path $destDir "alerteclient_$stamp.dump"
$sqlFile = Join-Path $destDir "alerteclient_$stamp.sql"

Write-Host "Sauvegarde en cours (format restaurable)..."
& $pgDump --dbname=$uri --schema=public --no-owner --no-privileges --format=custom --file=$dumpFile
if ($LASTEXITCODE -ne 0) {
    Write-Host "Echec de pg_dump (code $LASTEXITCODE)." -ForegroundColor Red
    $uri = $null
    exit $LASTEXITCODE
}

Write-Host "Copie lisible en SQL..."
& $pgDump --dbname=$uri --schema=public --no-owner --no-privileges --format=plain --file=$sqlFile
$uri = $null

if ($LASTEXITCODE -ne 0) {
    Write-Host "La sauvegarde .dump est faite, mais la copie .sql a echoue." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Sauvegarde terminee :" -ForegroundColor Green
Get-ChildItem $destDir -Filter "alerteclient_$stamp.*" | ForEach-Object {
    "{0}  ({1:N1} Mo)" -f $_.FullName, ($_.Length / 1MB)
}
