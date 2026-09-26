// Reportes administrativos con filtros, totales y exportación (PDF/CSV).
import { sb } from '../supabase.js';
import { estado, registrarEvento } from '../state.js';
import {
  html, pintar, $, $$, alerta, aviso, mensajeError, dinero, dineroCentavos, aCentavos, entero, fecha, fechaHora,
  fechaValida, hoyISO, inicioMes, finMes, anioActual, MESES, capitalizar, obtenerTodos, descargarCSV, marcaArchivo,
} from '../utils.js';
import { icono } from '../icons.js';
import { opciones } from '../components.js';
import { pdfReporte, mostrarPDF, descargarPDF } from '../pdf.js';

const TIPOS = [
  { id: 'dia', texto: 'Aportaciones del día', icono: 'calendar', filtros: ['fecha', 'fondo', 'metodo'] },
  { id: 'rango', texto: 'Por rango de fechas', icono: 'calendar', filtros: ['desde', 'hasta', 'fondo', 'metodo'] },
  { id: 'mensual', texto: 'Aportaciones mensuales', icono: 'bar-chart', filtros: ['anio', 'mes', 'fondo'] },
  { id: 'anual', texto: 'Aportaciones anuales', icono: 'bar-chart', filtros: ['anio', 'fondo', 'detalle'] },
  { id: 'miembro', texto: 'Por miembro', icono: 'users', filtros: ['desde', 'hasta', 'fondo'] },
  { id: 'fondo', texto: 'Por fondo', icono: 'layers', filtros: ['desde', 'hasta', 'detalle'] },
  { id: 'metodo', texto: 'Por método de pago', icono: 'credit-card', filtros: ['desde', 'hasta', 'detalle'] },
  { id: 'anuladas', texto: 'Anuladas y corregidas', icono: 'slash', filtros: ['desde', 'hasta'] },
  { id: 'miembros_activos', texto: 'Miembros activos', icono: 'user-check', filtros: ['tipoPersona'] },
  { id: 'miembros_inactivos', texto: 'Miembros inactivos', icono: 'user-x', filtros: ['tipoPersona'] },
];

const f = {
  tipo: 'dia', fecha: hoyISO(), desde: inicioMes(), hasta: hoyISO(), anio: anioActual(),
  mes: Number(hoyISO().slice(5, 7)), fondo_id: '', metodo_pago_id: '', detalle: false, tipoPersona: '',
};

const NOTA_VALIDAS = 'Solo aportaciones válidas (se excluyen las anuladas y corregidas).';

// "Pérez, Juan"; el donante anónimo (sin apellido) aparece como "Anónimo".
const apellidoNombre = (x) => [x.miembro_apellido, x.miembro_nombre].filter(Boolean).join(', ');

export async function render({ cont, query, titulo }) {
  titulo('Reportes');
  if (query.get('tipo') && TIPOS.some((t) => t.id === query.get('tipo'))) f.tipo = query.get('tipo');
  pintar(cont, html`
    <div class="cabecera"><div><h2>Reportes</h2><p>Seleccione un reporte, ajuste los filtros y genere el resultado.</p></div></div>
    <div class="reportes-layout">
      <nav class="tarjeta tipos-reporte" style="padding:10px" aria-label="Tipos de reporte">
        ${TIPOS.map((t) => html`<button type="button" class="tipo-reporte ${t.id === f.tipo ? 'activo' : ''}" data-tipo="${t.id}">${icono(t.icono)} ${t.texto}</button>`)}
      </nav>
      <div>
        <form class="filtros" id="filtros-reporte" novalidate></form>
        <div id="salida"></div>
      </div>
    </div>`);

  $$('[data-tipo]', cont).forEach((b) => b.addEventListener('click', () => {
    f.tipo = b.dataset.tipo;
    $$('[data-tipo]', cont).forEach((x) => x.classList.toggle('activo', x === b));
    pintarFiltros();
    pintar($('#salida', cont), '');
  }));

  function pintarFiltros() {
    const tipo = TIPOS.find((t) => t.id === f.tipo);
    const usa = (k) => tipo.filtros.includes(k);
    const anios = Array.from({ length: 11 }, (_, i) => ({ valor: anioActual() - i, texto: String(anioActual() - i) }));
    pintar($('#filtros-reporte', cont), html`
      ${usa('fecha') ? html`<div class="campo"><label for="r-fecha">Fecha</label><input id="r-fecha" type="date" class="entrada" value="${f.fecha}"></div>` : ''}
      ${usa('desde') ? html`<div class="campo"><label for="r-desde">Desde</label><input id="r-desde" type="date" class="entrada" value="${f.desde}"></div>` : ''}
      ${usa('hasta') ? html`<div class="campo"><label for="r-hasta">Hasta</label><input id="r-hasta" type="date" class="entrada" value="${f.hasta}"></div>` : ''}
      ${usa('anio') ? html`<div class="campo"><label for="r-anio">Año</label><select id="r-anio" class="entrada">${opciones(anios, f.anio)}</select></div>` : ''}
      ${usa('mes') ? html`<div class="campo"><label for="r-mes">Mes</label><select id="r-mes" class="entrada">${opciones(MESES.map((m, i) => ({ valor: i + 1, texto: capitalizar(m) })), f.mes)}</select></div>` : ''}
      ${usa('fondo') ? html`<div class="campo"><label for="r-fondo">Fondo</label><select id="r-fondo" class="entrada">${opciones([{ valor: '', texto: 'Todos' }, ...estado.fondos.map((x) => ({ valor: x.id, texto: x.nombre }))], f.fondo_id)}</select></div>` : ''}
      ${usa('metodo') ? html`<div class="campo"><label for="r-metodo">Método</label><select id="r-metodo" class="entrada">${opciones([{ valor: '', texto: 'Todos' }, ...estado.metodos.map((x) => ({ valor: x.id, texto: x.nombre }))], f.metodo_pago_id)}</select></div>` : ''}
      ${usa('tipoPersona') ? html`<div class="campo"><label for="r-tipo">Tipo de persona</label><select id="r-tipo" class="entrada">${opciones([{ valor: '', texto: 'Todos' }, ...['Miembro', 'Donante', 'Visitante', 'Otro'].map((x) => ({ valor: x, texto: x }))], f.tipoPersona)}</select></div>` : ''}
      ${usa('detalle') ? html`<div class="campo" style="flex:0 0 auto"><label class="casilla"><input type="checkbox" id="r-detalle" ${f.detalle ? 'checked' : ''}> Incluir detalle</label></div>` : ''}
      <div class="campo" style="flex:0 0 auto"><button type="submit" class="btn btn-primario">${icono('bar-chart')} Generar reporte</button></div>`);
  }

  pintarFiltros();

  $('#filtros-reporte', cont).addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const v = (id) => $(id, form)?.value;
    if ($('#r-fecha', form)) f.fecha = v('#r-fecha');
    if ($('#r-desde', form)) f.desde = v('#r-desde');
    if ($('#r-hasta', form)) f.hasta = v('#r-hasta');
    if ($('#r-anio', form)) f.anio = Number(v('#r-anio'));
    if ($('#r-mes', form)) f.mes = Number(v('#r-mes'));
    f.fondo_id = $('#r-fondo', form) ? v('#r-fondo') : '';
    f.metodo_pago_id = $('#r-metodo', form) ? v('#r-metodo') : '';
    if ($('#r-tipo', form)) f.tipoPersona = v('#r-tipo');
    if ($('#r-detalle', form)) f.detalle = $('#r-detalle', form).checked;

    const salida = $('#salida', cont);
    const tipo = TIPOS.find((t) => t.id === f.tipo);
    if (tipo.filtros.includes('fecha') && !fechaValida(f.fecha)) return pintar(salida, alerta('error', 'Indique una fecha válida.'));
    if (tipo.filtros.includes('desde') && (!fechaValida(f.desde) || !fechaValida(f.hasta) || f.desde > f.hasta)) {
      return pintar(salida, alerta('error', 'Indique un rango de fechas válido (la fecha inicial no puede ser posterior a la final).'));
    }
    pintar(salida, html`<div class="cargando"><div class="spinner sm"></div><span>Generando reporte…</span></div>`);
    try {
      const reporte = await construir(tipo);
      mostrarReporte(salida, reporte);
    } catch (err) {
      pintar(salida, alerta('error', mensajeError(err)));
    }
  });
}

// ---------------------------------------------------------------------
// Construcción de reportes
// ---------------------------------------------------------------------
async function aportaciones(filtros) {
  const { data, error } = await sb.rpc('buscar_aportaciones', {
    p_filtros: filtros, p_limite: 50000, p_desplazamiento: 0, p_orden: 'fecha_asc',
  });
  if (error) throw error;
  if (data.total_filas > data.filas.length) {
    aviso(`El reporte tiene ${entero(data.total_filas)} registros; se muestran los primeros ${entero(data.filas.length)}. Reduzca el período.`, 'info');
  }
  return data.filas;
}

const nombreFondo = (id) => estado.fondos.find((x) => x.id === id)?.nombre;
const nombreMetodo = (id) => estado.metodos.find((x) => x.id === id)?.nombre;
const sumar = (filas) => filas.reduce((s, x) => s + aCentavos(x.monto), 0);
const pct = (c, total) => (total ? `${((c / total) * 100).toFixed(1)}%` : '0.0%');

function agrupar(filas, clave, etiqueta) {
  const mapa = new Map();
  for (const x of filas) {
    const k = clave(x);
    const g = mapa.get(k) || { clave: k, etiqueta: etiqueta(x), cantidad: 0, centavos: 0 };
    g.cantidad += 1;
    g.centavos += aCentavos(x.monto);
    mapa.set(k, g);
  }
  return [...mapa.values()].sort((a, b) => b.centavos - a.centavos);
}

function seccionAgrupada(titulo, encabezado, grupos, total) {
  return {
    titulo,
    columnas: [{ titulo: encabezado }, { titulo: 'Cantidad', alinear: 'derecha' }, { titulo: 'Total', alinear: 'derecha' }, { titulo: '% del total', alinear: 'derecha' }],
    filas: grupos.map((g) => [g.etiqueta, entero(g.cantidad), dineroCentavos(g.centavos), pct(g.centavos, total)]),
    csv: grupos.map((g) => [g.etiqueta, g.cantidad, g.centavos / 100, total ? Number(((g.centavos / total) * 100).toFixed(2)) : 0]),
    pie: ['TOTAL', entero(grupos.reduce((s, g) => s + g.cantidad, 0)), dineroCentavos(total), total ? '100.0%' : ''],
  };
}

function seccionDetalle(filas, titulo = 'Detalle de aportaciones') {
  const total = sumar(filas);
  return {
    titulo,
    columnas: [{ titulo: 'Fecha' }, { titulo: 'No. recibo' }, { titulo: 'No. miembro' }, { titulo: 'Miembro' },
      { titulo: 'Fondo' }, { titulo: 'Método' }, { titulo: 'Referencia' }, { titulo: 'Monto', alinear: 'derecha' }],
    filas: filas.map((x) => [fecha(x.fecha_aportacion), x.numero_recibo, x.numero_miembro, `${x.miembro_nombre} ${x.miembro_apellido}`,
      x.fondo_nombre, x.metodo_pago_nombre, x.referencia_pago || '', dinero(x.monto)]),
    csv: filas.map((x) => [x.fecha_aportacion, x.numero_recibo, x.numero_miembro, `${x.miembro_nombre} ${x.miembro_apellido}`,
      x.fondo_nombre, x.metodo_pago_nombre, x.referencia_pago || '', Number(x.monto)]),
    pie: ['TOTAL', '', '', `${entero(filas.length)} aportación(es)`, '', '', '', dineroCentavos(total)],
  };
}

function resumenBasico(filas) {
  const total = sumar(filas);
  return [
    { etiqueta: 'Total válido', valor: dineroCentavos(total) },
    { etiqueta: 'Aportaciones', valor: entero(filas.length) },
    { etiqueta: 'Donantes distintos', valor: entero(new Set(filas.map((x) => x.miembro_id)).size) },
    { etiqueta: 'Promedio', valor: dineroCentavos(filas.length ? Math.round(total / filas.length) : 0) },
  ];
}

function textoFiltros(extra = []) {
  const partes = [...extra];
  if (f.fondo_id) partes.push(`Fondo: ${nombreFondo(f.fondo_id)}`);
  if (f.metodo_pago_id) partes.push(`Método: ${nombreMetodo(f.metodo_pago_id)}`);
  return partes;
}

async function construir(tipo) {
  const base = { estado: 'REGISTRADA', fondo_id: f.fondo_id || null, metodo_pago_id: f.metodo_pago_id || null };
  const periodo = `Período: ${fecha(f.desde)} al ${fecha(f.hasta)}`;

  switch (tipo.id) {
    case 'dia':
    case 'rango': {
      const desde = tipo.id === 'dia' ? f.fecha : f.desde;
      const hasta = tipo.id === 'dia' ? f.fecha : f.hasta;
      const filas = await aportaciones({ ...base, desde, hasta });
      const total = sumar(filas);
      return {
        titulo: tipo.id === 'dia' ? `Aportaciones del día ${fecha(desde)}` : 'Aportaciones por rango de fechas',
        subtitulo: [...textoFiltros(tipo.id === 'dia' ? [] : [`Período: ${fecha(desde)} al ${fecha(hasta)}`]), NOTA_VALIDAS].join(' · '),
        resumen: resumenBasico(filas),
        horizontal: true,
        secciones: [
          seccionAgrupada('Resumen por fondo', 'Fondo', agrupar(filas, (x) => x.fondo_id, (x) => x.fondo_nombre), total),
          seccionAgrupada('Resumen por método de pago', 'Método', agrupar(filas, (x) => x.metodo_pago_id, (x) => x.metodo_pago_nombre), total),
          seccionDetalle(filas),
        ],
        archivo: `reporte-${tipo.id}-${desde}${desde !== hasta ? `-a-${hasta}` : ''}`,
      };
    }
    case 'mensual': {
      const desde = `${f.anio}-${String(f.mes).padStart(2, '0')}-01`;
      const hasta = finMes(desde);
      const filas = await aportaciones({ ...base, metodo_pago_id: null, desde, hasta });
      const total = sumar(filas);
      return {
        titulo: `Aportaciones de ${MESES[f.mes - 1]} ${f.anio}`,
        subtitulo: [...textoFiltros(), NOTA_VALIDAS].join(' · '),
        resumen: resumenBasico(filas),
        horizontal: true,
        secciones: [
          seccionAgrupada('Resumen por fondo', 'Fondo', agrupar(filas, (x) => x.fondo_id, (x) => x.fondo_nombre), total),
          seccionAgrupada('Resumen por método de pago', 'Método', agrupar(filas, (x) => x.metodo_pago_id, (x) => x.metodo_pago_nombre), total),
          seccionDetalle(filas),
        ],
        archivo: `reporte-mensual-${desde.slice(0, 7)}`,
      };
    }
    case 'anual': {
      const filas = await aportaciones({ ...base, metodo_pago_id: null, desde: `${f.anio}-01-01`, hasta: `${f.anio}-12-31` });
      const total = sumar(filas);
      const meses = MESES.map((m, i) => {
        const delMes = filas.filter((x) => Number(x.fecha_aportacion.slice(5, 7)) === i + 1);
        return { etiqueta: capitalizar(m), cantidad: delMes.length, centavos: sumar(delMes) };
      });
      const secciones = [
        seccionAgrupada('Resumen por mes', 'Mes', meses, total),
        seccionAgrupada('Resumen por fondo', 'Fondo', agrupar(filas, (x) => x.fondo_id, (x) => x.fondo_nombre), total),
        seccionAgrupada('Resumen por método de pago', 'Método', agrupar(filas, (x) => x.metodo_pago_id, (x) => x.metodo_pago_nombre), total),
      ];
      if (f.detalle) secciones.push(seccionDetalle(filas));
      return {
        titulo: `Aportaciones del año ${f.anio}`,
        subtitulo: [...textoFiltros(), NOTA_VALIDAS].join(' · '),
        resumen: resumenBasico(filas),
        horizontal: f.detalle,
        secciones,
        archivo: `reporte-anual-${f.anio}`,
      };
    }
    case 'miembro': {
      const filasRango = await aportaciones({ ...base, metodo_pago_id: null, desde: f.desde, hasta: f.hasta });
      const total = sumar(filasRango);
      const grupos = agrupar(filasRango, (x) => x.miembro_id, (x) => x);
      return {
        titulo: 'Aportaciones por miembro',
        subtitulo: [...textoFiltros([periodo]), NOTA_VALIDAS].join(' · '),
        resumen: resumenBasico(filasRango),
        secciones: [{
          titulo: 'Totales por miembro/donante',
          columnas: [{ titulo: 'No. miembro' }, { titulo: 'Miembro/donante' }, { titulo: 'Cantidad', alinear: 'derecha' },
            { titulo: 'Total', alinear: 'derecha' }, { titulo: '% del total', alinear: 'derecha' }],
          filas: grupos.map((g) => [g.etiqueta.numero_miembro, apellidoNombre(g.etiqueta),
            entero(g.cantidad), dineroCentavos(g.centavos), pct(g.centavos, total)]),
          csv: grupos.map((g) => [g.etiqueta.numero_miembro, apellidoNombre(g.etiqueta),
            g.cantidad, g.centavos / 100, total ? Number(((g.centavos / total) * 100).toFixed(2)) : 0]),
          pie: ['TOTAL', `${entero(grupos.length)} donante(s)`, entero(filasRango.length), dineroCentavos(total), total ? '100.0%' : ''],
        }],
        archivo: `reporte-por-miembro-${f.desde}-a-${f.hasta}`,
      };
    }
    case 'fondo':
    case 'metodo': {
      const filas = await aportaciones({ estado: 'REGISTRADA', desde: f.desde, hasta: f.hasta });
      const total = sumar(filas);
      const porFondo = tipo.id === 'fondo';
      const grupos = porFondo
        ? agrupar(filas, (x) => x.fondo_id, (x) => x.fondo_nombre)
        : agrupar(filas, (x) => x.metodo_pago_id, (x) => x.metodo_pago_nombre);
      const secciones = [seccionAgrupada(porFondo ? 'Totales por fondo' : 'Totales por método de pago', porFondo ? 'Fondo' : 'Método', grupos, total)];
      if (f.detalle) {
        for (const g of grupos) {
          const delGrupo = filas.filter((x) => (porFondo ? x.fondo_id : x.metodo_pago_id) === g.clave);
          secciones.push(seccionDetalle(delGrupo, `Detalle: ${g.etiqueta}`));
        }
      }
      return {
        titulo: porFondo ? 'Aportaciones por fondo' : 'Aportaciones por método de pago',
        subtitulo: [periodo, NOTA_VALIDAS].join(' · '),
        resumen: resumenBasico(filas),
        horizontal: f.detalle,
        secciones,
        archivo: `reporte-por-${tipo.id}-${f.desde}-a-${f.hasta}`,
      };
    }
    case 'anuladas': {
      const filas = await aportaciones({ estado: 'NO_VALIDAS', desde: f.desde, hasta: f.hasta });
      return {
        titulo: 'Aportaciones anuladas y corregidas',
        subtitulo: `Por fecha de la aportación · ${periodo} · Estos montos no se incluyen en ningún total.`,
        resumen: [
          { etiqueta: 'Registros', valor: entero(filas.length) },
          { etiqueta: 'Monto no válido', valor: dineroCentavos(sumar(filas)) },
          { etiqueta: 'Anuladas', valor: entero(filas.filter((x) => x.estado === 'ANULADA').length) },
          { etiqueta: 'Corregidas', valor: entero(filas.filter((x) => x.estado === 'CORREGIDA').length) },
        ],
        horizontal: true,
        secciones: [{
          titulo: 'Detalle',
          columnas: [{ titulo: 'No. recibo' }, { titulo: 'Fecha' }, { titulo: 'Miembro' }, { titulo: 'Fondo' }, { titulo: 'Monto', alinear: 'derecha' },
            { titulo: 'Estado' }, { titulo: 'Anulada el' }, { titulo: 'Por' }, { titulo: 'Motivo' }, { titulo: 'Reemplazada por' }],
          filas: filas.map((x) => [x.numero_recibo, fecha(x.fecha_aportacion), `${x.miembro_nombre} ${x.miembro_apellido}`, x.fondo_nombre,
            dinero(x.monto), capitalizar(x.estado.toLowerCase()), fechaHora(x.anulada_at), x.anulada_por_email || '',
            x.motivo_anulacion || '', x.corregida_por_numero_recibo || '']),
          csv: filas.map((x) => [x.numero_recibo, x.fecha_aportacion, `${x.miembro_nombre} ${x.miembro_apellido}`, x.fondo_nombre,
            Number(x.monto), x.estado, x.anulada_at, x.anulada_por_email || '', x.motivo_anulacion || '', x.corregida_por_numero_recibo || '']),
        }],
        archivo: `reporte-anuladas-${f.desde}-a-${f.hasta}`,
      };
    }
    case 'miembros_activos':
    case 'miembros_inactivos': {
      const activos = tipo.id === 'miembros_activos';
      const miembros = await obtenerTodos(() => {
        let q = sb.from('miembros')
          .select('id, numero_miembro, nombre, apellido, tipo_persona, telefono, email, direccion, ciudad, estado, zip, fecha_ingreso')
          .eq('activo', activos).order('apellido').order('nombre').order('id');
        if (f.tipoPersona) q = q.eq('tipo_persona', f.tipoPersona);
        return q;
      });
      const porTipo = ['Miembro', 'Donante', 'Visitante', 'Otro'].map((t) => ({ etiqueta: t, n: miembros.filter((m) => m.tipo_persona === t).length }));
      return {
        titulo: activos ? 'Miembros y donantes activos' : 'Miembros y donantes inactivos',
        subtitulo: f.tipoPersona ? `Tipo: ${f.tipoPersona}` : 'Todos los tipos',
        resumen: [{ etiqueta: 'Total', valor: entero(miembros.length) }, ...porTipo.filter((t) => t.n).map((t) => ({ etiqueta: t.etiqueta, valor: entero(t.n) }))],
        horizontal: true,
        secciones: [{
          titulo: null,
          columnas: [{ titulo: 'Número' }, { titulo: 'Apellido' }, { titulo: 'Nombre' }, { titulo: 'Tipo' }, { titulo: 'Teléfono' },
            { titulo: 'Email' }, { titulo: 'Ciudad' }, { titulo: 'Ingreso' }],
          filas: miembros.map((m) => [m.numero_miembro, m.apellido, m.nombre, m.tipo_persona, m.telefono || '', m.email || '', m.ciudad || '', fecha(m.fecha_ingreso)]),
          csv: miembros.map((m) => [m.numero_miembro, m.apellido, m.nombre, m.tipo_persona, m.telefono || '', m.email || '',
            m.direccion || '', m.ciudad || '', m.estado || '', m.zip || '', m.fecha_ingreso || '']),
          csvColumnas: ['Número', 'Apellido', 'Nombre', 'Tipo', 'Teléfono', 'Email', 'Dirección', 'Ciudad', 'Estado', 'ZIP', 'Fecha de ingreso'],
        }],
        archivo: activos ? 'miembros-activos' : 'miembros-inactivos',
      };
    }
    default:
      throw new Error('Reporte no disponible.');
  }
}

// ---------------------------------------------------------------------
// Presentación y exportación
// ---------------------------------------------------------------------
function mostrarReporte(el, r) {
  pintar(el, html`
    <section class="tarjeta">
      <div class="tarjeta-titulo">
        <div><h2>${r.titulo}</h2>${r.subtitulo ? html`<div class="texto-tenue texto-pequeno">${r.subtitulo}</div>` : ''}</div>
        <div class="acciones">
          <button type="button" class="btn btn-primario" id="rep-pdf">${icono('eye')} Vista PDF</button>
          <button type="button" class="btn" id="rep-descargar">${icono('download')} PDF</button>
          <button type="button" class="btn" id="rep-csv">${icono('download')} CSV (Excel)</button>
        </div>
      </div>
      ${r.resumen?.length ? html`<dl class="resumen-kpi">${r.resumen.map((x) => html`<div><dt>${x.etiqueta}</dt><dd>${x.valor}</dd></div>`)}</dl>` : ''}
      ${r.secciones.map((s) => html`
        ${s.titulo ? html`<div class="seccion-titulo">${s.titulo}</div>` : ''}
        <div class="tabla-contenedor">
          <table class="tabla tabla-compacta">
            <thead><tr>${s.columnas.map((c) => html`<th class="${c.alinear === 'derecha' ? 'num' : ''}">${c.titulo}</th>`)}</tr></thead>
            <tbody>${s.filas.length
              ? s.filas.slice(0, 2000).map((fila) => html`<tr>${fila.map((v, i) => html`<td class="${s.columnas[i].alinear === 'derecha' ? 'num' : ''}">${v}</td>`)}</tr>`)
              : html`<tr><td colspan="${s.columnas.length}" class="tabla-vacia">Sin datos para los filtros seleccionados.</td></tr>`}
            </tbody>
            ${s.pie ? html`<tfoot><tr>${s.pie.map((v, i) => html`<td class="${s.columnas[i].alinear === 'derecha' ? 'num' : ''}">${v}</td>`)}</tr></tfoot>` : ''}
          </table>
        </div>
        ${s.filas.length > 2000 ? html`<p class="texto-tenue texto-pequeno mt-1">En pantalla se muestran 2,000 filas; el PDF y el CSV incluyen todas (${entero(s.filas.length)}).</p>` : ''}`)}
    </section>`);

  const nombreArchivo = `${r.archivo}-${marcaArchivo()}`;
  const evento = (formato) => registrarEvento('GENERAR_REPORTE', { descripcion: `${r.titulo} (${formato})${r.subtitulo ? ` — ${r.subtitulo}` : ''}` });

  $('#rep-pdf', el).addEventListener('click', async () => {
    try {
      mostrarPDF(await pdfReporte(r), `${nombreArchivo}.pdf`, { titulo: r.titulo });
      evento('PDF');
    } catch (err) { aviso(mensajeError(err), 'error'); }
  });
  $('#rep-descargar', el).addEventListener('click', async () => {
    try {
      descargarPDF(await pdfReporte(r), `${nombreArchivo}.pdf`);
      evento('PDF');
    } catch (err) { aviso(mensajeError(err), 'error'); }
  });
  $('#rep-csv', el).addEventListener('click', () => {
    const filas = [[r.titulo], ...(r.subtitulo ? [[r.subtitulo]] : []), []];
    for (const s of r.secciones) {
      if (s.titulo) filas.push([s.titulo]);
      filas.push(s.csvColumnas || s.columnas.map((c) => c.titulo));
      filas.push(...s.csv);
      filas.push([]);
    }
    descargarCSV(`${nombreArchivo}.csv`, filas[0], filas.slice(1));
    evento('CSV');
  });
}
