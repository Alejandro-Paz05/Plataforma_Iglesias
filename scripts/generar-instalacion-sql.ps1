# Genera supabase/instalacion_completa.sql uniendo las migraciones en orden.
# Uso: powershell -ExecutionPolicy Bypass -File .\scripts\generar-instalacion-sql.ps1
$raiz = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$destino = Join-Path $raiz 'supabase\instalacion_completa.sql'
$partes = @(
  '-- =====================================================================',
  '-- INSTALACIÓN COMPLETA · Sistema de Administración de Aportaciones',
  '-- Centro Evangelístico Ebenezer — "Tocando a las Naciones"',
  '--',
  '-- ARCHIVO GENERADO a partir de supabase/migrations (no editar a mano).',
  '-- Pegue todo el contenido en Supabase → SQL Editor → Run, UNA sola vez,',
  '-- en un proyecto nuevo. Después ejecute supabase/pruebas/verificacion_fase1.sql',
  '-- =====================================================================',
  ''
)
Get-ChildItem (Join-Path $raiz 'supabase\migrations\*.sql') | Sort-Object Name | ForEach-Object {
  $partes += ''
  $partes += "-- >>>>> $($_.Name)"
  $partes += [IO.File]::ReadAllText($_.FullName, [Text.Encoding]::UTF8)
}
[IO.File]::WriteAllText($destino, ($partes -join "`n"), (New-Object System.Text.UTF8Encoding($false)))
Write-Host "Generado: $destino"
