// Historial de aportaciones y detalle (anular, corregir, editar notas).
import { sb } from '../supabase.js';
import { estado, registrarEvento } from '../state.js';
import {
  html, pintar, $, $$, aviso, alerta, abrirModal, solicitarTexto, mensajeError, retrasar, normalizarBusqueda,
  dinero, entero, fecha, fechaHora, hoyISO, inicioMes, inicioAnio, anioActual, descargarCSV, marcaArchivo,
} from '../utils.js';
import { icono } from '../icons.js';
import { insigniaEstado, montarPaginacion, opciones, cargarMiembro } from '../components.js';
import { pdfRecibo, mostrarPDF, descargarPDF } from '../pdf.js';

const TAMANO = 50;
const filtros = {
  texto: '', desde: inicioAnio(), hasta: '', fondo_id: '', metodo_pago_id: '', estado: 'TODAS', miembro_id: '', pagina: 1,
};

const ESTADOS_FILTRO = [
  { valor: 'TODAS', texto: 'Todas' },
  { valor: 'REGISTRADA', texto: 'Registradas (válidas)' },
  { valor: 'ANULADA', texto: 'Anuladas' },
  { valor: 'CORREGIDA', texto: 'Corregidas' },
  { valor: 'NO_VALIDAS', texto: 'Anuladas y corregidas' },
];

function filtrosRPC() {
  return {
    texto: normalizarBusqueda(filtros.texto),
    desde: filtros.desde || null,
    hasta: filtros.hasta || null,
    fondo_id: filtros.fondo_id || null,
    metodo_pago_id: filtros.metodo_pago_id || null,
    miembro_id: filtros.miembro_id || null,
    estado: filtros.estado,
  };
}

// ---------------------------------------------------------------------
// LISTA / HISTORIAL
// ---------------------------------------------------------------------
export async function lista({ cont, query, titulo }) {
  titulo('Historial de aportaciones');

  // Parámetros de la URL (enlaces desde otras pantallas)
  if ([...query.keys()].length) {
    filtros.miembro_id = query.get('miembro') || '';
    filtros.estado = query.get('estado') || 'TODAS';
    filtros.desde = query.get('desde') ?? (filtros.miembro_id ? '' : inicioAnio());
    filtros.hasta = query.get('hasta') || '';
    filtros.texto = '';
    filtros.fondo_id = '';
    filtros.metodo_pago_id = '';
    filtros.pagina = 1;
  }
  const miembroFiltro = filtros.miembro_id ? await cargarMiembro(filtros.miembro_id) : null;

  pintar(cont, html`
    <div class="cabecera">
      <div><h2>Historial de aportaciones</h2><p>Consulta de todas las aportaciones registradas, incluidas las anuladas.</p></div>
      <div class="acciones">
        <button type="button" class="btn" id="exportar">${icono('download')} Exportar CSV</button>
        <a class="btn btn-primario" href="#/aportaciones/nueva">${icono('plus-circle')} Nueva aportación</a>
      </div>
    </div>
    <form class="filtros" id="filtros" role="search">
      <div class="campo ancho">
        <label for="f-texto">Recibo o miembro</label>
        <input id="f-texto" class="entrada" type="search" value="${filtros.texto}" placeholder="Número de recibo, nombre o número de miembro">
      </div>
      <div class="campo"><label for="f-desde">Desde</label><input id="f-desde" class="entrada" type="date" value="${filtros.desde}"></div>
      <div class="campo"><label for="f-hasta">Hasta</label><input id="f-hasta" class="entrada" type="date" value="${filtros.hasta}"></div>
      <div class="campo"><label for="f-fondo">Fondo</label>
        <select id="f-fondo" class="entrada">${opciones([{ valor: '', texto: 'Todos' }, ...estado.fondos.map((f) => ({ valor: f.id, texto: f.nombre }))], filtros.fondo_id)}</select></div>
      <div class="campo"><label for="f-metodo">Método</label>
        <select id="f-metodo" class="entrada">${opciones([{ valor: '', texto: 'Todos' }, ...estado.metodos.map((m) => ({ valor: m.id, texto: m.nombre }))], filtros.metodo_pago_id)}</select></div>
      <div class="campo"><label for="f-estado">Estado</label>
        <select id="f-estado" class="entrada">${opciones(ESTADOS_FILTRO, filtros.estado)}</select></div>
      <div class="campo" style="flex-basis:100%">
        <div class="rapidos">
          <button type="button" class="chip" data-rango="hoy">Hoy</button>
          <button type="button" class="chip" data-rango="mes">Este mes</button>
          <button type="button" class="chip" data-rango="anio">Este año</button>
          <button type="button" class="chip" data-rango="anterior">Año anterior</button>
          <button type="button" class="chip" data-rango="todo">Todas las fechas</button>
          ${miembroFiltro ? html`<span class="chip activo" id="quitar-miembro" role="button" tabindex="0">
            Miembro: ${miembroFiltro.nombre} ${miembroFiltro.apellido} (${miembroFiltro.numero_miembro}) ✕</span>` : ''}
        </div>
      </div>
    </form>
    <div id="totales"></div>
    <div id="resultado"></div>
    <div id="paginacion"></div>`);

  const recargar = () => { filtros.pagina = 1; cargar(); };
  $('#f-texto', cont).addEventListener('input', retrasar((e) => { filtros.texto = e.target.value; recargar(); }, 350));
  const enlazar = (sel, clave) => $(sel, cont).addEventListener('change', (e) => { filtros[clave] = e.target.value; recargar(); });
  enlazar('#f-desde', 'desde');
  enlazar('#f-hasta', 'hasta');
  enlazar('#f-fondo', 'fondo_id');
  enlazar('#f-metodo', 'metodo_pago_id');
  enlazar('#f-estado', 'estado');
  $('#filtros', cont).addEventListener('submit', (e) => e.preventDefault());
  $$('[data-rango]', cont).forEach((b) => b.addEventListener('click', () => {
    const hoy = hoyISO();
    const anio = anioActual();
    const rangos = {
      hoy: [hoy, hoy], mes: [inicioMes(hoy), hoy], anio: [inicioAnio(anio), hoy],
      anterior: [inicioAnio(anio - 1), `${anio - 1}-12-31`], todo: ['', ''],
    };
    [filtros.desde, filtros.hasta] = rangos[b.dataset.rango];
    $('#f-desde', cont).value = filtros.desde;
    $('#f-hasta', cont).value = filtros.hasta;
    recargar();
  }));
  const quitar = $('#quitar-miembro', cont);
  if (quitar) {
    const fn = () => {
      filtros.miembro_id = '';
      if (location.hash === '#/aportaciones') lista({ cont, query: new URLSearchParams(), titulo });
      else location.hash = '#/aportaciones';
    };
    quitar.addEventListener('click', fn);
    quitar.addEventListener('keydown', (e) => { if (e.key === 'Enter') fn(); });
  }

  $('#exportar', cont).addEventListener('click', async (e) => {
    const b = e.currentTarget;
    b.disabled = true;
    const { data, error } = await sb.rpc('buscar_aportaciones', { p_filtros: filtrosRPC(), p_limite: 50000, p_desplazamiento: 0, p_orden: 'fecha_asc' });
    b.disabled = false;
    if (error) return aviso(mensajeError(error), 'error');
    descargarCSV(`aportaciones-${marcaArchivo()}.csv`,
      ['Recibo', 'Fecha', 'No. miembro', 'Nombre', 'Apellido', 'Fondo', 'Método', 'Referencia', 'Monto', 'Estado',
        'Bienes/servicios', 'Valor bienes/servicios', 'Descripción', 'Motivo anulación', 'Corrige recibo', 'Corregida por'],
      data.filas.map((f) => [f.numero_recibo, f.fecha_aportacion, f.numero_miembro, f.miembro_nombre, f.miembro_apellido,
        f.fondo_nombre, f.metodo_pago_nombre, f.referencia_pago, Number(f.monto), f.estado, f.bienes_servicios ? 'Sí' : 'No',
        f.valor_bienes_servicios != null ? Number(f.valor_bienes_servicios) : '', f.descripcion, f.motivo_anulacion,
        f.corrige_numero_recibo, f.corregida_por_numero_recibo]));
    registrarEvento('EXPORTAR_DATOS', { tabla: 'aportaciones', descripcion: `Exportación CSV del historial (${data.filas.length} filas)` });
  });

  let solicitud = 0;
  async function cargar() {
    const n = ++solicitud;
    const res = $('#resultado', cont);
    res.style.opacity = '.6';
    const { data, error } = await sb.rpc('buscar_aportaciones', {
      p_filtros: filtrosRPC(), p_limite: TAMANO, p_desplazamiento: (filtros.pagina - 1) * TAMANO, p_orden: 'fecha_desc',
    });
    if (n !== solicitud) return;
    res.style.opacity = '';
    if (error) {
      pintar(res, alerta('error', mensajeError(error)));
      return;
    }
    pintar($('#totales', cont), html`
      <dl class="resumen-kpi tarjeta" style="padding:14px 18px">
        <div><dt>Registros encontrados</dt><dd>${entero(data.total_filas)}</dd></div>
        <div><dt>Total válido</dt><dd>${dinero(data.total_validas)}</dd></div>
        <div><dt>Aportaciones válidas</dt><dd>${entero(data.cantidad_validas)}</dd></div>
        <div><dt>Anuladas / corregidas</dt><dd>${entero(data.cantidad_no_validas)}
          <span class="texto-tenue texto-pequeno">(${dinero(data.total_no_validas)}, excluidas del total)</span></dd></div>
      </dl>`);
    pintar(res, html`
      <div class="tabla-contenedor mt-2">
        <table class="tabla">
          <thead><tr><th>Recibo</th><th>Fecha</th><th>Miembro</th><th>Fondo</th><th>Método</th><th class="dinero">Monto</th><th>Estado</th></tr></thead>
          <tbody>
            ${data.filas.length ? data.filas.map((f) => html`
              <tr class="clic" data-id="${f.id}" tabindex="0">
                <td class="mono nowrap">${f.numero_recibo}</td>
                <td class="nowrap">${fecha(f.fecha_aportacion)}</td>
                <td>${f.miembro_nombre} ${f.miembro_apellido} <span class="tenue texto-pequeno">${f.numero_miembro}</span></td>
                <td>${f.fondo_nombre}</td>
                <td>${f.metodo_pago_nombre}</td>
                <td class="dinero ${f.estado !== 'REGISTRADA' ? 'tachado' : ''}">${dinero(f.monto)}</td>
                <td>${insigniaEstado(f.estado)}</td>
              </tr>`) : html`<tr><td colspan="7" class="tabla-vacia">No hay aportaciones con los filtros seleccionados.</td></tr>`}
          </tbody>
        </table>
      </div>`);
    $$('tr[data-id]', res).forEach((tr) => {
      const ir = () => { location.hash = `#/aportaciones/${tr.dataset.id}`; };
      tr.addEventListener('click', ir);
      tr.addEventListener('keydown', (e) => { if (e.key === 'Enter') ir(); });
    });
    montarPaginacion($('#paginacion', cont), {
      total: data.total_filas, pagina: filtros.pagina, tamano: TAMANO,
      alCambiar: (p) => { filtros.pagina = p; cargar(); window.scrollTo(0, 0); },
    });
  }
  await cargar();
}

// ---------------------------------------------------------------------
// DETALLE
// ---------------------------------------------------------------------
export async function detalle({ cont, params, titulo }) {
  const id = params[0];
  const [{ data: a, error }, { data: eventos, error: errBit }] = await Promise.all([
    sb.from('v_aportaciones').select('*').eq('id', id).maybeSingle(),
    sb.from('bitacora').select('id, accion, descripcion, usuario_email, fecha_hora')
      .eq('registro_id', id).order('fecha_hora', { ascending: true }).limit(100),
  ]);
  if (error) throw error;
  if (!a) {
    pintar(cont, alerta('error', 'La aportación solicitada no existe.'));
    return;
  }
  titulo(`Recibo ${a.numero_recibo}`);
  const miembro = await cargarMiembro(a.miembro_id);

  const esValida = a.estado === 'REGISTRADA';
  const puedeCorregirse = a.estado === 'REGISTRADA' || (a.estado === 'ANULADA' && !a.corregida_por_id);

  pintar(cont, html`
    <a class="volver" href="#/aportaciones">${icono('arrow-left')} Historial</a>
    <div class="cabecera">
      <div>
        <h2><span class="mono">${a.numero_recibo}</span> ${insigniaEstado(a.estado)}</h2>
        <p>${a.miembro_nombre} ${a.miembro_apellido} · ${fecha(a.fecha_aportacion)} · ${a.fondo_nombre}</p>
      </div>
      <div class="acciones">
        <button type="button" class="btn btn-primario" id="ver-recibo">${icono('eye')} Ver recibo</button>
        <button type="button" class="btn" id="pdf-recibo">${icono('download')} PDF</button>
        ${esValida ? html`<button type="button" class="btn" id="editar-notas">${icono('edit')} Editar notas</button>` : ''}
        ${puedeCorregirse ? html`<a class="btn" href="#/aportaciones/nueva?corrige=${a.id}">${icono('refresh')} ${esValida ? 'Corregir' : 'Registrar corrección'}</a>` : ''}
        ${esValida ? html`<button type="button" class="btn btn-peligro-suave" id="anular">${icono('slash')} Anular</button>` : ''}
      </div>
    </div>

    ${a.estado !== 'REGISTRADA' ? alerta('error', html`
      <p><strong>Aportación ${a.estado === 'ANULADA' ? 'anulada' : 'anulada y corregida'}</strong> el ${fechaHora(a.anulada_at)}
        ${a.anulada_por_email ? ` por ${a.anulada_por_email}` : ''}. No se incluye en los totales.</p>
      <p>Motivo: ${a.motivo_anulacion}</p>
      ${a.corregida_por_id ? html`<p>Reemplazada por el recibo <a href="#/aportaciones/${a.corregida_por_id}">${a.corregida_por_numero_recibo}</a>.</p>` : ''}`) : ''}
    ${a.corrige_aportacion_id ? alerta('info', html`Esta aportación corrige el recibo
      <a href="#/aportaciones/${a.corrige_aportacion_id}">${a.corrige_numero_recibo}</a>.`) : ''}

    <section class="tarjeta mt-2">
      <div class="tarjeta-titulo"><h3>Datos de la aportación</h3></div>
      <dl class="datos">
        <div><dt>Miembro / donante</dt><dd><a href="#/miembros/${a.miembro_id}">${a.miembro_nombre} ${a.miembro_apellido}</a></dd></div>
        <div><dt>Número de miembro</dt><dd class="mono">${a.numero_miembro}</dd></div>
        <div><dt>Fecha</dt><dd>${fecha(a.fecha_aportacion)}</dd></div>
        <div><dt>Fondo</dt><dd>${a.fondo_nombre}</dd></div>
        <div><dt>Monto</dt><dd><strong style="font-size:18px" class="${esValida ? '' : 'tachado'}">${dinero(a.monto)}</strong></dd></div>
        <div><dt>Método de pago</dt><dd>${a.metodo_pago_nombre}</dd></div>
        <div><dt>Referencia</dt><dd>${a.referencia_pago || '—'}</dd></div>
        <div><dt>Bienes o servicios</dt><dd>${a.bienes_servicios
          ? html`Sí — ${a.descripcion_bienes_servicios} (${dinero(a.valor_bienes_servicios)})` : 'No'}</dd></div>
        <div style="grid-column:1/-1"><dt>Descripción</dt><dd style="white-space:pre-wrap">${a.descripcion || '—'}</dd></div>
        <div><dt>Registrada</dt><dd>${fechaHora(a.created_at)}${a.creado_por_email ? html`<br><span class="texto-tenue">${a.creado_por_email}</span>` : ''}</dd></div>
        <div><dt>Última modificación</dt><dd>${a.updated_at ? fechaHora(a.updated_at) : '—'}</dd></div>
      </dl>
    </section>

    <section class="tarjeta">
      <div class="tarjeta-titulo"><h3>Historial de la operación</h3></div>
      ${errBit ? alerta('error', mensajeError(errBit)) : eventos?.length ? html`
        <ul class="linea-tiempo">${eventos.map((ev) => html`
          <li><div><strong>${ev.accion.replace(/_/g, ' ')}</strong> — ${ev.descripcion}</div>
              <div class="cuando">${fechaHora(ev.fecha_hora)} · ${ev.usuario_email || 'sistema'}</div></li>`)}
        </ul>` : html`<div class="vacio">Sin eventos registrados.</div>`}
    </section>`);

  const generar = async () => {
    const doc = await pdfRecibo(a, miembro);
    registrarEvento('GENERAR_RECIBO', { tabla: 'aportaciones', registroId: a.id, descripcion: `Recibo ${a.numero_recibo}` });
    return doc;
  };
  $('#ver-recibo', cont).addEventListener('click', async () =>
    mostrarPDF(await generar(), `Recibo-${a.numero_recibo}.pdf`, { titulo: `Recibo ${a.numero_recibo}` }));
  $('#pdf-recibo', cont).addEventListener('click', async () => descargarPDF(await generar(), `Recibo-${a.numero_recibo}.pdf`));

  $('#anular', cont)?.addEventListener('click', async () => {
    const motivo = await solicitarTexto({
      titulo: `Anular recibo ${a.numero_recibo}`,
      mensaje: html`
        <p>La aportación de <strong>${dinero(a.monto)}</strong> de ${a.miembro_nombre} ${a.miembro_apellido}
           se conservará en el historial marcada como <strong>ANULADA</strong> y quedará excluida de todos los totales.</p>
        <p>Si el error debe corregirse con otros datos, use la opción <strong>Corregir</strong>.</p>`,
      etiqueta: 'Motivo de la anulación',
      textoConfirmar: 'Anular aportación',
      peligro: true,
    });
    if (!motivo) return;
    const { error: err } = await sb.rpc('anular_aportacion', { p_aportacion_id: a.id, p_motivo: motivo });
    if (err) return aviso(mensajeError(err), 'error');
    aviso(`El recibo ${a.numero_recibo} fue anulado.`);
    detalle({ cont, params, titulo });
  });

  $('#editar-notas', cont)?.addEventListener('click', () => {
    const m = abrirModal({
      titulo: `Editar notas · ${a.numero_recibo}`,
      contenido: html`
        <form class="formulario" id="form-notas" novalidate>
          ${alerta('info', 'Solo pueden modificarse la referencia y las notas. Los datos financieros no se modifican: para corregirlos use “Corregir”.')}
          <div class="campo"><label for="n-ref">Referencia</label>
            <input id="n-ref" class="entrada" maxlength="100" value="${a.referencia_pago || ''}"></div>
          ${a.bienes_servicios ? html`<div class="campo"><label for="n-bienes" class="requerido">Descripción de bienes o servicios</label>
            <input id="n-bienes" class="entrada" maxlength="200" value="${a.descripcion_bienes_servicios || ''}"></div>` : ''}
          <div class="campo"><label for="n-desc">Descripción / notas</label>
            <textarea id="n-desc" class="entrada" rows="3" maxlength="500">${a.descripcion || ''}</textarea></div>
          <div id="n-msg"></div>
        </form>`,
      pie: html`<button type="button" class="btn" data-cerrar>Cancelar</button>
                <button type="button" class="btn btn-primario" id="n-guardar">Guardar cambios</button>`,
    });
    $('#n-guardar', m.el).addEventListener('click', async (ev) => {
      const boton = ev.currentTarget;
      const cambios = {
        referencia_pago: $('#n-ref', m.el).value.trim() || null,
        descripcion: $('#n-desc', m.el).value.trim() || null,
      };
      if (a.bienes_servicios) cambios.descripcion_bienes_servicios = $('#n-bienes', m.el).value.trim() || null;
      boton.disabled = true;
      const { error: err } = await sb.from('aportaciones').update(cambios).eq('id', a.id);
      if (err) {
        boton.disabled = false;
        pintar($('#n-msg', m.el), alerta('error', mensajeError(err)));
        return;
      }
      m.cerrar();
      aviso('Cambios guardados.');
      detalle({ cont, params, titulo });
    });
  });
}
