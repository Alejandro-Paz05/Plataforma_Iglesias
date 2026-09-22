# =====================================================================
# Respaldo técnico de la base de datos (pg_dump)
#
# Requisitos:
#   • Herramientas cliente de PostgreSQL (pg_dump) en el PATH, con versión
#     igual o superior a la del servidor de Supabase.
#   • Variable de entorno SUPABASE_DB_URL con la cadena de conexión
#     (Supabase → Connect → "Session pooler"). NUNCA la guarde en archivos
#     del proyecto. Ejemplo para la sesión actual:
#       $env:SUPABASE_DB_URL = 'postgresql://postgres.xxxx:CLAVE@aws-0-us-east-1.pooler.supabase.com:5432/postgres'
#
# Uso:
#   powershell -ExecutionPolicy Bypass -File .\scripts\respaldo-bd.ps1 [-Destino D:\RespaldosCEE]
#
# Genera:
#   cee-AAAAMMDD-HHmm-public.dump      esquema + datos de la aplicación (formato custom)
#   cee-AAAAMMDD-HHmm-auth-usuarios.sql usuarios de Supabase Auth (solo datos)
#   *.sha256                            huellas para verificar integridad
# Consulte docs/RESPALDOS.md para la restauración.
# =====================================================================
param(
  [string]$Destino = (Join-Path (Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)) 'respaldos')
)

$ErrorActionPreference = 'Stop'

if (-not $env:SUPABASE_DB_URL) {
  Write-Error 'Defina la variable de entorno SUPABASE_DB_URL con la cadena de conexión de Supabase.'
  exit 1
}
if (-not (Get-Command pg_dump -ErrorAction SilentlyContinue)) {
  Write-Error 'No se encontró pg_dump. Instale las herramientas cliente de PostgreSQL y agréguelas al PATH.'
  exit 1
}

New-Item -ItemType Directory -Force $Destino | Out-Null
$marca = Get-Date -Format 'yyyyMMdd-HHmm'
$publico = Join-Path $Destino "cee-$marca-public.dump"
$usuarios = Join-Path $Destino "cee-$marca-auth-usuarios.sql"

Write-Host 'Respaldando esquema public (estructura + datos)...'
& pg_dump "--dbname=$env:SUPABASE_DB_URL" --format=custom --no-owner --no-privileges --schema=public "--file=$publico"
if ($LASTEXITCODE -ne 0) { Write-Error 'pg_dump falló al respaldar el esquema public.'; exit 1 }

Write-Host 'Respaldando usuarios de Supabase Auth (solo datos)...'
& pg_dump "--dbname=$env:SUPABASE_DB_URL" --data-only --column-inserts --table=auth.users --table=auth.identities "--file=$usuarios"
if ($LASTEXITCODE -ne 0) { Write-Error 'pg_dump falló al respaldar los usuarios.'; exit 1 }

foreach ($archivo in @($publico, $usuarios)) {
  $hash = (Get-FileHash $archivo -Algorithm SHA256).Hash.ToLower()
  "$hash  $(Split-Path -Leaf $archivo)" | Out-File -Encoding ascii "$archivo.sha256"
}

Write-Host ''
Write-Host "Respaldo completado en: $Destino"
Write-Host 'IMPORTANTE: estos archivos contienen información personal y financiera.'
Write-Host 'Guárdelos cifrados y en al menos dos ubicaciones distintas (ver docs/RESPALDOS.md).'
