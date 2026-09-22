// Configuración institucional, logo, textos de documentos, seguridad y respaldo.
import { sb } from '../supabase.js';
import { estado, cargarConfiguracion, registrarEvento } from '../state.js';
import {
  html, pintar, $, $$, aviso, alerta, confirmar, mensajeError, obtenerTodos, descargarBlob, descargarCSV,
  marcaArchivo, fechaHora, entero, establecerZonaHoraria,
} from '../utils.js';
import { icono } from '../icons.js';
import { opciones } from '../components.js';
import { refrescarMarca, urlLogo } from '../app.js';

const VERSION = '1.0.0';
const ZONAS_COMUNES = [
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Phoenix', 'America/Los_Angeles',
  'America/Anchorage', 'Pacific/Honolulu', 'America/Puerto_Rico', 'America/Tegucigalpa', 'America/Mexico_City',
  'America/Guatemala', 'America/El_Salvador', 'America/Bogota',
];

const CAMPOS_INST = [
  ['nombre_iglesia', 'Nombre de la iglesia', { requerido: true, max: 120 }],
  ['lema', 'Lema', { max: 120 }],
  ['direccion', 'Dirección', { max: 200 }],
  ['ciudad', 'Ciudad', { max: 80 }],
  ['estado', 'Estado', { max: 40 }],
  ['zip', 'ZIP', { max: 15 }],
  ['telefono', 'Teléfono', { max: 30, tipo: 'tel' }],
  ['email', 'Correo electrónico', { max: 120, tipo: 'email' }],
  ['sitio_web', 'Sitio web', { max: 150 }],
  ['ein', 'EIN', { max: 10, ayuda: 'Employer Identification Number. Formato: 12-3456789' }],
  ['nombre_responsable', 'Nombre del responsable (firma)', { max: 120 }],
  ['cargo_responsable', 'Cargo del responsable', { max: 80, ayuda: 'Ej.: Pastor, Tesorero' }],
];

const TEXTOS = [
  ['texto_carta_sin_bienes', 'Carta anual — cuando NO hubo bienes o servicios', 10],
  ['texto_carta_con_bienes', 'Carta anual — cuando SÍ hubo bienes o servicios', 10],
  ['texto_carta_cierre', 'Carta anual — cierre (antes de la firma)', 5],
  ['texto_pie_recibo', 'Pie de los recibos', 3],
];

export async function render({ cont, titulo }) {
  titulo('Configuración');
  await cargarConfiguracion();
  const cfg = estado.config;
  const zonas = [...new Set([...ZONAS_COMUNES, cfg.zona_horaria, ...(Intl.supportedValuesOf ? Intl.supportedValuesOf('timeZone') : [])])];
  const { data: admins } = await sb.from('administradores').select('email, nombre, rol, activo, created_at').order('created_at');

  pintar(cont, html`
    <div class="cabecera"><div><h2>Configuración</h2><p>Datos institucionales, documentos, seguridad y respaldo.</p></div></div>
    <div class="pestanas" role="tablist">
      ${[['inst', 'Datos institucionales'], ['textos', 'Textos de documentos'], ['seguridad', 'Seguridad'], ['respaldo', 'Respaldo'], ['acerca', 'Acerca de']]
        .map(([id, t], i) => html`<button type="button" class="pestana ${i === 0 ? 'activa' : ''}" role="tab" aria-selected="${i === 0 ? 'true' : 'false'}" data-tab="${id}">${t}</button>`)}
    </div>

    <div data-panel="inst">
      <div class="rejilla rejilla-2-1">
        <form class="tarjeta formulario" id="form-inst" novalidate>
          <div class="tarjeta-titulo"><h3>Datos institucionales</h3></div>
          <div id="inst-msg"></div>
          <div class="fila-campos">
            ${CAMPOS_INST.map(([k, etiqueta, o]) => html`
              <div class="campo">
                <label for="i-${k}" class="${o.requerido ? 'requerido' : ''}">${etiqueta}</label>
                <input id="i-${k}" name="${k}" class="entrada" type="${o.tipo || 'text'}" maxlength="${o.max}" value="${cfg[k] || ''}">
                ${o.ayuda ? html`<div class="ayuda">${o.ayuda}</div>` : ''}
              </div>`)}
            <div class="campo">
              <label for="i-zona_horaria" class="requerido">Zona horaria de la iglesia</label>
              <select id="i-zona_horaria" name="zona_horaria" class="entrada">${opciones(zonas.map((z) => ({ valor: z, texto: z.replace(/_/g, ' ') })), cfg.zona_horaria)}</select>
              <div class="ayuda">Define la fecha de “hoy” y la hora mostrada en la bitácora y los documentos.</div>
            </div>
          </div>
          <div class="acciones"><button type="submit" class="btn btn-primario">${icono('check')} Guardar datos</button></div>
        </form>
        <section class="tarjeta">
          <div class="tarjeta-titulo"><h3>Logo institucional</h3></div>
          <div class="logo-preview"><img src="${urlLogo()}" alt="Logo actual" id="logo-actual"></div>
          <p class="texto-tenue texto-pequeno mt-1">PNG, JPG o WEBP de hasta 2 MB. Se recomienda fondo transparente o blanco y formato cuadrado.</p>
          <input type="file" id="archivo-logo" accept="image/png,image/jpeg,image/webp" hidden>
          <div class="acciones">
            <button type="button" class="btn" id="subir-logo">${icono('upload')} Subir logo oficial</button>
            ${cfg.logo_url ? html`<button type="button" class="btn btn-texto" id="quitar-logo">Usar logo predeterminado</button>` : ''}
          </div>
          <div id="logo-msg" class="mt-1"></div>
        </section>
      </div>
    </div>

    <div data-panel="textos" hidden>
      <form class="tarjeta formulario" id="form-textos" novalidate>
        ${alerta('advertencia', html`<p><strong>Revise estos textos con su asesor fiscal o contador.</strong> La redacción de las constancias de
          contribuciones depende de si se proporcionaron bienes o servicios a cambio; el sistema elige automáticamente la plantilla
          correspondiente (y permite ajustarla en cada carta).</p>`)}
        ${alerta('info', html`<p>Marcadores disponibles: <code>{nombre_donante}</code> <code>{numero_miembro}</code> <code>{anio}</code>
          <code>{total}</code> <code>{valor_bienes}</code> <code>{total_deducible}</code> <code>{descripcion_bienes}</code> <code>{nombre_iglesia}</code></p>`)}
        <div id="textos-msg"></div>
        ${TEXTOS.map(([k, etiqueta, filas]) => html`
          <div class="campo">
            <label for="t-${k}">${etiqueta}</label>
            <textarea id="t-${k}" name="${k}" class="entrada" rows="${filas}" maxlength="5000">${cfg[k] || ''}</textarea>
          </div>`)}
        <div class="acciones"><button type="submit" class="btn btn-primario">${icono('check')} Guardar textos</button></div>
      </form>
    </div>

    <div data-panel="seguridad" hidden>
      <div class="rejilla rejilla-2">
        <form class="tarjeta formulario" id="form-clave" novalidate>
          <div class="tarjeta-titulo"><h3>Cambiar mi contraseña</h3></div>
          <div id="clave-msg"></div>
          <div class="campo"><label for="clave-1" class="requerido">Nueva contraseña</label>
            <input id="clave-1" type="password" class="entrada" autocomplete="new-password" minlength="10">
            <div class="ayuda">Mínimo 10 caracteres; combine letras, números y símbolos.</div></div>
          <div class="campo"><label for="clave-2" class="requerido">Confirmar contraseña</label>
            <input id="clave-2" type="password" class="entrada" autocomplete="new-password"></div>
          <div class="acciones"><button type="submit" class="btn btn-primario">${icono('key')} Cambiar contraseña</button></div>
        </form>
        <section class="tarjeta">
          <div class="tarjeta-titulo"><h3>Sesiones</h3></div>
          <p>La sesión se cierra al cerrar el navegador y tras un período de inactividad. Si sospecha que su cuenta
             fue usada en otro equipo, cierre todas las sesiones y cambie su contraseña.</p>
          <button type="button" class="btn btn-peligro-suave" id="cerrar-todas">${icono('log-out')} Cerrar sesión en todos los dispositivos</button>
          <div class="tarjeta-titulo mt-3"><h3>Administradores autorizados</h3></div>
          <div class="tabla-contenedor">
            <table class="tabla tabla-compacta">
              <thead><tr><th>Correo</th><th>Rol</th><th>Estado</th></tr></thead>
              <tbody>${(admins || []).map((a) => html`<tr><td>${a.email}${a.nombre ? html`<br><span class="texto-tenue texto-pequeno">${a.nombre}</span>` : ''}</td>
                <td>${a.rol.replace('_', ' ')}</td><td>${a.activo ? html`<span class="insignia verde">Activo</span>` : html`<span class="insignia gris">Inactivo</span>`}</td></tr>`)}</tbody>
            </table>
          </div>
          <p class="texto-tenue texto-pequeno mt-1">Por seguridad, los administradores se agregan o desactivan únicamente desde el SQL Editor de Supabase (ver README).</p>
        </section>
      </div>
    </div>

    <div data-panel="respaldo" hidden>
      <section class="tarjeta">
        <div class="tarjeta-titulo"><h3>Exportar respaldo de datos</h3></div>
        ${alerta('advertencia', html`<p>Los archivos exportados contienen <strong>información personal y financiera</strong>. Guárdelos solo en
          ubicaciones cifradas y con acceso restringido (por ejemplo, una unidad USB cifrada o una carpeta privada en la nube). No los envíe por correo.</p>`)}
        <p class="mt-2">Recomendación: descargue un respaldo completo <strong>cada mes</strong> y después de cada cierre anual. El respaldo principal
          de la base de datos se describe en <code>docs/RESPALDOS.md</code>.</p>
        <div class="acciones mt-2">
          <button type="button" class="btn btn-primario" id="respaldo-json">${icono('database')} Respaldo completo (JSON)</button>
          <button type="button" class="btn" id="csv-miembros">${icono('download')} Miembros (CSV)</button>
          <button type="button" class="btn" id="csv-aportaciones">${icono('download')} Aportaciones (CSV)</button>
        </div>
        <div id="respaldo-msg" class="mt-2"></div>
      </section>
    </div>

    <div data-panel="acerca" hidden>
      <section class="tarjeta">
        <div class="tarjeta-titulo"><h3>Sistema de Administración de Aportaciones</h3></div>
        <dl class="datos">
          <div><dt>Institución</dt><dd>${cfg.nombre_iglesia}</dd></div>
          <div><dt>Versión</dt><dd>${VERSION}</dd></div>
          <div><dt>Usuario actual</dt><dd>${estado.usuario.email}</dd></div>
          <div><dt>Nivel de acceso</dt><dd>Super Admin</dd></div>
          <div><dt>Moneda</dt><dd>Dólares estadounidenses (USD)</dd></div>
          <div><dt>Zona horaria</dt><dd>${cfg.zona_horaria}</dd></div>
          <div><dt>Última actualización de configuración</dt><dd>${fechaHora(cfg.updated_at)}</dd></div>
        </dl>
      </section>
    </div>`);

  // Pestañas
  $$('[data-tab]', cont).forEach((b) => b.addEventListener('click', () => {
    $$('[data-tab]', cont).forEach((x) => {
      x.classList.toggle('activa', x === b);
      x.setAttribute('aria-selected', String(x === b));
    });
    $$('[data-panel]', cont).forEach((p) => { p.hidden = p.dataset.panel !== b.dataset.tab; });
  }));

  // Datos institucionales
  $('#form-inst', cont).addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const datos = {};
    for (const [k] of CAMPOS_INST) datos[k] = form.elements[k].value.trim() || null;
    datos.zona_horaria = form.elements.zona_horaria.value;
    const errores = [];
    if (!datos.nombre_iglesia) errores.push('El nombre de la iglesia es obligatorio.');
    if (datos.ein && !/^\d{2}-?\d{7}$/.test(datos.ein)) errores.push('El EIN debe tener el formato 12-3456789.');
    if (datos.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(datos.email)) errores.push('El correo electrónico no es válido.');
    if (errores.length) return pintar($('#inst-msg', cont), alerta('error', html`${errores.map((x) => html`<p>${x}</p>`)}`));
    await guardarConfig(datos, $('#inst-msg', cont), 'Datos institucionales guardados.');
  });

  // Textos
  $('#form-textos', cont).addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const datos = {};
    for (const [k] of TEXTOS) datos[k] = form.elements[k].value.trim() || null;
    await guardarConfig(datos, $('#textos-msg', cont), 'Textos guardados.');
  });

  // Logo
  const archivo = $('#archivo-logo', cont);
  $('#subir-logo', cont).addEventListener('click', () => archivo.click());
  archivo.addEventListener('change', async () => {
    const f = archivo.files[0];
    archivo.value = '';
    if (!f) return;
    const msg = $('#logo-msg', cont);
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(f.type)) return pintar(msg, alerta('error', 'Formato no permitido. Use PNG, JPG o WEBP.'));
    if (f.size > 2 * 1024 * 1024) return pintar(msg, alerta('error', 'El archivo supera 2 MB.'));
    pintar(msg, html`<div class="cargando" style="padding:8px"><div class="spinner sm"></div><span>Subiendo…</span></div>`);
    const ext = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[f.type];
    const ruta = `logo/logo-${Date.now()}.${ext}`;
    const { error } = await sb.storage.from('institucional').upload(ruta, f, { contentType: f.type, upsert: false, cacheControl: '3600' });
    if (error) return pintar(msg, alerta('error', mensajeError(error)));
    const { data } = sb.storage.from('institucional').getPublicUrl(ruta);
    const ok = await guardarConfig({ logo_url: data.publicUrl }, msg, 'Logo actualizado.');
    if (ok) {
      registrarEvento('ACTUALIZAR_LOGO', { tabla: 'configuracion_iglesia', descripcion: `Nuevo logo: ${ruta}` });
      render({ cont, titulo });
    }
  });
  $('#quitar-logo', cont)?.addEventListener('click', async () => {
    const ok = await confirmar({ titulo: 'Usar logo predeterminado', mensaje: '¿Volver al logo oficial incluido en la aplicación (assets/logo.png)?' });
    if (!ok) return;
    if (await guardarConfig({ logo_url: null }, $('#logo-msg', cont), 'Se restableció el logo predeterminado.')) render({ cont, titulo });
  });

  // Seguridad
  $('#form-clave', cont).addEventListener('submit', async (e) => {
    e.preventDefault();
    const c1 = $('#clave-1', cont).value;
    const c2 = $('#clave-2', cont).value;
    const msg = $('#clave-msg', cont);
    if (c1.length < 10) return pintar(msg, alerta('error', 'La contraseña debe tener al menos 10 caracteres.'));
    if (c1 !== c2) return pintar(msg, alerta('error', 'Las contraseñas no coinciden.'));
    const { error } = await sb.auth.updateUser({ password: c1 });
    if (error) return pintar(msg, alerta('error', mensajeError(error)));
    $('#clave-1', cont).value = '';
    $('#clave-2', cont).value = '';
    pintar(msg, alerta('exito', 'Contraseña actualizada correctamente.'));
  });
  $('#cerrar-todas', cont).addEventListener('click', async () => {
    const ok = await confirmar({
      titulo: 'Cerrar todas las sesiones',
      mensaje: 'Se cerrará la sesión en todos los dispositivos, incluido este. ¿Continuar?',
      textoConfirmar: 'Cerrar todas', peligro: true,
    });
    if (!ok) return;
    await registrarEvento('CERRAR_SESION', { descripcion: 'Cierre de sesión en todos los dispositivos' });
    await sb.auth.signOut({ scope: 'global' });
  });

  // Respaldo
  $('#respaldo-json', cont).addEventListener('click', (e) => exportarTodo(e.currentTarget, $('#respaldo-msg', cont)));
  $('#csv-miembros', cont).addEventListener('click', async (e) => {
    const b = e.currentTarget;
    b.disabled = true;
    try {
      const filas = await obtenerTodos(() => sb.from('miembros').select('*').order('numero_miembro'));
      descargarCSV(`miembros-${marcaArchivo()}.csv`,
        ['Número', 'Nombre', 'Apellido', 'Tipo', 'Activo', 'Teléfono', 'Email', 'Dirección', 'Ciudad', 'Estado', 'ZIP', 'Fecha de ingreso', 'Notas', 'Creado'],
        filas.map((m) => [m.numero_miembro, m.nombre, m.apellido, m.tipo_persona, m.activo ? 'Sí' : 'No', m.telefono, m.email,
          m.direccion, m.ciudad, m.estado, m.zip, m.fecha_ingreso, m.notas, m.created_at]));
      registrarEvento('EXPORTAR_DATOS', { tabla: 'miembros', descripcion: `Exportación CSV de miembros (${filas.length})` });
    } catch (err) {
      aviso(mensajeError(err), 'error');
    } finally {
      b.disabled = false;
    }
  });
  $('#csv-aportaciones', cont).addEventListener('click', async (e) => {
    const b = e.currentTarget;
    b.disabled = true;
    try {
      const filas = await obtenerTodos(() => sb.from('v_aportaciones').select('*').order('numero_recibo'));
      descargarCSV(`aportaciones-${marcaArchivo()}.csv`,
        ['Recibo', 'Fecha', 'No. miembro', 'Nombre', 'Apellido', 'Fondo', 'Método', 'Referencia', 'Monto', 'Estado',
          'Bienes/servicios', 'Valor bienes', 'Descripción bienes', 'Descripción', 'Motivo anulación', 'Anulada el',
          'Corrige recibo', 'Corregida por', 'Registrada el', 'Registrada por'],
        filas.map((a) => [a.numero_recibo, a.fecha_aportacion, a.numero_miembro, a.miembro_nombre, a.miembro_apellido, a.fondo_nombre,
          a.metodo_pago_nombre, a.referencia_pago, Number(a.monto), a.estado, a.bienes_servicios ? 'Sí' : 'No',
          a.valor_bienes_servicios != null ? Number(a.valor_bienes_servicios) : '', a.descripcion_bienes_servicios, a.descripcion,
          a.motivo_anulacion, a.anulada_at, a.corrige_numero_recibo, a.corregida_por_numero_recibo, a.created_at, a.creado_por_email]));
      registrarEvento('EXPORTAR_DATOS', { tabla: 'aportaciones', descripcion: `Exportación CSV de aportaciones (${filas.length})` });
    } catch (err) {
      aviso(mensajeError(err), 'error');
    } finally {
      b.disabled = false;
    }
  });
}

async function guardarConfig(datos, msg, textoExito) {
  const { error } = await sb.from('configuracion_iglesia').update(datos).eq('id', estado.config.id);
  if (error) {
    pintar(msg, alerta('error', mensajeError(error)));
    return false;
  }
  await cargarConfiguracion();
  establecerZonaHoraria(estado.config.zona_horaria);
  refrescarMarca();
  pintar(msg, alerta('exito', textoExito));
  aviso(textoExito);
  return true;
}

async function exportarTodo(boton, msg) {
  boton.disabled = true;
  pintar(msg, html`<div class="cargando" style="padding:8px"><div class="spinner sm"></div><span>Preparando respaldo…</span></div>`);
  try {
    const tablas = {
      configuracion_iglesia: () => sb.from('configuracion_iglesia').select('*').order('id'),
      administradores: () => sb.from('administradores').select('*').order('user_id'),
      fondos: () => sb.from('fondos').select('*').order('id'),
      metodos_pago: () => sb.from('metodos_pago').select('*').order('id'),
      miembros: () => sb.from('miembros').select('*').order('id'),
      aportaciones: () => sb.from('aportaciones').select('*').order('id'),
      bitacora: () => sb.from('bitacora').select('*').order('fecha_hora').order('id'),
    };
    const resultado = {};
    const conteos = {};
    for (const [nombre, consulta] of Object.entries(tablas)) {
      pintar(msg, html`<div class="cargando" style="padding:8px"><div class="spinner sm"></div><span>Exportando ${nombre}…</span></div>`);
      resultado[nombre] = await obtenerTodos(consulta);
      if (nombre === 'miembros') resultado[nombre].forEach((m) => delete m.texto_busqueda);
      conteos[nombre] = resultado[nombre].length;
    }
    const respaldo = {
      sistema: 'Sistema de Administración de Aportaciones — Centro Evangelístico Ebenezer',
      version: VERSION,
      exportado_en: new Date().toISOString(),
      exportado_por: estado.usuario.email,
      zona_horaria: estado.config.zona_horaria,
      conteos,
      tablas: resultado,
    };
    descargarBlob(new Blob([JSON.stringify(respaldo, null, 2)], { type: 'application/json' }), `respaldo-cee-${marcaArchivo()}.json`);
    registrarEvento('EXPORTAR_DATOS', { descripcion: 'Respaldo completo JSON', datos: conteos });
    pintar(msg, alerta('exito', html`Respaldo generado: ${Object.entries(conteos).map(([k, v]) => `${k}: ${entero(v)}`).join(' · ')}`));
  } catch (err) {
    pintar(msg, alerta('error', mensajeError(err)));
  } finally {
    boton.disabled = false;
  }
}
