// Estados de cuenta por miembro y período.
import { sb } from '../supabase.js';
import { estado, registrarEvento } from '../state.js';
import {
  html, pintar, $, alerta, aviso, mensajeError, dinero, dineroCentavos, aCentavos, entero, fecha, fechaValida,
  hoyISO, inicioAnio, anioActual, nombreCompleto, lineasDireccion, capitalizar,
} from '../utils.js';
import { icono } from '../icons.js';
import {
  selectorMiembro, cargarMiembro, insigniaEstado, cargarFamilias, camposDestinatario, enlazarDestinatario,
  cargarDestinatarioFamilia,
} from '../components.js';
import { pdfEstadoCuenta, mostrarPDF, descargarPDF } from '../pdf.js';
import { urlLogo } from '../app.js';

export async function render({ cont, query, titulo }) {
  titulo('Estados de cuenta');
  const [miembroInicial, familias] = await Promise.all([
    query.get('miembro') ? cargarMiembro(query.get('miembro')) : null,
    cargarFamilias(),
  ]);
  const familiaInicial = familias.find((f) => f.id === query.get('familia')) || null;
  const hoy = hoyISO();

  pintar(cont, html`
    <div class="cabecera">
      <div><h2>Estado de cuenta</h2><p>Detalle de aportaciones de un miembro, donante o familia en un período.</p></div>
    </div>
    <form class="tarjeta formulario no-imprimir" id="form-estado" novalidate>
      ${camposDestinatario(familias, familiaInicial)}
      <div class="fila-campos">
        <div class="campo"><label class="requerido" for="desde">Fecha inicial</label>
          <input id="desde" class="entrada" type="date" value="${inicioAnio()}"></div>
        <div class="campo"><label class="requerido" for="hasta">Fecha final</label>
          <input id="hasta" class="entrada" type="date" value="${hoy}"></div>
      </div>
      <div class="rapidos">
        <button type="button" class="chip" data-periodo="anio">Este año</button>
        <button type="button" class="chip" data-periodo="anterior">Año anterior</button>
        <button type="button" class="chip" data-periodo="12m">Últimos 12 meses</button>
      </div>
      <label class="casilla"><input type="checkbox" id="incluir-anuladas"> Mostrar también aportaciones anuladas o corregidas (solo informativo; no suman al total)</label>
      <div id="mensaje"></div>
      <div class="acciones"><button type="submit" class="btn btn-primario">${icono('search')} Consultar</button></div>
    </form>
    <div id="resultado" class="mt-2"></div>`);

  const selector = selectorMiembro($('#miembro', cont), { inicial: miembroInicial, soloActivos: false });
  const destinatarioElegido = enlazarDestinatario(cont);
  cont.querySelectorAll('[data-periodo]').forEach((b) => b.addEventListener('click', () => {
    const a = anioActual();
    const p = {
      anio: [inicioAnio(a), hoy],
      anterior: [inicioAnio(a - 1), `${a - 1}-12-31`],
      '12m': [`${a - 1}${hoy.slice(4, 8)}01`, hoy],
    }[b.dataset.periodo];
    $('#desde', cont).value = p[0];
    $('#hasta', cont).value = p[1];
  }));

  $('#form-estado', cont).addEventListener('submit', async (e) => {
    e.preventDefault();
    const { esFamilia, familiaId } = destinatarioElegido();
    let m = esFamilia ? null : selector.obtener();
    const desde = $('#desde', cont).value;
    const hasta = $('#hasta', cont).value;
    const errores = [];
    if (esFamilia && !familiaId) errores.push('Seleccione la familia.');
    if (!esFamilia && !m) errores.push('Seleccione el miembro o donante.');
    if (!fechaValida(desde) || !fechaValida(hasta)) errores.push('Indique fechas válidas.');
    else if (desde > hasta) errores.push('La fecha inicial no puede ser posterior a la final.');
    if (errores.length) {
      pintar($('#mensaje', cont), alerta('error', html`${errores.map((x) => html`<p>${x}</p>`)}`));
      return;
    }
    pintar($('#mensaje', cont), '');
    if (esFamilia) {
      try {
        m = await cargarDestinatarioFamilia(familiaId);
      } catch (err) {
        pintar($('#resultado', cont), alerta('error', mensajeError(err)));
        return;
      }
    }
    await consultar($('#resultado', cont), m, desde, hasta, $('#incluir-anuladas', cont).checked);
  });

  if (miembroInicial || familiaInicial) $('#form-estado', cont).requestSubmit();
}

async function consultar(el, miembro, desde, hasta, incluirNoValidas) {
  el.style.opacity = '.6';
  const { data, error } = await sb.rpc('buscar_aportaciones', {
    p_filtros: {
      ...(miembro.es_familia ? { familia_id: miembro.id } : { miembro_id: miembro.id }),
      desde, hasta, estado: incluirNoValidas ? 'TODAS' : 'REGISTRADA',
    },
    p_limite: 50000, p_desplazamiento: 0, p_orden: 'fecha_asc',
  });
  el.style.opacity = '';
  if (error) {
    pintar(el, alerta('error', mensajeError(error)));
    return;
  }
  const filas = data.filas;
  const validas = filas.filter((f) => f.estado === 'REGISTRADA');
  const totalCentavos = validas.reduce((s, f) => s + aCentavos(f.monto), 0);
  const porFondo = new Map();
  for (const f of validas) {
    const r = porFondo.get(f.fondo_nombre) || { fondo: f.fondo_nombre, cantidad: 0, centavos: 0 };
    r.cantidad += 1;
    r.centavos += aCentavos(f.monto);
    porFondo.set(f.fondo_nombre, r);
  }
  const resumenFondos = [...porFondo.values()].sort((a, b) => b.centavos - a.centavos);
  const cfg = estado.config;
  const familiar = !!miembro.es_familia;
  const columnas = 5 + (incluirNoValidas ? 1 : 0) + (familiar ? 1 : 0);
  const datosInst = [cfg.direccion, [cfg.ciudad, [cfg.estado, cfg.zip].filter(Boolean).join(' ')].filter(Boolean).join(', '),
    cfg.telefono, cfg.email].filter(Boolean).join(' · ');

  pintar(el, html`
    <div class="acciones mb-2 no-imprimir">
      <button type="button" class="btn btn-primario" id="vista-pdf">${icono('eye')} Vista previa PDF</button>
      <button type="button" class="btn" id="imprimir">${icono('printer')} Imprimir</button>
      <button type="button" class="btn" id="descargar">${icono('download')} Descargar PDF</button>
    </div>
    <article class="documento">
      <div class="doc-encabezado">
        <img src="${urlLogo()}" alt="">
        <div>
          <h2>${cfg.nombre_iglesia}</h2>
          ${cfg.lema ? html`<div class="lema">“${cfg.lema}”</div>` : ''}
          ${datosInst ? html`<div class="datos-inst">${datosInst}</div>` : ''}
        </div>
      </div>
      <div class="doc-titulo">Estado de cuenta de aportaciones</div>
      <dl class="datos mb-2">
        <div><dt>${familiar ? 'Familia' : 'Miembro / donante'}</dt><dd><strong>${nombreCompleto(miembro)}</strong></dd></div>
        <div><dt>${familiar ? 'Número de familia' : 'Número de miembro'}</dt><dd class="mono">${miembro.numero_miembro}</dd></div>
        ${familiar ? html`<div style="grid-column:1/-1"><dt>Miembros</dt><dd>${miembro.miembros.map((x) => `${x.numero_miembro} ${nombreCompleto(x)}`).join(' · ')}</dd></div>` : ''}
        <div><dt>Dirección</dt><dd>${lineasDireccion(miembro).join(', ') || '—'}</dd></div>
        <div><dt>Período consultado</dt><dd>${fecha(desde)} al ${fecha(hasta)}</dd></div>
      </dl>
      <div class="tabla-contenedor">
        <table class="tabla tabla-compacta">
          <thead><tr><th>Fecha</th><th>No. recibo</th>${familiar ? html`<th>Donante</th>` : ''}<th>Fondo</th><th>Método</th>${incluirNoValidas ? html`<th>Estado</th>` : ''}<th class="dinero">Monto</th></tr></thead>
          <tbody>
            ${filas.length ? filas.map((f) => html`
              <tr class="${f.estado !== 'REGISTRADA' ? 'tenue' : ''}">
                <td class="nowrap">${fecha(f.fecha_aportacion)}</td>
                <td class="mono nowrap">${f.numero_recibo}</td>
                ${familiar ? html`<td>${f.miembro_nombre} ${f.miembro_apellido}</td>` : ''}
                <td>${f.fondo_nombre}</td>
                <td>${f.metodo_pago_nombre}</td>
                ${incluirNoValidas ? html`<td>${insigniaEstado(f.estado)}</td>` : ''}
                <td class="dinero ${f.estado !== 'REGISTRADA' ? 'tachado' : ''}">${dinero(f.monto)}</td>
              </tr>`) : html`<tr><td colspan="${columnas}" class="tabla-vacia">No hay aportaciones en el período seleccionado.</td></tr>`}
          </tbody>
        </table>
      </div>
      <div class="doc-total"><span>TOTAL DEL PERÍODO</span><span>${dineroCentavos(totalCentavos)}</span></div>
      ${resumenFondos.length > 1 ? html`
        <div class="seccion-titulo">Resumen por fondo</div>
        <div class="tabla-contenedor" style="max-width:520px">
          <table class="tabla tabla-compacta">
            <thead><tr><th>Fondo</th><th class="num">Cantidad</th><th class="dinero">Total</th></tr></thead>
            <tbody>${resumenFondos.map((r) => html`<tr><td>${r.fondo}</td><td class="num">${entero(r.cantidad)}</td><td class="dinero">${dineroCentavos(r.centavos)}</td></tr>`)}</tbody>
          </table>
        </div>` : ''}
      <p class="texto-tenue texto-pequeno mt-2">${entero(validas.length)} aportación(es) válida(s). Las aportaciones anuladas o corregidas no se incluyen en los totales.</p>
    </article>`);

  const nombre = `Estado-de-cuenta-${miembro.numero_miembro}-${desde}-a-${hasta}.pdf`;
  const generar = async () => {
    const doc = await pdfEstadoCuenta({ miembro, desde, hasta, filas, incluirNoValidas, resumenFondos, totalCentavos });
    registrarEvento('GENERAR_ESTADO_CUENTA', {
      tabla: familiar ? 'familias' : 'miembros', registroId: miembro.id,
      descripcion: `Estado de cuenta ${miembro.numero_miembro} — ${capitalizar(nombreCompleto(miembro))} (${fecha(desde)} al ${fecha(hasta)})`,
    });
    return doc;
  };
  const conError = (fn) => async () => {
    try { await fn(); } catch (err) { aviso(mensajeError(err), 'error'); }
  };
  $('#vista-pdf', el).addEventListener('click', conError(async () => mostrarPDF(await generar(), nombre, { titulo: 'Estado de cuenta' })));
  $('#imprimir', el).addEventListener('click', conError(async () => mostrarPDF(await generar(), nombre, { titulo: 'Estado de cuenta', imprimir: true })));
  $('#descargar', el).addEventListener('click', conError(async () => descargarPDF(await generar(), nombre)));
}
