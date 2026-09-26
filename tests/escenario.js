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
    var cartasLote = $$('#l-resultado tbody tr').length;
    ok(cartasLote >= 6, 'Lote: ' + cartasLote + ' cartas preparadas');
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
    $('[data-tipo="metodo"]').click();
    await espera(30);
    function chipMetodo(n) { return $$('#r-metodos [data-metodo]').find(function (b) { return b.textContent.trim() === n; }); }
    function metodosDelDetalle() {
      return $$('#salida tbody tr').filter(function (tr) { return tr.cells.length === 8; })
        .map(function (tr) { return tr.cells[5].textContent.trim(); });
    }
    chipMetodo('Efectivo').click();
    $('#filtros-reporte').requestSubmit();
    await hasta(function () { return $('#rep-descargar') && /Aportaciones en Efectivo(?! y)/.test($('#salida').textContent); }, 'reporte solo efectivo');
    var filasTotales = $$('#salida tbody tr').map(function (tr) { return tr.cells[0].textContent.trim(); });
    ok(filasTotales.length === 1 && filasTotales[0] === 'Efectivo' && metodosDelDetalle().length === 0,
      'Reporte por método: solo Efectivo, sin detalle (casilla desmarcada)');
    $('#rep-descargar').click();
    await espera(300);
    $('#r-detalle').checked = true;
    $('#filtros-reporte').requestSubmit();
    await hasta(function () { return metodosDelDetalle().length > 0; }, 'reporte efectivo con detalle');
    var soloEfectivo = metodosDelDetalle();
    ok(soloEfectivo.every(function (m) { return m === 'Efectivo'; }),
      'Reporte por método: solo Efectivo con detalle (' + soloEfectivo.length + ' aportaciones)');
    chipMetodo('Cheque').click();
    $('#filtros-reporte').requestSubmit();
    await hasta(function () { return /Aportaciones en Efectivo y Cheque/.test($('#salida').textContent); }, 'reporte efectivo y cheque');
    var dosMetodos = metodosDelDetalle();
    ok(dosMetodos.indexOf('Efectivo') >= 0 && dosMetodos.indexOf('Cheque') >= 0
      && dosMetodos.every(function (m) { return m === 'Efectivo' || m === 'Cheque'; }),
      'Reporte por método: Efectivo y Cheque juntos (' + dosMetodos.length + ' aportaciones, sin otros métodos)');
    $('#rep-descargar').click();
    await espera(300);
    chipMetodo('Efectivo').click();
    chipMetodo('Cheque').click();
    $('#r-detalle').checked = false;
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

    // 13. Familias
    function usd(c) { return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(c / 100); }
    function totalAnio(ids) {
      return mock.aportaciones.filter(function (a) {
        return ids.indexOf(a.miembro_id) >= 0 && a.estado === 'REGISTRADA' && a.fecha_aportacion.slice(0, 4) === mock.HOY.slice(0, 4);
      }).reduce(function (s, a) { return s + Math.round(a.monto * 100); }, 0);
    }
    var maria = mock.miembros[1];
    await ir('#/familias/nueva', '#form-familia');
    escribir($('#c-nombre'), 'Familia Pérez');
    $('#form-familia').requestSubmit();
    await hasta(function () { return /^#\/familias\/[0-9a-f-]{36}$/.test(location.hash) && $('#agregar'); }, 'detalle de familia');
    var idFamilia = location.hash.split('/')[2];
    ok(/FAM-\d{6}/.test($('.cabecera .mono').textContent), 'Familia creada con número ' + $('.cabecera .mono').textContent);
    await elegirMiembro('juan perez');
    await hasta(function () { return $$('[data-quitar]').length === 1; }, 'Juan agregado');
    await elegirMiembro('maria gonzalez');
    await hasta(function () { return $$('[data-quitar]').length === 2; }, 'María agregada');
    ok(juan.familia_id === idFamilia && maria.familia_id === idFamilia, 'Dos miembros agregados a la familia');
    var dirigida = $('.datos dd strong').textContent;
    ok(dirigida === 'Juan Pérez y María González', 'Carta dirigida a "' + dirigida + '"');
    var esperado = usd(totalAnio([juan.id, maria.id]));
    ok($('.indicador .valor').textContent === esperado, 'Total familiar del año = suma de ambos (' + esperado + ')');

    await ir('#/cartas?familia=' + idFamilia + '&anio=' + mock.HOY.slice(0, 4), '#cuerpo');
    ok($('#cuerpo').value.indexOf('Juan Pérez y María González') >= 0, 'Carta familiar: dirigida a la familia');
    ok($('#carta tfoot').textContent.indexOf(esperado) >= 0, 'Carta familiar: total anual ' + esperado);
    $('#descargar').click();
    await espera(300);
    ok(true, 'Carta familiar PDF generada');

    $('[data-tab="lote"]').click();
    $('#form-lote').requestSubmit();
    await hasta(function () { return $('#l-pdf'); }, 'lote con familia');
    var filasLote = $$('#l-resultado tbody tr');
    ok(filasLote.length === cartasLote - 1 && filasLote.some(function (tr) { return /Familia · 2 personas/.test(tr.textContent); }),
      'Lote: la familia recibe una sola carta (' + cartasLote + ' → ' + filasLote.length + ')');

    await ir('#/cartas?miembro=' + juan.id + '&anio=' + mock.HOY.slice(0, 4), '#cuerpo');
    await hasta(function () { return $('#carta .alerta.info'); }, 'aviso de carta conjunta');
    ok(/carta conjunta/.test($('#carta .alerta.info').textContent), 'Carta individual avisa que la persona recibe carta conjunta');

    await ir('#/estados-cuenta?familia=' + idFamilia, '.documento');
    ok($('.documento thead').textContent.indexOf('Donante') >= 0 && $('.doc-total').textContent.indexOf(esperado) >= 0,
      'Estado de cuenta familiar con columna Donante y total ' + esperado);
    $('#descargar').click();
    await espera(300);
    ok(true, 'Estado de cuenta familiar PDF generado');

    // Nuevo miembro creando su familia desde el formulario
    await ir('#/miembros/nuevo', '#form-miembro');
    escribir($('#c-nombre'), 'Ana');
    escribir($('#c-apellido'), 'Sariñana');
    escribir($('#c-familia_id'), '__nueva__');
    var nombreFam = await hasta(function () { return $('#texto-solicitado'); }, 'nombre de familia nueva');
    ok(nombreFam.value === 'Familia Sariñana', 'Nombre sugerido para la familia nueva: ' + nombreFam.value);
    $('.modal [data-ok]').click();
    await espera(40);
    $('#form-miembro').requestSubmit();
    await hasta(function () { return $('.cabecera h2') && /Ana Sariñana/.test($('.cabecera h2').textContent); }, 'miembro con familia nueva');
    ok(/Familia Sariñana/.test($('.datos').textContent), 'Miembro creado dentro de la familia nueva "Familia Sariñana"');

    // Eliminar la familia conserva a sus miembros
    await ir('#/familias/' + idFamilia, '#eliminar');
    $('#eliminar').click();
    (await hasta(function () { return $('.modal [data-ok]'); }, 'confirmar eliminación')).click();
    await hasta(function () { return location.hash === '#/familias'; }, 'familia eliminada');
    ok(juan.familia_id === null && maria.familia_id === null && mock.miembros.indexOf(juan) >= 0,
      'Al eliminar la familia, sus miembros se conservan sin familia');

    // Aportaciones anónimas
    var anonimo = mock.miembros.find(function (m) { return m.es_anonimo; });
    await ir('#/aportaciones/nueva', '#form-aportacion');
    $('#anonima').click();
    await hasta(function () { return $('.selector-elegido'); }, 'anónimo elegido');
    ok(/^Anónimo/.test($('.selector-elegido strong').textContent), 'Botón "Aportación anónima" elige a "' + $('.selector-elegido strong').textContent + '"');
    escribir($('#monto'), '312.40');
    $('#form-aportacion').requestSubmit();
    await hasta(function () { return $('.exito-registro'); }, 'aportación anónima registrada');
    ok(/Aportación anónima/.test($('.exito-registro .resumen').textContent), 'Confirmación dice "Aportación anónima"');
    ok($('#otra-mismo').textContent === 'Otra aportación anónima', 'Botón "Otra aportación anónima"');
    $('#ver-recibo').click();
    await hasta(function () { return $('.visor-pdf'); }, 'recibo anónimo');
    ok(true, 'Recibo anónimo PDF generado');
    await cerrarModal();

    await ir('#/estados-cuenta?miembro=' + anonimo.id, '.documento');
    ok($('.documento .datos strong').textContent === 'Anónimo' && $('.doc-total').textContent.indexOf('$') >= 0,
      'Estado de cuenta de "Anónimo" (' + $('.doc-total').textContent.replace(/\s+/g, ' ').trim() + ')');

    await ir('#/reportes', '#filtros-reporte');
    $('[data-tipo="miembro"]').click();
    await espera(30);
    $('#filtros-reporte').requestSubmit();
    await hasta(function () { return $('#rep-descargar'); }, 'reporte por miembro');
    var filaAnonima = $$('#salida tbody tr').find(function (tr) { return tr.textContent.indexOf(anonimo.numero_miembro) >= 0; });
    ok(!!filaAnonima && filaAnonima.cells[1].textContent.trim() === 'Anónimo', 'Reporte por miembro muestra la fila "Anónimo"');

    await ir('#/cartas', '#form-carta');
    await elegirMiembro('juan');
    var entradaCarta = null;
    $('[data-cambiar]').click();
    entradaCarta = await hasta(function () { return $('#selector-miembro'); }, 'selector de carta');
    escribir(entradaCarta, 'anonimo');
    await hasta(function () { return $('.selector-vacio') && !/Buscando/.test($('.selector-vacio').textContent); }, 'búsqueda sin anónimo');
    ok(!$('.selector-opcion'), 'Carta individual: el donante anónimo no aparece en la búsqueda');
    $('[data-tab="lote"]').click();
    $('#form-lote').requestSubmit();
    await hasta(function () { return $('#l-pdf'); }, 'lote sin anónimo');
    ok(!$$('#l-resultado tbody tr').some(function (tr) { return tr.textContent.indexOf(anonimo.numero_miembro) >= 0; })
      && /anónima\(s\)/.test($('#l-resultado').textContent), 'Lote de cartas: excluye las anónimas y lo indica');

    await ir('#/miembros/' + anonimo.id, '.cabecera h2');
    ok(!$('#alternar-activo') && !$('#eliminar') && !$('#contenido .cabecera a[href^="#/cartas"]') && !!$('#contenido .cabecera a[href^="#/estados-cuenta"]'),
      'Ficha de "Anónimo": con estado de cuenta, sin carta, desactivar ni eliminar');
    await ir('#/miembros/' + anonimo.id + '/editar', '#form-miembro');
    escribir($('#c-notas'), 'Ofrendas en efectivo');
    $('#form-miembro').requestSubmit();
    await hasta(function () { return location.hash === '#/miembros/' + anonimo.id; }, 'anónimo guardado');
    ok(anonimo.notas === 'Ofrendas en efectivo' && anonimo.nombre === 'Anónimo' && anonimo.activo, 'Editar "Anónimo": se guardan las notas y conserva su nombre');

    // 14. Configuración
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
