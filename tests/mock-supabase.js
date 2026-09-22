// Supabase simulado en memoria para pruebas de interfaz (no se usa en producción).
(function () {
  'use strict';
  window.__SB_MOCK__ = true;

  var HOY = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  var ANIO = Number(HOY.slice(0, 4));
  var MES = Number(HOY.slice(5, 7));
  var DIA = Number(HOY.slice(8, 10));
  var contador = 0;
  function nuevoId() { contador++; return '00000000-0000-4000-8000-' + String(contador).padStart(12, '0'); }
  function ahora() { return new Date().toISOString(); }
  function normal(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  }

  var USUARIO = { id: nuevoId(), email: 'admin@ebenezer.org' };

  var fondos = ['Diezmo', 'Ofrenda', 'Misiones', 'Construcción', 'Fondo General', 'Otros'].map(function (n, i) {
    return { id: nuevoId(), nombre: n, descripcion: n === 'Diezmo' ? 'Diezmos de los miembros' : '', orden: i + 1, activo: true, created_at: ahora(), updated_at: ahora() };
  });
  var metodos = ['Efectivo', 'Cheque', 'Zelle', 'ACH', 'Transferencia bancaria', 'Tarjeta', 'Otro'].map(function (n, i) {
    return { id: nuevoId(), nombre: n, orden: i + 1, activo: true, created_at: ahora(), updated_at: ahora() };
  });

  var personas = [['Juan', 'Pérez'], ['María', 'González'], ['José', 'Núñez'], ['Ana', 'Rodríguez'], ['Carlos', 'Martínez'],
    ['Lucía', 'Hernández'], ['Pedro', 'López'], ['Sofía', 'Ramírez']];
  function busqueda(m) {
    return normal([m.numero_miembro, m.nombre, m.apellido, m.email, m.telefono, String(m.telefono || '').replace(/\D/g, '')].join(' '));
  }
  var miembros = personas.map(function (p, i) {
    var m = {
      id: nuevoId(), numero_miembro: 'EBE-' + String(i + 1).padStart(6, '0'), nombre: p[0], apellido: p[1],
      direccion: (120 + i * 7) + ' NW 7th Street', ciudad: 'Miami', estado: 'FL', zip: '33125',
      telefono: '(305) 555-01' + String(i).padStart(2, '0'), email: normal(p[0]) + '@ejemplo.com',
      fecha_ingreso: '2019-0' + (1 + (i % 9)) + '-15', tipo_persona: i === 7 ? 'Donante' : 'Miembro', activo: i !== 6,
      notas: i === 0 ? 'Diácono' : null, created_at: ahora(), updated_at: ahora(), created_by: USUARIO.id, updated_by: null,
    };
    m.texto_busqueda = busqueda(m);
    return m;
  });

  var contadores = {};
  function siguienteRecibo(anio) { contadores[anio] = (contadores[anio] || 0) + 1; return 'EBE-' + anio + '-' + String(contadores[anio]).padStart(6, '0'); }

  var aportaciones = [];
  function nuevaAportacion(d) {
    var a = {
      id: d.id || nuevoId(), numero_recibo: siguienteRecibo(Number(d.fecha_aportacion.slice(0, 4))), miembro_id: d.miembro_id,
      fecha_aportacion: d.fecha_aportacion, fondo_id: d.fondo_id, monto: Number(d.monto), metodo_pago_id: d.metodo_pago_id,
      referencia_pago: d.referencia_pago || null, bienes_servicios: !!d.bienes_servicios,
      valor_bienes_servicios: d.bienes_servicios ? Number(d.valor_bienes_servicios) : null,
      descripcion_bienes_servicios: d.bienes_servicios ? d.descripcion_bienes_servicios : null, descripcion: d.descripcion || null,
      estado: 'REGISTRADA', corrige_aportacion_id: d.corrige_aportacion_id || null, corregida_por_id: null,
      created_at: d.created_at || ahora(), created_by: USUARIO.id, updated_at: null, updated_by: null,
      anulada_at: null, anulada_by: null, motivo_anulacion: null,
    };
    aportaciones.push(a);
    if (a.corrige_aportacion_id) {
      var o = aportaciones.find(function (x) { return x.id === a.corrige_aportacion_id; });
      o.estado = 'CORREGIDA';
      o.corregida_por_id = a.id;
    }
    return a;
  }

  for (var mes = 1; mes <= MES; mes++) {
    for (var i = 0; i < 6; i++) {
      var dia = Math.min(28, 3 + i * 4);
      if (mes === MES && dia > DIA) dia = Math.max(1, DIA - 1);
      var f = ANIO + '-' + String(mes).padStart(2, '0') + '-' + String(dia).padStart(2, '0');
      nuevaAportacion({
        miembro_id: miembros[i].id, fecha_aportacion: f, fondo_id: fondos[(i + mes) % 3].id,
        monto: 50 + ((i * 37 + mes * 13) % 20) * 25, metodo_pago_id: metodos[(i + mes) % 4].id,
        referencia_pago: (i + mes) % 4 === 1 ? String(1000 + mes * 10 + i) : null, created_at: f + 'T15:00:00Z',
      });
    }
  }
  nuevaAportacion({ miembro_id: miembros[1].id, fecha_aportacion: HOY, fondo_id: fondos[0].id, monto: 320, metodo_pago_id: metodos[1].id, referencia_pago: '2231' });
  nuevaAportacion({ miembro_id: miembros[7].id, fecha_aportacion: HOY, fondo_id: fondos[2].id, monto: 150, metodo_pago_id: metodos[2].id,
    bienes_servicios: true, valor_bienes_servicios: 40, descripcion_bienes_servicios: 'Cena de gala' });
  var anulada = nuevaAportacion({ miembro_id: miembros[0].id, fecha_aportacion: HOY, fondo_id: fondos[0].id, monto: 999, metodo_pago_id: metodos[0].id });
  anulada.estado = 'ANULADA'; anulada.anulada_at = ahora(); anulada.anulada_by = USUARIO.id; anulada.motivo_anulacion = 'Monto capturado por error';
  nuevaAportacion({ miembro_id: miembros[0].id, fecha_aportacion: HOY, fondo_id: fondos[0].id, monto: 99, metodo_pago_id: metodos[0].id,
    corrige_aportacion_id: anulada.id });

  var config = {
    id: nuevoId(), registro_unico: true, nombre_iglesia: 'Centro Evangelístico Ebenezer', lema: 'Tocando a las Naciones',
    direccion: '1234 SW 8th Street', ciudad: 'Miami', estado: 'FL', zip: '33135', telefono: '(305) 555-0199',
    email: 'info@ebenezer.org', sitio_web: 'www.ebenezer.org', ein: '12-3456789', logo_url: null,
    nombre_responsable: 'Rev. Daniel Ortiz', cargo_responsable: 'Pastor General', zona_horaria: 'America/New_York',
    texto_carta_sin_bienes: 'Estimado(a) {nombre_donante}:\n\nEn nombre del {nombre_iglesia}, le expresamos nuestra sincera gratitud por su fidelidad y generosidad durante el año {anio}.\n\nPor medio de la presente hacemos constar que, durante el año {anio}, usted realizó contribuciones por un total de {total}, según el resumen que se presenta a continuación.\n\nNo se proporcionaron bienes ni servicios a cambio de estas contribuciones, salvo beneficios religiosos intangibles.',
    texto_carta_con_bienes: 'Estimado(a) {nombre_donante}:\n\nHacemos constar que durante el año {anio} usted realizó contribuciones por un total de {total}.\n\nLa iglesia proporcionó bienes o servicios ({descripcion_bienes}) con un valor estimado de {valor_bienes}. El monto que excede dicho valor es {total_deducible}.',
    texto_carta_cierre: 'Que el Señor le bendiga y le recompense abundantemente.\n\nCon gratitud en Cristo,',
    texto_pie_recibo: 'Gracias por su generosidad. «Dios ama al dador alegre.» — 2 Corintios 9:7',
    created_at: ahora(), updated_at: ahora(), updated_by: USUARIO.id,
  };
  var administradores = [{ user_id: USUARIO.id, email: USUARIO.email, nombre: 'Administrador', rol: 'SUPER_ADMIN', activo: true, created_at: ahora() }];
  var bitacora = [
    { id: nuevoId(), usuario_id: USUARIO.id, usuario_email: USUARIO.email, accion: 'ANULAR', tabla_afectada: 'aportaciones', registro_id: anulada.id,
      descripcion: 'Recibo ' + anulada.numero_recibo + ' por $999.00 — Motivo: Monto capturado por error',
      datos_anteriores: { estado: 'REGISTRADA', motivo_anulacion: null }, datos_nuevos: { estado: 'ANULADA', motivo_anulacion: 'Monto capturado por error' }, fecha_hora: ahora() },
    { id: nuevoId(), usuario_id: USUARIO.id, usuario_email: USUARIO.email, accion: 'CREAR', tabla_afectada: 'miembros', registro_id: miembros[0].id,
      descripcion: 'Miembro EBE-000001 — Juan Pérez', datos_anteriores: null, datos_nuevos: { nombre: 'Juan', apellido: 'Pérez' }, fecha_hora: ahora() },
  ];

  var TABLAS = { fondos: fondos, metodos_pago: metodos, miembros: miembros, aportaciones: aportaciones, configuracion_iglesia: [config],
    administradores: administradores, bitacora: bitacora };

  function porId(lista, id) { return lista.find(function (x) { return x.id === id; }); }
  function fila(a) {
    var m = porId(miembros, a.miembro_id); var fo = porId(fondos, a.fondo_id); var me = porId(metodos, a.metodo_pago_id);
    var o = a.corrige_aportacion_id ? porId(aportaciones, a.corrige_aportacion_id) : null;
    var c = a.corregida_por_id ? porId(aportaciones, a.corregida_por_id) : null;
    return Object.assign({}, a, {
      numero_miembro: m.numero_miembro, miembro_nombre: m.nombre, miembro_apellido: m.apellido, miembro_busqueda: m.texto_busqueda,
      fondo_nombre: fo.nombre, metodo_pago_nombre: me.nombre, corrige_numero_recibo: o ? o.numero_recibo : null,
      corregida_por_numero_recibo: c ? c.numero_recibo : null, creado_por_email: USUARIO.email,
      anulada_por_email: a.anulada_by ? USUARIO.email : null,
    });
  }
  function datosTabla(t) {
    if (t === 'v_aportaciones') return aportaciones.map(fila);
    if (t === 'fondos' || t === 'metodos_pago') {
      var col = t === 'fondos' ? 'fondo_id' : 'metodo_pago_id';
      return TABLAS[t].map(function (x) {
        return Object.assign({}, x, { aportaciones: [{ count: aportaciones.filter(function (a) { return a[col] === x.id; }).length }] });
      });
    }
    return (TABLAS[t] || []).map(function (x) { return Object.assign({}, x); });
  }
  function error(msg, code) { return { data: null, error: { message: msg, code: code || 'P0001' } }; }

  function Consulta(tabla) {
    this.tabla = tabla; this.filtros = []; this.ordenes = []; this.rango = null; this.lim = null;
    this.modo = 'select'; this.unico = null; this.cuenta = false; this.datos = null;
  }
  Consulta.prototype.select = function (c, o) { if (o && o.count) this.cuenta = true; return this; };
  Consulta.prototype.insert = function (d) { this.modo = 'insert'; this.datos = d; return this; };
  Consulta.prototype.update = function (d) { this.modo = 'update'; this.datos = d; return this; };
  Consulta.prototype.delete = function () { this.modo = 'delete'; return this; };
  Consulta.prototype.eq = function (c, v) { this.filtros.push(function (r) { return String(r[c]) === String(v); }); return this; };
  Consulta.prototype.gte = function (c, v) { this.filtros.push(function (r) { return r[c] >= v; }); return this; };
  Consulta.prototype.lt = function (c, v) { this.filtros.push(function (r) { return r[c] < v; }); return this; };
  Consulta.prototype.ilike = function (c, p) {
    var re = new RegExp('^' + p.split('%').map(function (s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }).join('.*') + '$', 'i');
    this.filtros.push(function (r) { return re.test(String(r[c] == null ? '' : r[c])); }); return this;
  };
  Consulta.prototype.order = function (c, o) { this.ordenes.push([c, !(o && o.ascending === false)]); return this; };
  Consulta.prototype.range = function (a, b) { this.rango = [a, b]; return this; };
  Consulta.prototype.limit = function (n) { this.lim = n; return this; };
  Consulta.prototype.single = function () { this.unico = 'single'; return this; };
  Consulta.prototype.maybeSingle = function () { this.unico = 'maybe'; return this; };
  Consulta.prototype.then = function (ok, mal) {
    var self = this;
    return new Promise(function (r) { setTimeout(r, 15); }).then(function () { return self.ejecutar(); }).then(ok, mal);
  };
  Consulta.prototype.ejecutar = function () {
    var t = this.tabla; var self = this;
    if (this.modo === 'insert') {
      var d = this.datos; var nuevo;
      if (t === 'aportaciones') nuevo = nuevaAportacion(d);
      else if (t === 'miembros') {
        nuevo = Object.assign({ id: nuevoId(), activo: true, created_at: ahora(), updated_at: ahora() }, d,
          { numero_miembro: 'EBE-' + String(miembros.length + 1).padStart(6, '0') });
        nuevo.texto_busqueda = busqueda(nuevo);
        miembros.push(nuevo);
      } else { nuevo = Object.assign({ id: nuevoId(), created_at: ahora(), updated_at: ahora() }, d); TABLAS[t].push(nuevo); }
      return { data: this.unico ? Object.assign({}, nuevo) : [nuevo], error: null };
    }
    var base = t === 'v_aportaciones' ? datosTabla(t) : (TABLAS[t] || []);
    var filas = (this.modo === 'select' ? datosTabla(t) : base).filter(function (r) { return self.filtros.every(function (fn) { return fn(r); }); });
    if (this.modo === 'update') {
      filas.forEach(function (r) { Object.assign(r, self.datos, { updated_at: ahora() }); if (t === 'miembros') r.texto_busqueda = busqueda(r); });
      return { data: this.unico ? filas[0] : filas, error: null };
    }
    if (this.modo === 'delete') {
      filas.forEach(function (r) { TABLAS[t].splice(TABLAS[t].indexOf(r), 1); });
      return { data: null, error: null };
    }
    this.ordenes.slice().reverse().forEach(function (o) {
      filas.sort(function (a, b) { var x = a[o[0]], y = b[o[0]]; return (x > y ? 1 : x < y ? -1 : 0) * (o[1] ? 1 : -1); });
    });
    var total = filas.length;
    if (this.rango) filas = filas.slice(this.rango[0], this.rango[1] + 1);
    if (this.lim != null) filas = filas.slice(0, this.lim);
    if (this.unico === 'single') return filas.length ? { data: filas[0], error: null } : error('No rows', 'PGRST116');
    if (this.unico === 'maybe') return { data: filas[0] || null, error: null };
    return { data: filas, error: null, count: this.cuenta ? total : null };
  };

  function buscar(p) {
    var f = p.p_filtros || {};
    var tokens = normal(f.texto || '').split(/\s+/).filter(Boolean);
    var filas = aportaciones.map(fila).filter(function (v) {
      if (f.desde && v.fecha_aportacion < f.desde) return false;
      if (f.hasta && v.fecha_aportacion > f.hasta) return false;
      if (f.fondo_id && v.fondo_id !== f.fondo_id) return false;
      if (f.metodo_pago_id && v.metodo_pago_id !== f.metodo_pago_id) return false;
      if (f.miembro_id && v.miembro_id !== f.miembro_id) return false;
      var e = f.estado || 'TODAS';
      if (e === 'NO_VALIDAS' && v.estado === 'REGISTRADA') return false;
      if (e !== 'TODAS' && e !== 'NO_VALIDAS' && v.estado !== e) return false;
      return tokens.every(function (t) { return v.numero_recibo.toLowerCase().indexOf(t) >= 0 || v.miembro_busqueda.indexOf(t) >= 0; });
    });
    var asc = p.p_orden === 'fecha_asc';
    filas.sort(function (a, b) {
      var k = a.fecha_aportacion.localeCompare(b.fecha_aportacion) || a.numero_recibo.localeCompare(b.numero_recibo);
      return asc ? k : -k;
    });
    var val = filas.filter(function (x) { return x.estado === 'REGISTRADA'; });
    var no = filas.filter(function (x) { return x.estado !== 'REGISTRADA'; });
    var suma = function (l) { return Math.round(l.reduce(function (s, x) { return s + x.monto * 100; }, 0)) / 100; };
    var desde = p.p_desplazamiento || 0;
    return {
      filas: filas.slice(desde, desde + (p.p_limite || 50)).map(function (x) { var y = Object.assign({}, x); delete y.miembro_busqueda; return y; }),
      total_filas: filas.length, cantidad_validas: val.length, total_validas: suma(val), cantidad_no_validas: no.length, total_no_validas: suma(no),
    };
  }

  function dashboard() {
    var val = aportaciones.filter(function (a) { return a.estado === 'REGISTRADA' && a.fecha_aportacion.slice(0, 4) === String(ANIO); });
    var suma = function (l) { return Math.round(l.reduce(function (s, x) { return s + x.monto * 100; }, 0)) / 100; };
    var hoy = val.filter(function (a) { return a.fecha_aportacion === HOY; });
    var mes = val.filter(function (a) { return a.fecha_aportacion.slice(0, 7) === HOY.slice(0, 7); });
    var porFondo = fondos.map(function (fo) {
      var l = val.filter(function (a) { return a.fondo_id === fo.id; });
      return { fondo: fo.nombre, cantidad: l.length, total: suma(l) };
    }).filter(function (x) { return x.cantidad; }).sort(function (a, b) { return b.total - a.total; });
    var porMes = []; for (var m = 1; m <= 12; m++) {
      var l = val.filter(function (a) { return Number(a.fecha_aportacion.slice(5, 7)) === m; });
      porMes.push({ mes: m, cantidad: l.length, total: suma(l) });
    }
    var recientes = aportaciones.slice().sort(function (a, b) { return b.created_at.localeCompare(a.created_at); }).slice(0, 8).map(function (a) {
      var v = fila(a);
      return { id: v.id, numero_recibo: v.numero_recibo, fecha_aportacion: v.fecha_aportacion, miembro: v.miembro_nombre + ' ' + v.miembro_apellido,
        numero_miembro: v.numero_miembro, fondo: v.fondo_nombre, metodo: v.metodo_pago_nombre, monto: v.monto, estado: v.estado };
    });
    return {
      hoy: HOY, zona_horaria: config.zona_horaria, total_hoy: suma(hoy), cantidad_hoy: hoy.length, total_mes: suma(mes), cantidad_mes: mes.length,
      total_anio: suma(val), cantidad_anio: val.length, miembros_activos: miembros.filter(function (x) { return x.activo; }).length,
      miembros_total: miembros.length, no_validas_anio: aportaciones.filter(function (a) { return a.estado !== 'REGISTRADA'; }).length,
      por_fondo: porFondo, por_mes: porMes, recientes: recientes,
    };
  }

  var RPC = {
    es_super_admin: function () { return true; },
    datos_publicos_iglesia: function () { return { nombre_iglesia: config.nombre_iglesia, lema: config.lema, logo_url: config.logo_url }; },
    registrar_evento: function (p) {
      bitacora.unshift({ id: nuevoId(), usuario_id: USUARIO.id, usuario_email: USUARIO.email, accion: p.p_accion, tabla_afectada: p.p_tabla,
        registro_id: p.p_registro_id, descripcion: p.p_descripcion, datos_anteriores: null, datos_nuevos: p.p_datos, fecha_hora: ahora() });
      return null;
    },
    resumen_dashboard: dashboard,
    buscar_aportaciones: buscar,
    anular_aportacion: function (p) {
      var a = porId(aportaciones, p.p_aportacion_id);
      if (!a || a.estado !== 'REGISTRADA') throw { message: 'La aportación no existe o ya no está en estado REGISTRADA.', code: 'P0001' };
      a.estado = 'ANULADA'; a.motivo_anulacion = p.p_motivo; a.anulada_at = ahora(); a.anulada_by = USUARIO.id;
      return a;
    },
    corregir_aportacion: function (p) {
      var a = porId(aportaciones, p.p_aportacion_id);
      if (a.estado === 'REGISTRADA') { a.estado = 'ANULADA'; a.motivo_anulacion = p.p_motivo; a.anulada_at = ahora(); a.anulada_by = USUARIO.id; }
      return nuevaAportacion(Object.assign({}, p.p_datos, { corrige_aportacion_id: a.id }));
    },
  };

  var oyentes = [];
  var sesion = new URLSearchParams(location.search).has('login') ? null : { user: USUARIO, access_token: 'prueba' };
  var cliente = {
    from: function (t) { return new Consulta(t); },
    rpc: function (nombre, params) {
      return new Promise(function (r) { setTimeout(r, 20); }).then(function () {
        try { return { data: RPC[nombre](params || {}), error: null }; } catch (e) { return { data: null, error: e }; }
      });
    },
    auth: {
      getSession: function () { return Promise.resolve({ data: { session: sesion }, error: null }); },
      onAuthStateChange: function (cb) { oyentes.push(cb); return { data: { subscription: { unsubscribe: function () {} } } }; },
      signInWithPassword: function (c) {
        if (c.password === 'demo') { sesion = { user: USUARIO }; return Promise.resolve({ data: { session: sesion }, error: null }); }
        return Promise.resolve({ data: {}, error: { message: 'Invalid login credentials' } });
      },
      signOut: function () { sesion = null; oyentes.forEach(function (cb) { cb('SIGNED_OUT', null); }); return Promise.resolve({ error: null }); },
      updateUser: function () { return Promise.resolve({ data: {}, error: null }); },
    },
    storage: {
      from: function () {
        return {
          upload: function () { return Promise.resolve({ data: {}, error: null }); },
          list: function () { return Promise.resolve({ data: [], error: null }); },
          download: function () { return Promise.resolve({ data: new Blob(['%PDF-1.4']), error: null }); },
          getPublicUrl: function () { return { data: { publicUrl: 'assets/logo.png' } }; },
        };
      },
    },
  };

  window.supabase = { createClient: function () { return cliente; } };
  window.__mock = { miembros: miembros, aportaciones: aportaciones, HOY: HOY };
})();
