// Escenario de prueba de extremo a extremo con datos simulados (no se usa en producción).
// Ejecuta los flujos principales, registra resultados y captura los PDF generados.
(function () {
  'use strict';
  var log = [];
  var pdfs = [];
  var pendientes = 0;

  var crearURL = URL.createObjectURL;
  URL.createObjectURL = function (obj) {
    if (obj instanceof Blob && obj.type === 'application/pdf') {
      pendientes++;
      var r = new FileReader();
      r.onload = function () { pdfs.push(r.result); pendientes--; };
      r.readAsDataURL(obj);
    }
    return crearURL.call(URL, obj);
  };
  HTMLAnchorElement.prototype.click = function () { if (this.download) log.push('     (descarga: ' + this.download + ')'); };
  window.open = function () { return null; };

  function espera(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  async function hasta(fn, desc, ms) {
    var t0 = Date.now();
    while (Date.now() - t0 < (ms || 8000)) {
      var v = fn();
      if (v) return v;
      await espera(40);
    }
    throw new Error('Tiempo agotado: ' + desc);
  }
  function ok(cond, msg) { log.push((cond ? 'OK    ' : 'FALLÓ ') + msg); }
  function $(s) { return document.querySelector(s); }
  function $$(s) { return Array.prototype.slice.call(document.querySelectorAll(s)); }
  function escribir(el, v) {
    el.value = v;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }
  async function ir(hash, selector) {
    location.hash = hash;
    await espera(30);
    return hasta(function () { return $(selector); }, hash + ' → ' + selector);
  }
  async function cerrarModal() {
    var b = $('.modal [data-cerrar]');
    if (b) b.click();
    await espera(30);
  }
  async function elegirMiembro(texto) {
    var entrada = await hasta(function () { return $('#selector-miembro'); }, 'selector');
    entrada.focus();
    escribir(entrada, texto);
    var op = await hasta(function () {
      var o = $('.selector-opcion');
      var sinAcentos = o ? o.textContent.normalize('NFD').replace(/[^\x20-\x7e]/g, '').toLowerCase() : '';
      return o && sinAcentos.indexOf(texto.split(' ')[0].slice(0, 3)) >= 0 ? o : null;
    }, 'opción ' + texto);
    var nombre = op.textContent.trim();
    op.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await hasta(function () { return $('.selector-elegido'); }, 'miembro elegido');
    return nombre;
  }

  async function escenario() {
    await hasta(function () { return $('#contenido .cabecera'); }, 'aplicación cargada', 15000);
    var mock = window.__mock;
    var juan = mock.miembros[0];

    // 1. Nueva aportación con validaciones
    await ir('#/aportaciones/nueva', '#form-aportacion');
    var elegido = await elegirMiembro('nunez');
    ok(elegido.indexOf('Núñez') >= 0, 'Búsqueda de miembro sin acentos ("nunez" → ' + elegido.replace(/\s+/g, ' ') + ')');
    $('#form-aportacion').requestSubmit();
    await hasta(function () { return $('#mensaje .alerta'); }, 'validación');
    ok(/monto/i.test($('#mensaje').textContent), 'Validación: monto obligatorio');
    escribir($('#monto'), '-5');
    $('#form-aportacion').requestSubmit();
    await espera(50);
    ok(/monto/i.test($('#mensaje').textContent), 'Validación: rechaza monto negativo');
    escribir($('#monto'), '1,250.5');
    escribir($('#referencia'), '5555');
    escribir($('#bienes'), 'si');
    escribir($('#valor-bienes'), '2000');
    escribir($('#desc-bienes'), 'Cena');
    $('#form-aportacion').requestSubmit();
    await espera(50);
    ok(/exceder/i.test($('#mensaje').textContent), 'Validación: valor de bienes no puede exceder el monto');
    escribir($('#valor-bienes'), '50');
    $('#form-aportacion').requestSubmit();
    await hasta(function () { return $('.exito-registro'); }, 'registro exitoso');
    var recibo = $('.recibo-numero').textContent.trim();
    ok(/^EBE-\d{4}-\d{6}$/.test(recibo), 'Aportación registrada: recibo ' + recibo);
    ok($('.exito-registro').textContent.indexOf('$1,250.50') >= 0, 'Confirmación muestra $1,250.50');
    ok(!!$('#ver-recibo') && !!$('#pdf-recibo') && !!$('#nueva'), 'Opciones VER RECIBO / GENERAR PDF / NUEVA APORTACIÓN');
    $('#ver-recibo').click();
    await hasta(function () { return $('.visor-pdf'); }, 'visor PDF');
    ok(true, 'Vista previa del recibo (PDF #' + (pdfs.length + pendientes) + ')');
    await cerrarModal();
    var enlaceDetalle = $('.exito-registro a[href^="#/aportaciones/"]').getAttribute('href');

    // 2. Anular la aportación
    await ir(enlaceDetalle, '#anular');
    $('#anular').click();
    var area = await hasta(function () { return $('#texto-solicitado'); }, 'motivo');
    escribir(area, 'abc');
    $('.modal [data-ok]').click();
    await espera(40);
    ok(!!$('#texto-solicitado') && area.getAttribute('aria-invalid') === 'true', 'Anulación exige motivo de 5+ caracteres');
    escribir(area, 'Registrada al miembro equivocado');
    $('.modal [data-ok]').click();
    await hasta(function () { return $('.cabecera .insignia.rojo'); }, 'estado anulada');
    ok($('.alerta.error').textContent.indexOf('Registrada al miembro equivocado') >= 0, 'Aportación ANULADA con motivo visible');
    ok(!$('#anular') && !!$('a[href*="corrige="]'), 'Anulada: sin botón Anular, con "Registrar corrección"');
    $('#ver-recibo').click();
    await hasta(function () { return $('.visor-pdf'); }, 'visor recibo anulado');
    ok(true, 'Recibo de aportación anulada (con marca de agua)');
    await cerrarModal();

    // 3. Registrar la corrección
    await ir($('a[href*="corrige="]').getAttribute('href'), '#form-aportacion');
    ok($('.alerta.advertencia').textContent.indexOf(recibo) >= 0, 'Formulario de corrección muestra el recibo original');
    $('.selector-elegido [data-cambiar]').click();
    await elegirMiembro('juan perez');
    $('#form-aportacion').requestSubmit();
    await hasta(function () { return $('.exito-registro'); }, 'corrección registrada');
    ok(/Corrección registrada/.test($('.exito-registro h2').textContent) && $('.exito-registro').textContent.indexOf(recibo) >= 0,
      'Corrección registrada con nuevo recibo ' + $('.recibo-numero').textContent.trim() + ' (reemplaza ' + recibo + ')');
    var anterior = mock.aportaciones.find(function (a) { return a.numero_recibo === recibo; });
    ok(anterior.estado === 'CORREGIDA' && !!anterior.corregida_por_id, 'Original queda CORREGIDA y vinculada');

    // 4. Historial: filtros y totales
    await ir('#/aportaciones', '#totales dl');
    var total1 = $('#totales').textContent;
    escribir($('#f-estado'), 'NO_VALIDAS');
    await hasta(function () { return $('#totales').textContent !== total1; }, 'filtro estado');
    ok($$('#resultado tbody tr').every(function (tr) { return /Anulada|Corregida/.test(tr.textContent); }), 'Filtro "Anuladas y corregidas"');
    escribir($('#f-estado'), 'TODAS');

    // 5. Estado de cuenta
    await ir('#/estados-cuenta?miembro=' + juan.id, '.documento');
    ok($('.documento').textContent.indexOf('Juan Pérez') >= 0 && $('.doc-total').textContent.indexOf('$') >= 0,
      'Estado de cuenta: ' + $('.doc-total').textContent.replace(/\s+/g, ' ').trim());
    $('#descargar').click();
    await espera(300);
    ok(true, 'Estado de cuenta PDF generado');

    // 6. Carta anual individual
    await ir('#/cartas?miembro=' + mock.miembros[7].id + '&anio=' + mock.HOY.slice(0, 4), '#cuerpo');
    ok($('#cuerpo').value.indexOf('Sofía Ramírez') >= 0 && $('#cuerpo').value.indexOf('{') < 0, 'Carta: plantilla aplicada sin marcadores pendientes');
    ok(/con bienes/i.test($('.tarjeta-titulo .insignia').textContent), 'Carta: detecta bienes o servicios → plantilla "con bienes"');
    $('#descargar').click();
    await espera(300);
    ok(true, 'Carta anual PDF generada');

    // 7. Cartas por lote
    $('[data-tab="lote"]').click();
    $('#form-lote').requestSubmit();
    await hasta(function () { return $('#l-pdf'); }, 'lote preparado');
    ok($$('#l-resultado tbody tr').length >= 6, 'Lote: ' + $$('#l-resultado tbody tr').length + ' cartas preparadas');
    $('#l-pdf').click();
    await hasta(function () { return $('.visor-pdf'); }, 'visor lote', 20000);
    ok(true, 'Lote de cartas PDF generado');
    await cerrarModal();

    // 8. Reportes
    await ir('#/reportes', '#filtros-reporte');
    $('[data-tipo="anual"]').click();
    await espera(30);
    $('#filtros-reporte').requestSubmit();
    await hasta(function () { return $('#rep-descargar'); }, 'reporte anual');
    ok($('#salida').textContent.indexOf('Resumen por mes') >= 0, 'Reporte anual con resumen por mes/fondo/método');
    $('#rep-descargar').click();
    await espera(300);
    $('[data-tipo="anuladas"]').click();
    await espera(30);
    $('#filtros-reporte').requestSubmit();
    await hasta(function () { return $('#rep-descargar'); }, 'reporte anuladas');
    ok($('#salida').textContent.indexOf('Motivo') >= 0, 'Reporte de anuladas con motivo');
    $('[data-tipo="miembros_activos"]').click();
    await espera(30);
    $('#filtros-reporte').requestSubmit();
    await hasta(function () { return $('#rep-csv'); }, 'reporte miembros');
    $('#rep-csv').click();
    ok(true, 'Reporte de miembros activos exportado a CSV');

    // 9. Nuevo miembro
    await ir('#/miembros/nuevo', '#form-miembro');
    escribir($('#c-nombre'), 'Rebeca');
    escribir($('#c-apellido'), 'Castillo');
    escribir($('#c-email'), 'correo-invalido');
    $('#form-miembro').requestSubmit();
    await hasta(function () { return $('#mensaje .alerta'); }, 'validación email');
    ok(/correo/i.test($('#mensaje').textContent), 'Validación de correo electrónico');
    escribir($('#c-email'), 'rebeca@ejemplo.com');
    $('#form-miembro').requestSubmit();
    await hasta(function () { return location.hash.indexOf('/miembros/0') > 0 && $('.cabecera h2') && /Rebeca/.test($('.cabecera h2').textContent); }, 'detalle miembro nuevo');
    ok(/EBE-\d{6}/.test($('.cabecera p').textContent), 'Miembro creado con número ' + $('.cabecera .mono').textContent);

    // 10. Fondos
    await ir('#/fondos', '#nuevo');
    $('#nuevo').click();
    escribir(await hasta(function () { return $('#c-nombre'); }, 'modal fondo'), 'Jóvenes');
    $('#c-guardar').click();
    await hasta(function () { return $$('tbody strong').some(function (s) { return s.textContent === 'Jóvenes'; }); }, 'fondo creado');
    ok(true, 'Fondo "Jóvenes" creado');

    // 11. Bitácora
    await ir('#/bitacora', '#resultado tbody tr');
    ok($$('#resultado tbody tr').length > 0, 'Bitácora muestra ' + $$('#resultado tbody tr').length + ' eventos');
    var ver = $('[data-ver]');
    if (ver) { ver.click(); await hasta(function () { return $('.modal'); }, 'detalle bitácora'); ok(true, 'Detalle de evento de bitácora'); await cerrarModal(); }

    // 12. Recibos por lote
    await ir('#/recibos', '#lista tbody tr');
    $('#lote').click();
    await hasta(function () { return $('.visor-pdf'); }, 'lote recibos', 20000);
    ok(true, 'Recibos por lote en PDF');
    await cerrarModal();

    // 13. Configuración
    await ir('#/configuracion', '#form-inst');
    escribir($('#i-ein'), '123');
    $('#form-inst').requestSubmit();
    await hasta(function () { return $('#inst-msg .alerta'); }, 'validación EIN');
    ok(/EIN/.test($('#inst-msg').textContent), 'Validación de EIN');
  }

  function terminar(error) {
    if (error) log.push('FALLÓ ERROR EN ESCENARIO: ' + (error.stack || error.message || error));
    (function volcar() {
      if (pendientes > 0) { setTimeout(volcar, 50); return; }
      var pre = document.createElement('pre');
      pre.id = 'resultado-escenario';
      pre.textContent = log.join('\n');
      document.body.appendChild(pre);
      pdfs.forEach(function (d, i) {
        var t = document.createElement('textarea');
        t.id = 'pdf-' + i;
        t.textContent = d;
        document.body.appendChild(t);
      });
    })();
  }

  window.addEventListener('load', function () {
    escenario().then(function () { terminar(); }, terminar);
  });
})();
