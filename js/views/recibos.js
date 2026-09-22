// Recibos: búsqueda, vista previa, PDF individual y por lote.
import { sb } from '../supabase.js';
import { registrarEvento } from '../state.js';
import {
  html, pintar, $, $$, aviso, alerta, mensajeError, retrasar, normalizarBusqueda, dinero, entero, fecha,
  hoyISO, sumarDias, marcaArchivo,
} from '../utils.js';
import { icono } from '../icons.js';
import { insigniaEstado, cargarMiembro } from '../components.js';
import { pdfRecibo, pdfRecibosLote, mostrarPDF, descargarPDF } from '../pdf.js';

const LIMITE_LOTE = 200;
const filtros = { texto: '', desde: sumarDias(hoyISO(), -30), hasta: hoyISO(), soloValidos: true };

export async function render({ cont, titulo }) {
  titulo('Recibos');
  pintar(cont, html`
    <div class="cabecera">
      <div><h2>Recibos</h2><p>Consulte, imprima o descargue el recibo de cualquier aportación.</p></div>
      <div class="acciones">
        <button type="button" class="btn" id="lote">${icono('printer')} PDF de todos los recibos listados</button>
      </div>
    </div>
    <form class="filtros" id="filtros" role="search">
      <div class="campo ancho"><label for="r-texto">Número de recibo o miembro</label>
        <input id="r-texto" class="entrada" type="search" value="${filtros.texto}" placeholder="Ej.: EBE-2026-000123 o Pérez"></div>
      <div class="campo"><label for="r-desde">Desde</label><input id="r-desde" class="entrada" type="date" value="${filtros.desde}"></div>
      <div class="campo"><label for="r-hasta">Hasta</label><input id="r-hasta" class="entrada" type="date" value="${filtros.hasta}"></div>
      <div class="campo" style="flex:0 0 auto"><label class="casilla"><input type="checkbox" id="r-validos" ${filtros.soloValidos ? 'checked' : ''}> Solo válidos</label></div>
    </form>
    <div id="lista"></div>`);

  const recargar = () => cargar();
  $('#r-texto', cont).addEventListener('input', retrasar((e) => { filtros.texto = e.target.value; recargar(); }, 350));
  $('#r-desde', cont).addEventListener('change', (e) => { filtros.desde = e.target.value; recargar(); });
  $('#r-hasta', cont).addEventListener('change', (e) => { filtros.hasta = e.target.value; recargar(); });
  $('#r-validos', cont).addEventListener('change', (e) => { filtros.soloValidos = e.target.checked; recargar(); });
  $('#filtros', cont).addEventListener('submit', (e) => e.preventDefault());

  let filas = [];
  let solicitud = 0;

  async function cargar() {
    const n = ++solicitud;
    const cuadro = $('#lista', cont);
    cuadro.style.opacity = '.6';
    const { data, error } = await sb.rpc('buscar_aportaciones', {
      p_filtros: {
        texto: normalizarBusqueda(filtros.texto), desde: filtros.desde || null, hasta: filtros.hasta || null,
        estado: filtros.soloValidos ? 'REGISTRADA' : 'TODAS',
      },
      p_limite: LIMITE_LOTE, p_desplazamiento: 0, p_orden: 'fecha_desc',
    });
    if (n !== solicitud) return;
    cuadro.style.opacity = '';
    if (error) {
      pintar(cuadro, alerta('error', mensajeError(error)));
      return;
    }
    filas = data.filas;
    pintar(cuadro, html`
      <p class="texto-tenue texto-pequeno">${entero(data.total_filas)} recibo(s)${data.total_filas > LIMITE_LOTE ? ` · se muestran los ${LIMITE_LOTE} más recientes` : ''}.</p>
      <div class="tabla-contenedor">
        <table class="tabla">
          <thead><tr><th>Recibo</th><th>Fecha</th><th>Miembro</th><th>Fondo</th><th class="dinero">Monto</th><th>Estado</th><th></th></tr></thead>
          <tbody>
            ${filas.length ? filas.map((f, i) => html`
              <tr>
                <td class="mono nowrap"><a href="#/aportaciones/${f.id}">${f.numero_recibo}</a></td>
                <td class="nowrap">${fecha(f.fecha_aportacion)}</td>
                <td>${f.miembro_nombre} ${f.miembro_apellido} <span class="tenue texto-pequeno">${f.numero_miembro}</span></td>
                <td>${f.fondo_nombre}</td>
                <td class="dinero">${dinero(f.monto)}</td>
                <td>${insigniaEstado(f.estado)}</td>
                <td class="nowrap">
                  <button type="button" class="btn btn-texto" data-ver="${i}">${icono('eye')} Ver</button>
                  <button type="button" class="btn btn-texto" data-pdf="${i}">${icono('download')} PDF</button>
                </td>
              </tr>`) : html`<tr><td colspan="7" class="tabla-vacia">No hay recibos con los filtros seleccionados.</td></tr>`}
          </tbody>
        </table>
      </div>`);

    const generar = async (a) => {
      const doc = await pdfRecibo(a, await cargarMiembro(a.miembro_id));
      registrarEvento('GENERAR_RECIBO', { tabla: 'aportaciones', registroId: a.id, descripcion: `Recibo ${a.numero_recibo}` });
      return doc;
    };
    $$('[data-ver]', cuadro).forEach((b) => b.addEventListener('click', async () => {
      const a = filas[Number(b.dataset.ver)];
      mostrarPDF(await generar(a), `Recibo-${a.numero_recibo}.pdf`, { titulo: `Recibo ${a.numero_recibo}` });
    }));
    $$('[data-pdf]', cuadro).forEach((b) => b.addEventListener('click', async () => {
      const a = filas[Number(b.dataset.pdf)];
      descargarPDF(await generar(a), `Recibo-${a.numero_recibo}.pdf`);
    }));
  }

  $('#lote', cont).addEventListener('click', async (e) => {
    if (!filas.length) return aviso('No hay recibos para generar.', 'info');
    const b = e.currentTarget;
    b.disabled = true;
    try {
      const ordenados = [...filas].reverse();
      const doc = await pdfRecibosLote(ordenados);
      registrarEvento('GENERAR_RECIBO', {
        tabla: 'aportaciones',
        descripcion: `Lote de ${ordenados.length} recibos (${ordenados[0].numero_recibo} … ${ordenados[ordenados.length - 1].numero_recibo})`,
      });
      mostrarPDF(doc, `Recibos-${marcaArchivo()}.pdf`, { titulo: `${ordenados.length} recibos` });
    } catch (err) {
      aviso(mensajeError(err), 'error');
    } finally {
      b.disabled = false;
    }
  });

  await cargar();
}
