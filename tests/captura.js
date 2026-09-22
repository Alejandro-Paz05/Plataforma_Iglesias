// Captura de errores para pruebas automatizadas (no se usa en producción).
(function () {
  window.__errores = [];
  function pintar() {
    var d = document.getElementById('errores-prueba');
    if (!d) {
      d = document.createElement('pre');
      d.id = 'errores-prueba';
      d.style.cssText = 'position:fixed;left:0;right:0;bottom:0;max-height:40vh;overflow:auto;background:#fee;color:#900;' +
        'font:12px monospace;z-index:9999;margin:0;padding:8px;border-top:2px solid #900;white-space:pre-wrap';
      (document.body || document.documentElement).appendChild(d);
    }
    d.textContent = 'ERRORES (' + window.__errores.length + '):\n' + window.__errores.join('\n');
  }
  function registrar(m) { window.__errores.push(m); pintar(); }
  window.addEventListener('error', function (e) {
    registrar('ERROR: ' + e.message + ' @ ' + (e.filename || '') + ':' + (e.lineno || ''));
  });
  window.addEventListener('unhandledrejection', function (e) {
    var r = e.reason;
    registrar('PROMESA: ' + (r && (r.stack || r.message) || r));
  });
  document.addEventListener('securitypolicyviolation', function (e) {
    registrar('CSP: ' + e.violatedDirective + ' bloqueó ' + e.blockedURI);
  });
  var original = console.error;
  console.error = function () {
    registrar('console.error: ' + Array.prototype.map.call(arguments, function (a) { return a && a.stack ? a.stack : String(a); }).join(' '));
    original.apply(console, arguments);
  };
})();
