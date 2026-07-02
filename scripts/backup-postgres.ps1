# PostgreSQL backup for Windows (Laragon / local dev)
$ErrorActionPreference = "Stop"

$RootDir = Split-Path $PSScriptRoot -Parent
$BackupDir = if ($env:BACKUP_DIR) { $env:BACKUP_DIR } else { Join-Path $RootDir "backups" }
$RetentionDays = if ($env:BACKUP_RETENTION_DAYS) { [int]$env:BACKUP_RETENTION_DAYS } else { 7 }
$Timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$Filename = "marketingspa_${Timestamp}.sql"
$OutFile = Join-Path $BackupDir $Filename

New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null

if (-not (Get-Command pg_dump -ErrorAction SilentlyContinue)) {
  Write-Error "[backup] pg_dump not found in PATH. Add PostgreSQL bin to PATH."
}

Write-Host "[backup] Starting PostgreSQL backup: $Filename"

if ($env:DATABASE_URL) {
  pg_dump $env:DATABASE_URL | Set-Content -Path $OutFile -Encoding UTF8
} else {
  $env:PGPASSWORD = $env:POSTGRES_PASSWORD
  $pgHost = if ($env:POSTGRES_HOST) { $env:POSTGRES_HOST } else { "localhost" }
  $pgPort = if ($env:POSTGRES_PORT) { $env:POSTGRES_PORT } else { "5432" }
  $pgUser = if ($env:POSTGRES_USER) { $env:POSTGRES_USER } else { "marketingspa" }
  $pgDb = if ($env:POSTGRES_DB) { $env:POSTGRES_DB } else { "marketingspa" }
  pg_dump -h $pgHost -p $pgPort -U $pgUser -d $pgDb | Set-Content -Path $OutFile -Encoding UTF8
}

Write-Host "[backup] Saved to $OutFile"

Get-ChildItem $BackupDir -Filter "marketingspa_*.sql*" |
  Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-$RetentionDays) } |
  Remove-Item -Force

Write-Host "[backup] Cleanup done (retention: $RetentionDays days)"
