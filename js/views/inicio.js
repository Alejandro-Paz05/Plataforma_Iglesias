// Dashboard principal.
import { sb } from '../supabase.js';
import { estado } from '../state.js';
import {
  html, pintar, $, $$, esc, dinero, dineroCentavos, entero, aCentavos, fecha, fechaLarga,
  MESES, MESES_CORTOS, capitalizar, inicioAnio,
} from '../utils.js';
import { icono } from '../icons.js';
import { insigniaEstado } from '../components.js';

export async function render({ cont, titulo }) {
  titulo('Inicio');
  const { data: d, error } = await sb.rpc('resumen_dashboard');
  if (error) throw error;

  const anio = Number(d.hoy.slice(0, 4));
  const mes = Number(d.hoy.slice(5, 7));
  const promedio = d.cantidad_anio ? aCentavos(d.total_anio) / d.cantidad_anio : 0;

  pintar(cont, html`
    <div class="cabecera">
      <div>
        <h2>Bienvenido(a)</h2>
        <p>${capitalizar(fechaLarga(d.hoy))} · ${estado.config.nombre_iglesia}</p>
      </div>
      <div class="acciones">
        <a class="btn btn-primario" href="#/aportaciones/nueva">${icono('plus-circle')} Nueva aportación</a>
        <a class="btn" href="#/miembros/nuevo">${icono('user')} Nuevo miembro</a>
        <a class="btn" href="#/estados-cuenta">${icono('file-text')} Estado de cuenta</a>
      </div>
    </div>

    <div class="rejilla rejilla-4">
      ${indicador('Aportaciones de hoy', dinero(d.total_hoy), `${entero(d.cantidad_hoy)} aportación(es) · ${fecha(d.hoy)}`)}
      ${indicador('Aportaciones del mes', dinero(d.total_mes), `${capitalizar(MESES[mes - 1])} ${anio} · ${entero(d.cantidad_mes)} aportación(es)`)}
      ${indicador('Aportaciones del año', dinero(d.total_anio), `${anio} · ${entero(d.cantidad_anio)} aportación(es)`)}
      ${indicador('Miembros/donantes activos', entero(d.miembros_activos), `de ${entero(d.miembros_total)} registrados`)}
    </div>

    <div class="rejilla rejilla-2-1 mt-2">
      <section class="tarjeta">
        <div class="tarjeta-titulo">
          <h2>Resumen mensual ${anio} <span class="sub">· aportaciones válidas</span></h2>
          <button type="button" class="btn btn-texto" id="alternar-tabla" aria-expanded="false" aria-controls="tabla-mensual">Ver tabla</button>
        </div>
        <div class="grafico" id="grafico-mensual"></div>
        <div id="tabla-mensual" class="mt-2" hidden></div>
      </section>
      <section class="tarjeta">
        <div class="tarjeta-titulo"><h2>Distribución por fondo <span class="sub">· ${anio}</span></h2></div>
        <div id="por-fondo"></div>
      </section>
    </div>

    <div class="rejilla rejilla-2-1 mt-2">
      <section class="tarjeta">
        <div class="tarjeta-titulo">
          <h2>Aportaciones recientes</h2>
          <a class="btn btn-texto" href="#/aportaciones">Ver historial</a>
        </div>
        <div id="recientes"></div>
      </section>
      <section class="tarjeta">
        <div class="tarjeta-titulo"><h2>Control ${anio}</h2></div>
        <dl class="datos" style="grid-template-columns:1fr">
          <div><dt>Cantidad de aportaciones</dt><dd>${entero(d.cantidad_anio)}</dd></div>
          <div><dt>Promedio por aportación</dt><dd>${dineroCentavos(Math.round(promedio))}</dd></div>
          <div>
            <dt>Aportaciones anuladas o corregidas</dt>
            <dd>${entero(d.no_validas_anio)}
              ${d.no_validas_anio ? html` · <a href="#/aportaciones?estado=NO_VALIDAS&desde=${inicioAnio(anio)}">Ver detalle</a>` : ''}
            </dd>
          </div>
          <div><dt>Zona horaria de la iglesia</dt><dd class="texto-tenue">${d.zona_horaria}</dd></div>
        </dl>
      </section>
    </div>`);

  graficoMensual($('#grafico-mensual', cont), d.por_mes, anio, mes);
  tablaMensual($('#tabla-mensual', cont), d.por_mes, anio);
  barrasFondo($('#por-fondo', cont), d.por_fondo);
  recientes($('#recientes', cont), d.recientes);

  const boton = $('#alternar-tabla', cont);
  boton.addEventListener('click', () => {
    const t = $('#tabla-mensual', cont);
    t.hidden = !t.hidden;
    boton.setAttribute('aria-expanded', String(!t.hidden));
    boton.textContent = t.hidden ? 'Ver tabla' : 'Ocultar tabla';
  });
}

function indicador(etiqueta, valor, detalle) {
  return html`
    <div class="tarjeta indicador">
      <div class="etiqueta">${etiqueta}</div>
      <div class="valor">${valor}</div>
      <div class="detalle">${detalle}</div>
    </div>`;
}

// ---------------------------------------------------------------------
// Columnas por mes (una serie, color institucional)
// ---------------------------------------------------------------------
function marcasEje(maximo, n = 4) {
  if (maximo <= 0) return [0, 250, 500, 750, 1000];
  const pasoBruto = maximo / n;
  const magnitud = Math.pow(10, Math.floor(Math.log10(pasoBruto)));
  const normal = pasoBruto / magnitud;
  const paso = (normal <= 1 ? 1 : normal <= 2 ? 2 : normal <= 2.5 ? 2.5 : normal <= 5 ? 5 : 10) * magnitud;
  const tope = Math.ceil(maximo / paso) * paso;
  const marcas = [];
  for (let v = 0; v <= tope + paso / 2; v += paso) marcas.push(Math.round(v * 100) / 100);
  return marcas;
}

function textoEje(v) {
  if (v >= 1e6) return `$${(v / 1e6).toLocaleString('en-US', { maximumFractionDigits: 1 })}M`;
  if (v >= 1000) return `$${(v / 1000).toLocaleString('en-US', { maximumFractionDigits: 1 })}K`;
  return `$${v.toLocaleString('en-US')}`;
}

function rutaColumna(x, y, w, h, r) {
  r = Math.min(r, h, w / 2);
  return `M${x},${y + h} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + w - r},${y} Q${x + w},${y} ${x + w},${y + r} L${x + w},${y + h} Z`;
}

function graficoMensual(el, datos, anio, mesActual) {
  const W = 720;
  const H = 270;
  const izq = 58;
  const der = 8;
  const arriba = 24;
  const abajo = 30;
  const centavos = datos.map((x) => aCentavos(x.total));
  const marcas = marcasEje(Math.max(...centavos, 0) / 100);
  const tope = marcas[marcas.length - 1] * 100 || 1;
  const anchoPlot = W - izq - der;
  const altoPlot = H - arriba - abajo;
  const banda = anchoPlot / 12;
  const anchoBarra = Math.min(24, banda * 0.5);
  const yDe = (c) => arriba + altoPlot - (c / tope) * altoPlot;

  let svg = '';
  for (const m of marcas) {
    const y = yDe(m * 100).toFixed(1);
    svg += `<line class="rejilla-linea" x1="${izq}" x2="${W - der}" y1="${y}" y2="${y}"/>`;
    svg += `<text class="eje" x="${izq - 8}" y="${Number(y) + 4}" text-anchor="end">${esc(textoEje(m))}</text>`;
  }
  datos.forEach((x, i) => {
    const etiqueta = `${capitalizar(MESES[i])} ${anio}: ${dineroCentavos(centavos[i])}, ${x.cantidad} aportación(es)`;
    svg += `<rect class="zona-hover" x="${(izq + banda * i).toFixed(1)}" y="${arriba}" width="${banda.toFixed(1)}" height="${altoPlot}" tabindex="0" data-i="${i}" role="img" aria-label="${esc(etiqueta)}"/>`;
  });
  datos.forEach((x, i) => {
    const cx = izq + banda * i + banda / 2;
    const c = centavos[i];
    if (c > 0) {
      const yTope = yDe(c);
      svg += `<path class="barra-dato" d="${rutaColumna(cx - anchoBarra / 2, yTope, anchoBarra, arriba + altoPlot - yTope, 4)}"/>`;
    }
    if (i + 1 === mesActual && c > 0) {
      svg += `<text class="etiqueta-valor" x="${cx}" y="${(yDe(c) - 7).toFixed(1)}" text-anchor="middle">${esc(textoEje(c / 100))}</text>`;
    }
    svg += `<text class="eje" x="${cx}" y="${H - 9}" text-anchor="middle">${MESES_CORTOS[i]}</text>`;
  });
  svg += `<line class="rejilla-linea" x1="${izq}" x2="${W - der}" y1="${arriba + altoPlot}" y2="${arriba + altoPlot}" style="stroke:#cbd3df"/>`;

  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="group" aria-label="Aportaciones por mes ${anio}">${svg}</svg><div class="tooltip" hidden></div>`;

  const tip = el.querySelector('.tooltip');
  const mostrar = (zona) => {
    const i = Number(zona.dataset.i);
    const caja = el.getBoundingClientRect();
    const escala = caja.width / W;
    pintar(tip, html`<strong>${capitalizar(MESES[i])} ${anio}</strong>${dineroCentavos(centavos[i])} · ${entero(datos[i].cantidad)} aportación(es)`);
    tip.style.left = `${(izq + banda * i + banda / 2) * escala}px`;
    tip.style.top = `${yDe(centavos[i]) * escala}px`;
    tip.hidden = false;
  };
  el.querySelectorAll('.zona-hover').forEach((z) => {
    z.addEventListener('mouseenter', () => mostrar(z));
    z.addEventListener('focus', () => mostrar(z));
    z.addEventListener('mouseleave', () => { tip.hidden = true; });
    z.addEventListener('blur', () => { tip.hidden = true; });
  });
}

function tablaMensual(el, datos, anio) {
  const total = datos.reduce((s, x) => s + aCentavos(x.total), 0);
  const cantidad = datos.reduce((s, x) => s + Number(x.cantidad), 0);
  pintar(el, html`
    <div class="tabla-contenedor">
      <table class="tabla tabla-compacta">
        <thead><tr><th>Mes</th><th class="num">Aportaciones</th><th class="dinero">Total</th></tr></thead>
        <tbody>${datos.map((x, i) => html`
          <tr><td>${capitalizar(MESES[i])} ${anio}</td><td class="num">${entero(x.cantidad)}</td><td class="dinero">${dinero(x.total)}</td></tr>`)}
        </tbody>
        <tfoot><tr><td>Total</td><td class="num">${entero(cantidad)}</td><td class="dinero">${dineroCentavos(total)}</td></tr></tfoot>
      </table>
    </div>`);
}

// ---------------------------------------------------------------------
// Barras horizontales por fondo
// ---------------------------------------------------------------------
function barrasFondo(el, datos) {
  if (!datos.length) {
    pintar(el, html`<div class="vacio">Aún no hay aportaciones registradas este año.</div>`);
    return;
  }
  const centavos = datos.map((x) => aCentavos(x.total));
  const total = centavos.reduce((a, b) => a + b, 0);
  const maximo = Math.max(...centavos);
  pintar(el, html`
    <div class="barras-h">
      ${datos.map((x, i) => {
        const pct = total ? (centavos[i] / total) * 100 : 0;
        return html`
          <div class="barra-h" title="${x.fondo}: ${dineroCentavos(centavos[i])} (${entero(x.cantidad)} aportaciones)">
            <div class="fila-texto"><span>${x.fondo}</span><span>${dineroCentavos(centavos[i])} · ${pct.toFixed(1)}%</span></div>
            <div class="pista"><div class="relleno" style="width:${((centavos[i] / maximo) * 100).toFixed(2)}%"></div></div>
          </div>`;
      })}
    </div>
    <p class="texto-tenue texto-pequeno mt-2">Total del año: <strong>${dineroCentavos(total)}</strong></p>`);
}

function recientes(el, filas) {
  if (!filas.length) {
    pintar(el, html`<div class="vacio">No hay aportaciones registradas.
      <a href="#/aportaciones/nueva">Registrar la primera aportación</a></div>`);
    return;
  }
  pintar(el, html`
    <div class="tabla-contenedor">
      <table class="tabla tabla-compacta">
        <thead><tr><th>Recibo</th><th>Fecha</th><th>Miembro</th><th>Fondo</th><th class="dinero">Monto</th><th>Estado</th></tr></thead>
        <tbody>${filas.map((f) => html`
          <tr class="clic" data-id="${f.id}" tabindex="0">
            <td class="nowrap mono">${f.numero_recibo}</td>
            <td class="nowrap">${fecha(f.fecha_aportacion)}</td>
            <td>${f.miembro}</td>
            <td>${f.fondo}</td>
            <td class="dinero ${f.estado !== 'REGISTRADA' ? 'tachado' : ''}">${dinero(f.monto)}</td>
            <td>${insigniaEstado(f.estado)}</td>
          </tr>`)}
        </tbody>
      </table>
    </div>`);
  $$('tr[data-id]', el).forEach((tr) => {
    const ir = () => { location.hash = `#/aportaciones/${tr.dataset.id}`; };
    tr.addEventListener('click', ir);
    tr.addEventListener('keydown', (e) => { if (e.key === 'Enter') ir(); });
  });
}
