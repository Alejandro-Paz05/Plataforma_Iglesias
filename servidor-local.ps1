# =====================================================================
# Servidor web local para probar la aplicación en este equipo.
# Uso (PowerShell):  powershell -ExecutionPolicy Bypass -File .\servidor-local.ps1
# Luego abra:        http://localhost:8080
# Para detenerlo:    Ctrl + C
# (En producción publique la carpeta en un hosting con HTTPS; ver README.)
# =====================================================================
param([int]$Puerto = 8080)

$raiz = Split-Path -Parent $MyInvocation.MyCommand.Path
$tipos = @{
  '.html' = 'text/html; charset=utf-8'; '.js' = 'text/javascript; charset=utf-8'; '.css' = 'text/css; charset=utf-8'
  '.svg' = 'image/svg+xml'; '.png' = 'image/png'; '.jpg' = 'image/jpeg'; '.jpeg' = 'image/jpeg'; '.webp' = 'image/webp'
  '.json' = 'application/json'; '.ico' = 'image/x-icon'; '.pdf' = 'application/pdf'; '.txt' = 'text/plain; charset=utf-8'
}

$servidor = New-Object System.Net.HttpListener
$servidor.Prefixes.Add("http://localhost:$Puerto/")
$servidor.Start()
Write-Host "Servidor iniciado en http://localhost:$Puerto  (Ctrl + C para detener)"

try {
  while ($servidor.IsListening) {
    $ctx = $servidor.GetContext()
    $ruta = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath.TrimStart('/'))
    if ([string]::IsNullOrEmpty($ruta)) { $ruta = 'index.html' }
    $archivo = [IO.Path]::GetFullPath((Join-Path $raiz $ruta))
    $respuesta = $ctx.Response
    try {
      if ($archivo.StartsWith($raiz, [StringComparison]::OrdinalIgnoreCase) -and (Test-Path $archivo -PathType Leaf)) {
        $bytes = [IO.File]::ReadAllBytes($archivo)
        $ext = [IO.Path]::GetExtension($archivo).ToLower()
        $respuesta.ContentType = if ($tipos.ContainsKey($ext)) { $tipos[$ext] } else { 'application/octet-stream' }
        $respuesta.Headers.Add('Cache-Control', 'no-store')
        $respuesta.Headers.Add('X-Content-Type-Options', 'nosniff')
        $respuesta.OutputStream.Write($bytes, 0, $bytes.Length)
      } else {
        $respuesta.StatusCode = 404
      }
    } finally {
      $respuesta.Close()
    }
  }
} finally {
  $servidor.Stop()
}
