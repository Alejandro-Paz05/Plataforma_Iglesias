// Cartas anuales de contribuciones: individual, por lote y archivo.
import { sb } from '../supabase.js';
import { estado, registrarEvento } from '../state.js';
import {
  html, pintar, $, $$, alerta, aviso, mensajeError, dineroCentavos, aCentavos, entero, fechaHora, hoyISO,
  anioActual, nombreCompleto, obtenerTodos, descargarCSV, descargarBlob, marcaArchivo,
} from '../utils.js';
import { icono } from '../icons.js';
import { selectorMiembro, cargarMiembro, opciones, COLUMNAS_MIEMBRO } from '../components.js';
import { pdfCartaAnual, pdfCartasLote, mostrarPDF, descargarPDF } from '../pdf.js';

const PLANTILLAS = [
  { valor: 'auto', texto: 'Automática (según existan bienes o servicios)' },
  { valor: 'sin', texto: 'Sin bienes o servicios' },
  { valor: 'con', texto: 'Con bienes o servicios' },
];

function anioPredeterminado() {
  // De enero a abril se suelen emitir las cartas del año anterior.
  const hoy = hoyISO();
  const mes = Number(hoy.slice(5, 7));
  return mes <= 4 ? anioActual() - 1 : anioActual();
}

function aniosDisponibles() {
  const a = anioActual();
  return Array.from({ length: 11 }, (_, i) => ({ valor: a - i, texto: String(a - i) }));
}

// Reemplaza {marcadores} en una plantilla.
export function aplicarPlantilla(texto, valores) {
  return String(texto || '').replace(/\{(\w+)\}/g, (m, clave) => (clave in valores ? valores[clave] : m));
}

// Resume las aportaciones válidas de un año para un miembro.
function resumir(filas) {
  const porFondo = new Map();
  let totalCentavos = 0;
  let valorBienes = 0;
  const descripciones = new Set();
  for (const f of filas) {
    const c = aCentavos(f.monto);
    totalCentavos += c;
    const r = porFondo.get(f.fondo_nombre) || { fondo: f.fondo_nombre, cantidad: 0, centavos: 0 };
    r.cantidad += 1;
    r.centavos += c;
    porFondo.set(f.fondo_nombre, r);
    if (f.bienes_servicios) {
      valorBienes += aCentavos(f.valor_bienes_servicios);
      if (f.descripcion_bienes_servicios) descripciones.add(f.descripcion_bienes_servicios);
    }
  }
  return {
    totalCentavos,
    resumenFondos: [...porFondo.values()].sort((a, b) => b.centavos - a.centavos),
    bienes: { hay: filas.some((f) => f.bienes_servicios), valorCentavos: valorBienes, descripciones: [...descripciones] },
  };
}

function textosCarta(miembro, anio, resumen, plantilla) {
  const cfg = estado.config;
  const conBienes = plantilla === 'con' || (plantilla === 'auto' && resumen.bienes.hay);
  const valores = {
    nombre_donante: nombreCompleto(miembro),
    numero_miembro: miembro.numero_miembro,
    anio: String(anio),
    total: dineroCentavos(resumen.totalCentavos),
    valor_bienes: dineroCentavos(resumen.bienes.valorCentavos),
    total_deducible: dineroCentavos(Math.max(0, resumen.totalCentavos - resumen.bienes.valorCentavos)),
    descripcion_bienes: resumen.bienes.descripciones.join(', ') || 'bienes o servicios',
    nombre_iglesia: cfg.nombre_iglesia,
  };
  return {
    conBienes,
    cuerpo: aplicarPlantilla(conBienes ? cfg.texto_carta_con_bienes : cfg.texto_carta_sin_bienes, valores),
    cierre: aplicarPlantilla(cfg.texto_carta_cierre, valores),
  };
}

// ---------------------------------------------------------------------
export async function render({ cont, query, titulo }) {
  titulo('Cartas anuales');
  pintar(cont, html`
    <div class="cabecera">
      <div><h2>Cartas anuales de contribuciones</h2>
        <p>Constancia anual de las aportaciones válidas de cada donante. Los textos se configuran en
           <a href="#/configuracion">Configuración</a>.</p></div>
    </div>
    <div class="pestanas" role="tablist">
      <button type="button" class="pestana activa" role="tab" aria-selected="true" data-tab="individual">Carta individual</button>
      <button type="button" class="pestana" role="tab" aria-selected="false" data-tab="lote">Generación por lote</button>
    </div>
    <div id="tab-individual"></div>
    <div id="tab-lote" hidden></div>`);

  $$('[data-tab]', cont).forEach((b) => b.addEventListener('click', () => {
    $$('[data-tab]', cont).forEach((x) => {
      x.classList.toggle('activa', x === b);
      x.setAttribute('aria-selected', String(x === b));
    });
    $('#tab-individual', cont).hidden = b.dataset.tab !== 'individual';
    $('#tab-lote', cont).hidden = b.dataset.tab !== 'lote';
  }));

  const miembroInicial = query.get('miembro') ? await cargarMiembro(query.get('miembro')) : null;
  individual($('#tab-individual', cont), miembroInicial, Number(query.get('anio')) || anioPredeterminado());
  lote($('#tab-lote', cont));
}

// ---------------------------------------------------------------------
// Carta individual
// ---------------------------------------------------------------------
function individual(el, miembroInicial, anioInicial) {
  pintar(el, html`
    <form class="tarjeta formulario" id="form-carta" novalidate>
      <div class="campo">
        <label class="requerido" for="selector-miembro">Miembro / donante</label>
        <div id="miembro"></div>
      </div>
      <div class="fila-campos">
        <div class="campo"><label for="anio">Año</label><select id="anio" class="entrada">${opciones(aniosDisponibles(), anioInicial)}</select></div>
        <div class="campo"><label for="fecha-carta">Fecha de la carta</label><input id="fecha-carta" type="date" class="entrada" value="${hoyISO()}"></div>
        <div class="campo"><label for="plantilla">Plantilla de texto</label><select id="plantilla" class="entrada">${opciones(PLANTILLAS, 'auto')}</select></div>
      </div>
      <label class="casilla"><input type="checkbox" id="con-detalle"> Incluir el detalle de cada aportación (además del resumen por fondo)</label>
      <div id="mensaje"></div>
      <div class="acciones"><button type="submit" class="btn btn-primario">${icono('file-text')} Preparar carta</button></div>
    </form>
    <div id="carta" class="mt-2"></div>`);

  const selector = selectorMiembro($('#miembro', el), { inicial: miembroInicial, soloActivos: false });

  $('#form-carta', el).addEventListener('submit', async (e) => {
    e.preventDefault();
    const miembro = selector.obtener();
    if (!miembro) {
      pintar($('#mensaje', el), alerta('error', 'Seleccione el miembro o donante.'));
      return;
    }
    pintar($('#mensaje', el), '');
    const anio = Number($('#anio', el).value);
    const plantilla = $('#plantilla', el).value;
    const conDetalle = $('#con-detalle', el).checked;
    const fechaCarta = $('#fecha-carta', el).value || hoyISO();
    const zona = $('#carta', el);
    zona.style.opacity = '.6';
    const { data, error } = await sb.rpc('buscar_aportaciones', {
      p_filtros: { miembro_id: miembro.id, desde: `${anio}-01-01`, hasta: `${anio}-12-31`, estado: 'REGISTRADA' },
      p_limite: 50000, p_desplazamiento: 0, p_orden: 'fecha_asc',
    });
    zona.style.opacity = '';
    if (error) {
      pintar(zona, alerta('error', mensajeError(error)));
      return;
    }
    const filas = data.filas;
    if (!filas.length) {
      pintar(zona, alerta('advertencia', html`${nombreCompleto(miembro)} no tiene aportaciones válidas registradas en ${anio}.`));
      return;
    }
    const resumen = resumir(filas);
    const textos = textosCarta(miembro, anio, resumen, plantilla);
    prepararCarta(zona, { miembro, anio, fechaCarta, filas, resumen, textos, conDetalle });
  });

  if (miembroInicial) $('#form-carta', el).requestSubmit();
}

function prepararCarta(zona, { miembro, anio, fechaCarta, filas, resumen, textos, conDetalle }) {
  pintar(zona, html`
    <div class="rejilla rejilla-2-1">
      <section class="tarjeta">
        <div class="tarjeta-titulo"><h3>Texto de la carta</h3><span class="insignia ${textos.conBienes ? 'ambar' : ''}">
          ${textos.conBienes ? 'Plantilla: con bienes o servicios' : 'Plantilla: sin bienes o servicios'}</span></div>
        <div class="formulario">
          <div class="campo">
            <label for="cuerpo">Cuerpo (antes del resumen)</label>
            <textarea id="cuerpo" class="entrada" rows="12">${textos.cuerpo}</textarea>
          </div>
          <div class="campo">
            <label for="cierre">Cierre (después del resumen, antes de la firma)</label>
            <textarea id="cierre" class="entrada" rows="5">${textos.cierre}</textarea>
            <div class="ayuda">Puede ajustar la redacción solo para esta carta. Los textos predeterminados se editan en Configuración.</div>
          </div>
        </div>
      </section>
      <section class="tarjeta">
        <div class="tarjeta-titulo"><h3>Resumen ${anio}</h3></div>
        <p><strong>${nombreCompleto(miembro)}</strong><br><span class="mono texto-tenue">${miembro.numero_miembro}</span></p>
        <div class="tabla-contenedor">
          <table class="tabla tabla-compacta">
            <thead><tr><th>Fondo</th><th class="num">Cant.</th><th class="dinero">Total</th></tr></thead>
            <tbody>${resumen.resumenFondos.map((r) => html`<tr><td>${r.fondo}</td><td class="num">${entero(r.cantidad)}</td><td class="dinero">${dineroCentavos(r.centavos)}</td></tr>`)}</tbody>
            <tfoot><tr><td>Total anual</td><td class="num">${entero(filas.length)}</td><td class="dinero">${dineroCentavos(resumen.totalCentavos)}</td></tr></tfoot>
          </table>
        </div>
        ${resumen.bienes.hay ? alerta('advertencia', html`Se registraron bienes o servicios por
          <strong>${dineroCentavos(resumen.bienes.valorCentavos)}</strong> (${resumen.bienes.descripciones.join(', ')}).`) : ''}
        <div class="acciones mt-2">
          <button type="button" class="btn btn-primario" id="vista">${icono('eye')} Vista previa</button>
          <button type="button" class="btn" id="imprimir">${icono('printer')} Imprimir</button>
          <button type="button" class="btn" id="descargar">${icono('download')} Descargar PDF</button>
          <button type="button" class="btn" id="archivar">${icono('archive')} Archivar copia</button>
        </div>
        <div id="archivo" class="mt-2"></div>
      </section>
    </div>`);

  const nombre = `Carta-anual-${anio}-${miembro.numero_miembro}.pdf`;
  const generar = async () => {
    const { doc } = await pdfCartaAnual({
      miembro, anio, fechaCarta,
      cuerpo: $('#cuerpo', zona).value,
      cierre: $('#cierre', zona).value,
      resumenFondos: resumen.resumenFondos,
      totalCentavos: resumen.totalCentavos,
      bienes: resumen.bienes,
      detalle: conDetalle ? filas : null,
    });
    registrarEvento('GENERAR_CARTA_ANUAL', {
      tabla: 'miembros', registroId: miembro.id,
      descripcion: `Carta anual ${anio} — ${miembro.numero_miembro} ${nombreCompleto(miembro)} (${dineroCentavos(resumen.totalCentavos)})`,
    });
    return doc;
  };
  const seguro = (fn) => async (e) => {
    const b = e.currentTarget;
    b.disabled = true;
    try { await fn(); } catch (err) { aviso(mensajeError(err), 'error'); } finally { b.disabled = false; }
  };
  $('#vista', zona).addEventListener('click', seguro(async () => mostrarPDF(await generar(), nombre, { titulo: `Carta anual ${anio}` })));
  $('#imprimir', zona).addEventListener('click', seguro(async () => mostrarPDF(await generar(), nombre, { titulo: `Carta anual ${anio}`, imprimir: true })));
  $('#descargar', zona).addEventListener('click', seguro(async () => descargarPDF(await generar(), nombre)));
  $('#archivar', zona).addEventListener('click', seguro(async () => {
    const doc = await generar();
    const ruta = `cartas-anuales/${anio}/${miembro.numero_miembro}_${marcaArchivo()}.pdf`;
    const { error } = await sb.storage.from('documentos').upload(ruta, doc.output('blob'), { contentType: 'application/pdf', upsert: false });
    if (error) throw error;
    registrarEvento('ARCHIVAR_DOCUMENTO', { tabla: 'miembros', registroId: miembro.id, descripcion: `Carta anual archivada: ${ruta}` });
    aviso('Copia archivada de forma privada.');
    listarArchivo($('#archivo', zona), anio, miembro);
  }));
  listarArchivo($('#archivo', zona), anio, miembro);
}

async function listarArchivo(el, anio, miembro) {
  const { data, error } = await sb.storage.from('documentos').list(`cartas-anuales/${anio}`, {
    search: miembro.numero_miembro, sortBy: { column: 'created_at', order: 'desc' }, limit: 20,
  });
  if (error || !data?.length) {
    pintar(el, error ? html`<p class="texto-tenue texto-pequeno">Archivo no disponible: ${mensajeError(error)}</p>` : '');
    return;
  }
  pintar(el, html`
    <div class="seccion-titulo mt-0">Copias archivadas</div>
    <ul style="margin:0;padding-left:18px">
      ${data.map((f) => html`<li><button type="button" class="btn btn-texto" data-archivo="${f.name}">${f.name}</button>
        <span class="texto-tenue texto-pequeno">${fechaHora(f.created_at)}</span></li>`)}
    </ul>`);
  $$('[data-archivo]', el).forEach((b) => b.addEventListener('click', async () => {
    const { data: blob, error: err } = await sb.storage.from('documentos').download(`cartas-anuales/${anio}/${b.dataset.archivo}`);
    if (err) return aviso(mensajeError(err), 'error');
    descargarBlob(blob, b.dataset.archivo);
  }));
}

// ---------------------------------------------------------------------
// Generación por lote
// ---------------------------------------------------------------------
function lote(el) {
  pintar(el, html`
    <form class="tarjeta formulario" id="form-lote" novalidate>
      ${alerta('info', 'Genera un solo PDF con una carta por cada donante que tenga aportaciones válidas en el año seleccionado, usando los textos de Configuración.')}
      <div class="fila-campos">
        <div class="campo"><label for="l-anio">Año</label><select id="l-anio" class="entrada">${opciones(aniosDisponibles(), anioPredeterminado())}</select></div>
        <div class="campo"><label for="l-fecha">Fecha de las cartas</label><input id="l-fecha" type="date" class="entrada" value="${hoyISO()}"></div>
        <div class="campo"><label for="l-plantilla">Plantilla</label><select id="l-plantilla" class="entrada">${opciones(PLANTILLAS, 'auto')}</select></div>
      </div>
      <label class="casilla"><input type="checkbox" id="l-detalle"> Incluir el detalle de cada aportación</label>
      <div class="acciones"><button type="submit" class="btn btn-primario" id="l-generar">${icono('mail')} Preparar cartas</button></div>
    </form>
    <div id="l-resultado" class="mt-2"></div>`);

  $('#form-lote', el).addEventListener('submit', async (e) => {
    e.preventDefault();
    const anio = Number($('#l-anio', el).value);
    const plantilla = $('#l-plantilla', el).value;
    const fechaCarta = $('#l-fecha', el).value || hoyISO();
    const conDetalle = $('#l-detalle', el).checked;
    const res = $('#l-resultado', el);
    const boton = $('#l-generar', el);
    boton.disabled = true;
    pintar(res, html`<div class="cargando"><div class="spinner sm"></div><span>Consultando aportaciones de ${anio}…</span></div>`);

    try {
      const { data, error } = await sb.rpc('buscar_aportaciones', {
        p_filtros: { desde: `${anio}-01-01`, hasta: `${anio}-12-31`, estado: 'REGISTRADA' },
        p_limite: 50000, p_desplazamiento: 0, p_orden: 'fecha_asc',
      });
      if (error) throw error;
      const porMiembro = new Map();
      for (const f of data.filas) {
        if (!porMiembro.has(f.miembro_id)) porMiembro.set(f.miembro_id, []);
        porMiembro.get(f.miembro_id).push(f);
      }
      if (!porMiembro.size) {
        pintar(res, alerta('advertencia', `No hay aportaciones válidas registradas en ${anio}.`));
        return;
      }
      const miembros = await obtenerTodos(() => sb.from('miembros').select(COLUMNAS_MIEMBRO).order('id'));
      const mapa = new Map(miembros.map((m) => [m.id, m]));
      const cartas = [...porMiembro.entries()]
        .map(([id, filas]) => {
          const miembro = mapa.get(id);
          const resumen = resumir(filas);
          const textos = textosCarta(miembro, anio, resumen, plantilla);
          return {
            miembro, anio, fechaCarta, cuerpo: textos.cuerpo, cierre: textos.cierre, conBienes: textos.conBienes,
            resumenFondos: resumen.resumenFondos, totalCentavos: resumen.totalCentavos, bienes: resumen.bienes,
            detalle: conDetalle ? filas : null, cantidad: filas.length,
          };
        })
        .sort((a, b) => `${a.miembro.apellido} ${a.miembro.nombre}`.localeCompare(`${b.miembro.apellido} ${b.miembro.nombre}`, 'es'));
      const total = cartas.reduce((s, c) => s + c.totalCentavos, 0);

      pintar(res, html`
        <section class="tarjeta">
          <div class="tarjeta-titulo">
            <h3>${entero(cartas.length)} carta(s) · año ${anio} <span class="sub">· total ${dineroCentavos(total)}</span></h3>
            <div class="acciones">
              <button type="button" class="btn btn-primario" id="l-pdf">${icono('download')} Generar PDF</button>
              <button type="button" class="btn" id="l-csv">${icono('download')} Resumen CSV</button>
            </div>
          </div>
          <div class="tabla-contenedor">
            <table class="tabla tabla-compacta">
              <thead><tr><th>Número</th><th>Donante</th><th>Dirección</th><th class="num">Aportaciones</th><th class="dinero">Total</th><th>Plantilla</th></tr></thead>
              <tbody>${cartas.map((c) => html`<tr>
                <td class="mono nowrap">${c.miembro.numero_miembro}</td>
                <td>${nombreCompleto(c.miembro)}</td>
                <td>${c.miembro.direccion ? '' : html`<span class="insignia ambar">Sin dirección</span>`} ${c.miembro.direccion || ''}</td>
                <td class="num">${entero(c.cantidad)}</td>
                <td class="dinero">${dineroCentavos(c.totalCentavos)}</td>
                <td>${c.conBienes ? 'Con bienes/servicios' : 'Sin bienes/servicios'}</td></tr>`)}
              </tbody>
            </table>
          </div>
          <div id="l-progreso" class="mt-2"></div>
        </section>`);

      $('#l-csv', res).addEventListener('click', () => {
        descargarCSV(`cartas-anuales-${anio}.csv`, ['Número', 'Nombre', 'Apellido', 'Dirección', 'Ciudad', 'Estado', 'ZIP', 'Email', 'Aportaciones', 'Total', 'Plantilla'],
          cartas.map((c) => [c.miembro.numero_miembro, c.miembro.nombre, c.miembro.apellido, c.miembro.direccion, c.miembro.ciudad,
            c.miembro.estado, c.miembro.zip, c.miembro.email, c.cantidad, c.totalCentavos / 100, c.conBienes ? 'Con bienes' : 'Sin bienes']));
      });
      $('#l-pdf', res).addEventListener('click', async (ev) => {
        const b = ev.currentTarget;
        b.disabled = true;
        pintar($('#l-progreso', res), html`<div class="cargando"><div class="spinner sm"></div><span>Generando ${entero(cartas.length)} cartas…</span></div>`);
        try {
          await new Promise((r) => setTimeout(r, 30));
          const doc = await pdfCartasLote(cartas);
          registrarEvento('GENERAR_CARTA_ANUAL', {
            descripcion: `Lote de ${cartas.length} cartas anuales ${anio} (total ${dineroCentavos(total)})`,
          });
          pintar($('#l-progreso', res), '');
          mostrarPDF(doc, `Cartas-anuales-${anio}.pdf`, { titulo: `Cartas anuales ${anio}` });
        } catch (err) {
          pintar($('#l-progreso', res), alerta('error', mensajeError(err)));
        } finally {
          b.disabled = false;
        }
      });
    } catch (err) {
      pintar(res, alerta('error', mensajeError(err)));
    } finally {
      boton.disabled = false;
    }
  });
}
