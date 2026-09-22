# Copia solo los archivos necesarios para producción a la carpeta "publicar"
# (excluye pruebas, scripts, SQL y documentación).
# Uso: powershell -ExecutionPolicy Bypass -File .\scripts\preparar-publicacion.ps1
$raiz = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$destino = Join-Path $raiz 'publicar'

if (Test-Path $destino) { Remove-Item -Recurse -Force $destino }
New-Item -ItemType Directory -Force $destino | Out-Null

foreach ($elemento in @('index.html', '_headers', 'assets', 'css', 'js', 'vendor')) {
  Copy-Item -Recurse -Force (Join-Path $raiz $elemento) $destino
}

$config = [IO.File]::ReadAllText((Join-Path $destino 'js\config.js'))
if ($config -match 'SU-PROYECTO|SU-CLAVE') {
  Write-Warning 'js/config.js todavía tiene los valores de ejemplo. Configure SUPABASE_URL y SUPABASE_ANON_KEY antes de publicar.'
}
$clave = ([regex]::Match($config, "SUPABASE_ANON_KEY:\s*'([^']*)'")).Groups[1].Value
$secreta = $clave.StartsWith('sb_secret_')
$partes = $clave.Split('.')
if ($partes.Count -eq 3) {
  try {
    $b64 = $partes[1].Replace('-', '+').Replace('_', '/')
    $b64 = $b64.PadRight($b64.Length + (4 - $b64.Length % 4) % 4, '=')
    $carga = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($b64))
    if ($carga -match '"role"\s*:\s*"service_role"') { $secreta = $true }
  } catch { }
}
if ($secreta) {
  Write-Warning 'js/config.js contiene una clave SECRETA (service_role). NO publique: use la clave pública anon/publishable y rote la clave secreta.'
}
Write-Host "Carpeta lista para publicar: $destino"
