// Generación de documentos PDF (jsPDF + AutoTable).
// Recibos, estados de cuenta, cartas anuales y reportes.
import { estado } from './state.js';
import {
  html, $, abrirModal, descargarBlob, dinero, dineroCentavos, fecha, fechaLarga, fechaHora,
  montoEnLetras, nombreCompleto, lineasDireccion, capitalizar, entero, hoyISO,
} from './utils.js';
import { icono } from './icons.js';

// Azul institucional tomado del logo oficial (#101B6F).
const AZUL = [16, 27, 111];
const AZUL_PROFUNDO = [11, 19, 80];
const AZUL_SUAVE = [231, 233, 246];
const GRIS = [107, 118, 136];
const BORDE = [214, 221, 231];
const TEXTO = [28, 37, 51];
const ROJO = [180, 35, 24];
const MARGEN = 18;

// ---------------------------------------------------------------------
// Logo (convertido a PNG para incrustarlo en el PDF)
// ---------------------------------------------------------------------
const LOGO_LOCAL = 'assets/logo.png';
let cacheLogo = { url: null, promesa: null };

function convertirImagen(url) {
  return new Promise((resolver, rechazar) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const w0 = img.naturalWidth || 240;
        const h0 = img.naturalHeight || 240;
        const escala = 600 / Math.max(w0, h0);
        const w = Math.max(1, Math.round(w0 * escala));
        const h = Math.max(1, Math.round(h0 * escala));
        const lienzo = document.createElement('canvas');
        lienzo.width = w;
        lienzo.height = h;
        lienzo.getContext('2d').drawImage(img, 0, 0, w, h);
        resolver({ datos: lienzo.toDataURL('image/png'), proporcion: w / h });
      } catch (e) {
        rechazar(e);
      }
    };
    img.onerror = () => rechazar(new Error('No se pudo cargar el logo'));
    img.src = url;
  });
}

export function logoPDF() {
  const url = estado.config?.logo_url || LOGO_LOCAL;
  if (cacheLogo.url !== url) {
    cacheLogo = {
      url,
      promesa: convertirImagen(url).catch(() =>
        url === LOGO_LOCAL ? null : convertirImagen(LOGO_LOCAL).catch(() => null)),
    };
  }
  return cacheLogo.promesa;
}

// ---------------------------------------------------------------------
// Elementos comunes
// ---------------------------------------------------------------------
function nuevoDocumento(titulo, orientacion = 'portrait') {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'letter', orientation: orientacion, compress: true });
  doc.setProperties({
    title: titulo,
    subject: titulo,
    author: estado.config?.nombre_iglesia || 'Centro Evangelístico Ebenezer',
    creator: 'Sistema de Administración de Aportaciones',
  });
  return doc;
}

const anchoPagina = (doc) => doc.internal.pageSize.getWidth();
const altoPagina = (doc) => doc.internal.pageSize.getHeight();

function encabezado(doc, logo) {
  const cfg = estado.config || {};
  const ancho = anchoPagina(doc);
  const y0 = 14;
  // Caja del logo: admite logos anchos (como el oficial) o cuadrados.
  const maxAncho = 42;
  const maxAlto = 29;
  let altoLogo = 0;
  let x = MARGEN;

  if (logo) {
    let w = maxAncho;
    let h = w / logo.proporcion;
    if (h > maxAlto) {
      h = maxAlto;
      w = h * logo.proporcion;
    }
    doc.addImage(logo.datos, 'PNG', x, y0, w, h);
    altoLogo = h;
    x += w + 7;
  }

  let y = y0 + 6;
  doc.setTextColor(...AZUL_PROFUNDO);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text((cfg.nombre_iglesia || 'Centro Evangelístico Ebenezer').toUpperCase(), x, y);

  if (cfg.lema) {
    y += 5.5;
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(10.5);
    doc.setTextColor(...AZUL);
    doc.text(`“${cfg.lema}”`, x, y);
  }

  const direccion = [
    cfg.direccion,
    [cfg.ciudad, [cfg.estado, cfg.zip].filter(Boolean).join(' ')].filter(Boolean).join(', '),
  ].filter(Boolean).join(' · ');
  const contacto = [cfg.telefono && `Tel. ${cfg.telefono}`, cfg.email, cfg.sitio_web].filter(Boolean).join(' · ');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...GRIS);
  for (const linea of [direccion, contacto, cfg.ein ? `EIN: ${cfg.ein}` : ''].filter(Boolean)) {
    y += 4.3;
    doc.text(linea, x, y, { maxWidth: ancho - x - MARGEN });
  }

  const yLinea = Math.max(y0 + altoLogo, y) + 4;
  doc.setDrawColor(...AZUL);
  doc.setLineWidth(0.8);
  doc.line(MARGEN, yLinea, ancho - MARGEN, yLinea);
  return yLinea + 9;
}

function piePaginas(doc, rangos = null) {
  const total = doc.getNumberOfPages();
  const ancho = anchoPagina(doc);
  const alto = altoPagina(doc);
  const generado = `Generado el ${fechaHora(new Date())}`;
  const iglesia = estado.config?.nombre_iglesia || 'Centro Evangelístico Ebenezer';
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setDrawColor(...BORDE);
    doc.setLineWidth(0.2);
    doc.line(MARGEN, alto - 14, ancho - MARGEN, alto - 14);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...GRIS);
    doc.text(`${iglesia} · Sistema de Administración de Aportaciones · ${generado}`, MARGEN, alto - 9.5);
    let etiqueta = `Página ${i} de ${total}`;
    if (rangos) {
      const r = rangos.find((x) => i >= x.inicio && i <= x.fin);
      if (r) etiqueta = `Página ${i - r.inicio + 1} de ${r.fin - r.inicio + 1}`;
    }
    doc.text(etiqueta, ancho - MARGEN, alto - 9.5, { align: 'right' });
  }
}

// Si no cabe el contenido, agrega una página y devuelve la nueva posición.
function asegurarEspacio(doc, y, necesario) {
  if (y + necesario > altoPagina(doc) - 20) {
    doc.addPage();
    return 22;
  }
  return y;
}

function tituloDocumento(doc, titulo, y) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...AZUL_PROFUNDO);
  doc.text(titulo, MARGEN, y);
  return y + 8;
}

function etiquetaValor(doc, etiqueta, valor, x, y, anchoMax) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...GRIS);
  doc.text(etiqueta.toUpperCase(), x, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10.5);
  doc.setTextColor(...TEXTO);
  const lineas = doc.splitTextToSize(String(valor ?? '—'), anchoMax || 80);
  doc.text(lineas, x, y + 5);
  return y + 5 + lineas.length * 4.6;
}

function parrafos(doc, texto, x, y, ancho, { tam = 10.5, interlineado = 5.3, separacion = 3.2 } = {}) {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(tam);
  doc.setTextColor(...TEXTO);
  const bloques = String(texto || '').replace(/\r/g, '').split(/\n\s*\n/);
  for (const bloque of bloques) {
    const lineas = bloque.split('\n').flatMap((l) => doc.splitTextToSize(l.trim(), ancho));
    for (const linea of lineas) {
      y = asegurarEspacio(doc, y, interlineado);
      doc.text(linea, x, y);
      y += interlineado;
    }
    y += separacion;
  }
  return y;
}

function tabla(doc, opciones) {
  const columnas = opciones.columnStyles || {};
  doc.autoTable({
    theme: 'grid',
    showFoot: 'lastPage',
    margin: { left: MARGEN, right: MARGEN, top: 20, bottom: 22 },
    ...opciones,
    // Encabezado y pie alineados igual que los valores de su columna.
    didParseCell: (d) => {
      const alineacion = columnas[d.column.index]?.halign;
      if (alineacion && d.section !== 'body') d.cell.styles.halign = alineacion;
      if (opciones.didParseCell) opciones.didParseCell(d);
    },
    styles: {
      font: 'helvetica', fontSize: 9, cellPadding: 2.1, textColor: TEXTO,
      lineColor: BORDE, lineWidth: 0.2, overflow: 'linebreak', ...(opciones.styles || {}),
    },
    headStyles: { fillColor: AZUL, textColor: 255, fontStyle: 'bold', fontSize: 8.5, ...(opciones.headStyles || {}) },
    footStyles: { fillColor: AZUL_SUAVE, textColor: AZUL_PROFUNDO, fontStyle: 'bold', ...(opciones.footStyles || {}) },
    alternateRowStyles: { fillColor: [248, 250, 252] },
  });
  return doc.lastAutoTable.finalY;
}

function marcaAgua(doc, texto) {
  const ancho = anchoPagina(doc);
  const alto = altoPagina(doc);
  const angulo = 35;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(84);
  const w = doc.getTextWidth(texto);
  const rad = (angulo * Math.PI) / 180;
  const x = ancho / 2 - (Math.cos(rad) * w) / 2;
  const y = alto / 2 + (Math.sin(rad) * w) / 2;
  try {
    doc.saveGraphicsState();
    doc.setGState(new doc.GState({ opacity: 0.12 }));
    doc.setTextColor(...ROJO);
    doc.text(texto, x, y, { angle: angulo });
    doc.restoreGraphicsState();
  } catch {
    doc.setTextColor(250, 215, 212);
    doc.text(texto, x, y, { angle: angulo });
  }
}

// ---------------------------------------------------------------------
// Visor: vista previa, imprimir, descargar
// ---------------------------------------------------------------------
export function mostrarPDF(doc, nombreArchivo, { titulo = 'Vista previa del documento', imprimir = false } = {}) {
  const blob = doc.output('blob');
  const url = URL.createObjectURL(blob);
  const m = abrirModal({
    titulo,
    ancho: true,
    contenido: html`
      <iframe class="visor-pdf" title="${titulo}" src="${url}"></iframe>
      <p class="texto-tenue texto-pequeno mt-1">Si la vista previa no aparece en su dispositivo, use “Abrir en pestaña nueva” o “Descargar PDF”.</p>`,
    pie: html`
      <button type="button" class="btn" data-cerrar>Cerrar</button>
      <button type="button" class="btn" data-pestana>${icono('external-link')} Abrir en pestaña nueva</button>
      <button type="button" class="btn" data-imprimir>${icono('printer')} Imprimir</button>
      <button type="button" class="btn btn-primario" data-descargar>${icono('download')} Descargar PDF</button>`,
    alCerrar: () => setTimeout(() => URL.revokeObjectURL(url), 2000),
  });
  const marco = $('iframe', m.el);
  const imprimirMarco = () => {
    try {
      marco.contentWindow.focus();
      marco.contentWindow.print();
    } catch {
      window.open(url, '_blank');
    }
  };
  $('[data-descargar]', m.el).addEventListener('click', () => descargarBlob(blob, nombreArchivo));
  $('[data-pestana]', m.el).addEventListener('click', () => window.open(url, '_blank'));
  $('[data-imprimir]', m.el).addEventListener('click', imprimirMarco);
  if (imprimir) marco.addEventListener('load', () => setTimeout(imprimirMarco, 400), { once: true });
  return m;
}

export function descargarPDF(doc, nombreArchivo) {
  descargarBlob(doc.output('blob'), nombreArchivo);
}

// ---------------------------------------------------------------------
// RECIBO
// a: fila de v_aportaciones · miembro: datos del miembro (opcional)
// ---------------------------------------------------------------------
export async function pdfRecibo(a, miembro = null, { doc: docExistente = null, nuevaPagina = true } = {}) {
  const logo = await logoPDF();
  const doc = docExistente || nuevoDocumento(`Recibo ${a.numero_recibo}`);
  if (docExistente && nuevaPagina) doc.addPage();
  const cfg = estado.config || {};
  const ancho = anchoPagina(doc);
  const util = ancho - MARGEN * 2;

  let y = encabezado(doc, logo);

  // Franja de título
  doc.setFillColor(...AZUL_SUAVE);
  doc.roundedRect(MARGEN, y - 6, util, 17, 2, 2, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...AZUL_PROFUNDO);
  doc.text('RECIBO DE APORTACIÓN', MARGEN + 5, y + 4);
  doc.setFontSize(11.5);
  doc.text(`No. ${a.numero_recibo}`, ancho - MARGEN - 5, y + 0.5, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(...TEXTO);
  doc.text(`Fecha: ${fecha(a.fecha_aportacion)}`, ancho - MARGEN - 5, y + 6.5, { align: 'right' });
  y += 20;

  const nombre = miembro ? nombreCompleto(miembro) : `${a.miembro_nombre} ${a.miembro_apellido}`;
  const anonimo = miembro ? !!miembro.es_anonimo : !!a.miembro_anonimo;
  const yIzq = etiquetaValor(doc, 'Recibido de', nombre, MARGEN, y, util * 0.6);
  if (!anonimo) etiquetaValor(doc, 'Número de miembro', a.numero_miembro, MARGEN + util * 0.66, y, util * 0.34);
  y = yIzq;
  const direccion = miembro ? lineasDireccion(miembro) : [];
  if (direccion.length) {
    doc.setFontSize(9.5);
    doc.setTextColor(...GRIS);
    doc.text(direccion, MARGEN, y);
    y += direccion.length * 4.3;
  }
  y += 4;

  y = tabla(doc, {
    startY: y,
    head: [['Fondo', 'Método de pago', 'Referencia', 'Monto']],
    body: [[a.fondo_nombre, a.metodo_pago_nombre, a.referencia_pago || '—', dinero(a.monto)]],
    columnStyles: { 3: { halign: 'right', fontStyle: 'bold' } },
    styles: { fontSize: 10, cellPadding: 3 },
  }) + 7;

  // Total y cantidad en letras
  doc.setFillColor(...AZUL_SUAVE);
  doc.roundedRect(ancho - MARGEN - 70, y - 5, 70, 12, 2, 2, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...AZUL_PROFUNDO);
  doc.text('TOTAL', ancho - MARGEN - 66, y + 2.5);
  doc.setFontSize(14);
  doc.text(dinero(a.monto), ancho - MARGEN - 4, y + 3, { align: 'right' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...GRIS);
  doc.text('CANTIDAD EN LETRAS', MARGEN, y - 1);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...TEXTO);
  const letras = doc.splitTextToSize(montoEnLetras(a.monto), util - 80);
  doc.text(letras, MARGEN, y + 4);
  y += Math.max(12, 4 + letras.length * 4.6) + 4;

  // Bienes o servicios
  doc.setFontSize(9.5);
  const bienes = a.bienes_servicios
    ? `¿Se proporcionaron bienes o servicios a cambio? Sí — ${a.descripcion_bienes_servicios} (valor estimado ${dinero(a.valor_bienes_servicios)}).`
    : '¿Se proporcionaron bienes o servicios a cambio? No.';
  const lineasBienes = doc.splitTextToSize(bienes, util);
  doc.text(lineasBienes, MARGEN, y);
  y += lineasBienes.length * 4.5 + 2;

  if (a.descripcion) {
    const d = doc.splitTextToSize(`Descripción: ${a.descripcion}`, util);
    doc.text(d, MARGEN, y);
    y += d.length * 4.5 + 2;
  }
  if (a.corrige_numero_recibo) {
    doc.setTextColor(...GRIS);
    doc.text(`Este recibo corrige y reemplaza al recibo No. ${a.corrige_numero_recibo}.`, MARGEN, y);
    y += 6;
  }

  // Anulación
  if (a.estado !== 'REGISTRADA') {
    const txt = a.estado === 'CORREGIDA'
      ? `RECIBO ANULADO Y REEMPLAZADO por el recibo No. ${a.corregida_por_numero_recibo || '—'}. Motivo: ${a.motivo_anulacion || '—'}`
      : `RECIBO ANULADO el ${fechaHora(a.anulada_at)}. Motivo: ${a.motivo_anulacion || '—'}`;
    const l = doc.splitTextToSize(txt, util - 8);
    doc.setDrawColor(...ROJO);
    doc.setFillColor(253, 236, 234);
    doc.roundedRect(MARGEN, y, util, l.length * 4.6 + 6, 2, 2, 'FD');
    doc.setTextColor(...ROJO);
    doc.setFont('helvetica', 'bold');
    doc.text(l, MARGEN + 4, y + 5.5);
    y += l.length * 4.6 + 10;
    marcaAgua(doc, a.estado === 'CORREGIDA' ? 'CORREGIDO' : 'ANULADO');
  }

  // Firma
  y = asegurarEspacio(doc, y + 14, 30);
  doc.setDrawColor(...TEXTO);
  doc.setLineWidth(0.3);
  doc.line(MARGEN, y, MARGEN + 70, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...TEXTO);
  doc.text(cfg.nombre_responsable ? `${cfg.nombre_responsable}` : 'Firma autorizada', MARGEN, y + 5);
  if (cfg.cargo_responsable) {
    doc.setTextColor(...GRIS);
    doc.text(cfg.cargo_responsable, MARGEN, y + 9.5);
  }
  y += 18;

  if (cfg.texto_pie_recibo) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(9);
    doc.setTextColor(...AZUL);
    const pie = doc.splitTextToSize(cfg.texto_pie_recibo, util - 20);
    y = asegurarEspacio(doc, y, pie.length * 4.5);
    doc.text(pie, ancho / 2, y, { align: 'center' });
  }

  if (!docExistente) piePaginas(doc);
  return doc;
}

// Varios recibos en un solo PDF (una página por recibo).
export async function pdfRecibosLote(aportaciones) {
  const doc = nuevoDocumento('Recibos de aportaciones');
  const rangos = [];
  for (let i = 0; i < aportaciones.length; i++) {
    const inicio = i === 0 ? 1 : doc.getNumberOfPages() + 1;
    await pdfRecibo(aportaciones[i], null, { doc, nuevaPagina: i > 0 });
    rangos.push({ inicio, fin: doc.getNumberOfPages() });
  }
  piePaginas(doc, rangos);
  return doc;
}

// ---------------------------------------------------------------------
// ESTADO DE CUENTA
// ---------------------------------------------------------------------
export async function pdfEstadoCuenta({ miembro, desde, hasta, filas, incluirNoValidas, resumenFondos, totalCentavos }) {
  const logo = await logoPDF();
  const doc = nuevoDocumento(`Estado de cuenta ${miembro.numero_miembro}`);
  const ancho = anchoPagina(doc);
  const util = ancho - MARGEN * 2;
  let y = encabezado(doc, logo);
  y = tituloDocumento(doc, 'ESTADO DE CUENTA DE APORTACIONES', y);

  const familiar = !!miembro.es_familia;
  const yA = etiquetaValor(doc, familiar ? 'Familia' : 'Miembro / donante', nombreCompleto(miembro), MARGEN, y, util * 0.55);
  const yB = etiquetaValor(doc, 'Período', `${fecha(desde)} al ${fecha(hasta)}`, MARGEN + util * 0.6, y, util * 0.4);
  y = Math.max(yA, yB) + 1;
  const yC = etiquetaValor(doc, familiar ? 'Número de familia' : 'Número de miembro', miembro.numero_miembro, MARGEN, y, util * 0.55);
  const yD = etiquetaValor(doc, 'Fecha de emisión', capitalizar(fechaLarga(hoyISO())), MARGEN + util * 0.6, y, util * 0.4);
  y = Math.max(yC, yD) + 1;
  const dir = lineasDireccion(miembro);
  if (dir.length) y = etiquetaValor(doc, 'Dirección', dir.join('\n'), MARGEN, y, util * 0.55) + 1;
  if (familiar) y = etiquetaValor(doc, 'Miembros', listaMiembrosFamilia(miembro), MARGEN, y, util) + 1;
  y += 3;

  const noValidas = new Set();
  const cuerpo = filas.map((f, i) => {
    if (f.estado !== 'REGISTRADA') noValidas.add(i);
    const base = [fecha(f.fecha_aportacion), f.numero_recibo, f.fondo_nombre, f.metodo_pago_nombre, dinero(f.monto)];
    if (incluirNoValidas) base.splice(4, 0, capitalizar(f.estado.toLowerCase()));
    if (familiar) base.splice(2, 0, `${f.miembro_nombre} ${f.miembro_apellido}`);
    return base;
  });
  const cabecera = ['Fecha', 'No. recibo', 'Fondo', 'Método', 'Monto'];
  if (incluirNoValidas) cabecera.splice(4, 0, 'Estado');
  if (familiar) cabecera.splice(2, 0, 'Donante');
  const colMonto = cabecera.length - 1;
  const pie = new Array(cabecera.length).fill('');
  pie[0] = 'TOTAL DEL PERÍODO';
  pie[colMonto] = dineroCentavos(totalCentavos);

  y = tabla(doc, {
    startY: y,
    head: [cabecera],
    body: cuerpo.length ? cuerpo : [[{ content: 'No hay aportaciones en el período seleccionado.', colSpan: cabecera.length, styles: { halign: 'center', textColor: GRIS } }]],
    foot: [pie],
    columnStyles: { [colMonto]: { halign: 'right' } },
    didParseCell: (d) => {
      if (d.section === 'body' && noValidas.has(d.row.index)) {
        d.cell.styles.textColor = [150, 158, 170];
        d.cell.styles.fontStyle = 'italic';
      }
      if (d.section === 'foot' && d.column.index === colMonto) d.cell.styles.halign = 'right';
    },
  }) + 5;

  y = asegurarEspacio(doc, y, 6);
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8.5);
  doc.setTextColor(...GRIS);
  doc.text('Las aportaciones anuladas o corregidas no se incluyen en los totales.', MARGEN, y);
  y += 10;

  if (resumenFondos.length > 1) {
    y = asegurarEspacio(doc, y, 30);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...AZUL_PROFUNDO);
    doc.text('Resumen por fondo', MARGEN, y);
    y = tabla(doc, {
      startY: y + 3,
      tableWidth: util * 0.6,
      head: [['Fondo', 'Cantidad', 'Total']],
      body: resumenFondos.map((r) => [r.fondo, entero(r.cantidad), dineroCentavos(r.centavos)]),
      columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' } },
      styles: { fontSize: 8.5 },
    });
  }

  piePaginas(doc);
  return doc;
}

// "EBE-000010 José Sariñana, EBE-000011 María Sariñana"
function listaMiembrosFamilia(destinatario) {
  return destinatario.miembros.map((m) => `${m.numero_miembro} ${nombreCompleto(m)}`).join(', ');
}

// ---------------------------------------------------------------------
// CARTA ANUAL DE CONTRIBUCIONES
// datos: { miembro, anio, fechaCarta, cuerpo, cierre, resumenFondos, totalCentavos,
//          bienes: { hay, valorCentavos }, detalle: filas | null }
// ---------------------------------------------------------------------
export async function pdfCartaAnual(datos, { doc: docExistente = null, nuevaPagina = true } = {}) {
  const logo = await logoPDF();
  const cfg = estado.config || {};
  const doc = docExistente || nuevoDocumento(`Carta anual ${datos.anio} ${datos.miembro.numero_miembro}`);
  if (docExistente && nuevaPagina) doc.addPage();
  const inicio = doc.getNumberOfPages();
  const ancho = anchoPagina(doc);
  const util = ancho - MARGEN * 2;

  let y = encabezado(doc, logo);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10.5);
  doc.setTextColor(...TEXTO);
  const lugar = cfg.ciudad ? `${cfg.ciudad}, ` : '';
  doc.text(`${lugar}${fechaLarga(datos.fechaCarta)}`, ancho - MARGEN, y, { align: 'right' });
  y += 8;

  // Destinatario
  doc.setFont('helvetica', 'bold');
  doc.text(nombreCompleto(datos.miembro), MARGEN, y);
  doc.setFont('helvetica', 'normal');
  for (const l of lineasDireccion(datos.miembro)) {
    y += 5;
    doc.text(l, MARGEN, y);
  }
  y += 9;

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...AZUL_PROFUNDO);
  doc.text(`Asunto: Constancia anual de contribuciones — Año ${datos.anio}`, MARGEN, y);
  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(...GRIS);
  if (datos.miembro.es_familia) {
    const lineas = doc.splitTextToSize(`Familia ${datos.miembro.numero_miembro} · ${listaMiembrosFamilia(datos.miembro)}`, util);
    doc.text(lineas, MARGEN, y);
    y += 4.2 * (lineas.length - 1);
  } else {
    doc.text(`Número de miembro/donante: ${datos.miembro.numero_miembro}`, MARGEN, y);
  }
  y += 9;

  y = parrafos(doc, datos.cuerpo, MARGEN, y, util);

  // Resumen de contribuciones
  y = asegurarEspacio(doc, y + 1, 30);
  const pie = [['TOTAL ANUAL', '', dineroCentavos(datos.totalCentavos)]];
  if (datos.bienes?.hay) {
    pie.push(['Valor estimado de bienes o servicios recibidos', '', dineroCentavos(datos.bienes.valorCentavos)]);
    pie.push(['Contribuciones que exceden dicho valor', '', dineroCentavos(datos.totalCentavos - datos.bienes.valorCentavos)]);
  }
  y = tabla(doc, {
    startY: y,
    head: [[`Resumen de contribuciones ${datos.anio}`, 'Cantidad', 'Total']],
    body: datos.resumenFondos.map((r) => [r.fondo, entero(r.cantidad), dineroCentavos(r.centavos)]),
    foot: pie,
    columnStyles: { 1: { halign: 'right', cellWidth: 26 }, 2: { halign: 'right', cellWidth: 38 } },
    didParseCell: (d) => {
      if (d.section === 'foot' && d.column.index === 2) d.cell.styles.halign = 'right';
      if (d.section === 'foot' && d.row.index > 0) {
        d.cell.styles.fontStyle = 'normal';
        d.cell.styles.fillColor = [248, 250, 252];
      }
    },
  }) + 7;

  if (datos.detalle?.length) {
    y = asegurarEspacio(doc, y, 24);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...AZUL_PROFUNDO);
    doc.text('Detalle de contribuciones', MARGEN, y);
    y = tabla(doc, {
      startY: y + 3,
      head: [datos.miembro.es_familia
        ? ['Fecha', 'No. recibo', 'Donante', 'Fondo', 'Método', 'Monto']
        : ['Fecha', 'No. recibo', 'Fondo', 'Método', 'Monto']],
      body: datos.detalle.map((f) => (datos.miembro.es_familia
        ? [fecha(f.fecha_aportacion), f.numero_recibo, `${f.miembro_nombre} ${f.miembro_apellido}`, f.fondo_nombre, f.metodo_pago_nombre, dinero(f.monto)]
        : [fecha(f.fecha_aportacion), f.numero_recibo, f.fondo_nombre, f.metodo_pago_nombre, dinero(f.monto)])),
      columnStyles: { [datos.miembro.es_familia ? 5 : 4]: { halign: 'right' } },
      styles: { fontSize: 8.5 },
    }) + 7;
  }

  y = parrafos(doc, datos.cierre, MARGEN, y, util);

  // Firma
  y = asegurarEspacio(doc, y + 12, 26);
  doc.setDrawColor(...TEXTO);
  doc.setLineWidth(0.3);
  doc.line(MARGEN, y, MARGEN + 75, y);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(...TEXTO);
  doc.text(cfg.nombre_responsable || ' ', MARGEN, y + 5.5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(...GRIS);
  if (cfg.cargo_responsable) doc.text(cfg.cargo_responsable, MARGEN, y + 10.5);
  doc.text(cfg.nombre_iglesia || '', MARGEN, y + (cfg.cargo_responsable ? 15.5 : 10.5));

  const fin = doc.getNumberOfPages();
  if (!docExistente) piePaginas(doc);
  return { doc, inicio, fin };
}

export async function pdfCartasLote(lista) {
  const doc = nuevoDocumento(`Cartas anuales ${lista[0]?.anio || ''}`);
  const rangos = [];
  for (let i = 0; i < lista.length; i++) {
    const r = await pdfCartaAnual(lista[i], { doc, nuevaPagina: i > 0 });
    rangos.push({ inicio: r.inicio, fin: r.fin });
  }
  piePaginas(doc, rangos);
  return doc;
}

// ---------------------------------------------------------------------
// REPORTE genérico
// reporte: { titulo, subtitulo, horizontal, resumen: [{etiqueta, valor}],
//            secciones: [{ titulo, columnas: [{ titulo, alinear }], filas: [[...]], pie: [...] }] }
// ---------------------------------------------------------------------
export async function pdfReporte(reporte) {
  const logo = await logoPDF();
  const doc = nuevoDocumento(reporte.titulo, reporte.horizontal ? 'landscape' : 'portrait');
  const ancho = anchoPagina(doc);
  let y = encabezado(doc, logo);
  y = tituloDocumento(doc, reporte.titulo.toUpperCase(), y);
  if (reporte.subtitulo) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(...GRIS);
    const s = doc.splitTextToSize(reporte.subtitulo, ancho - MARGEN * 2);
    doc.text(s, MARGEN, y - 2);
    y += s.length * 4.3 + 2;
  }

  if (reporte.resumen?.length) {
    const anchoCelda = (ancho - MARGEN * 2) / Math.min(4, reporte.resumen.length);
    reporte.resumen.forEach((r, i) => {
      const col = i % 4;
      const fila = Math.floor(i / 4);
      const x = MARGEN + col * anchoCelda;
      const yy = y + fila * 13;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(...GRIS);
      doc.text(r.etiqueta.toUpperCase(), x, yy);
      doc.setFontSize(12);
      doc.setTextColor(...TEXTO);
      doc.text(String(r.valor), x, yy + 5.5);
    });
    y += Math.ceil(reporte.resumen.length / 4) * 13 + 3;
  }

  for (const s of reporte.secciones) {
    y = asegurarEspacio(doc, y, 24);
    if (s.titulo) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10.5);
      doc.setTextColor(...AZUL_PROFUNDO);
      doc.text(s.titulo, MARGEN, y);
      y += 3;
    }
    const columnStyles = {};
    s.columnas.forEach((c, i) => { if (c.alinear === 'derecha') columnStyles[i] = { halign: 'right' }; });
    y = tabla(doc, {
      startY: y,
      head: [s.columnas.map((c) => c.titulo)],
      body: s.filas.length
        ? s.filas
        : [[{ content: 'Sin datos para los filtros seleccionados.', colSpan: s.columnas.length, styles: { halign: 'center', textColor: GRIS } }]],
      foot: s.pie ? [s.pie] : undefined,
      columnStyles,
      styles: { fontSize: s.columnas.length > 6 ? 7.8 : 8.5 },
      didParseCell: (d) => {
        if (d.section === 'foot' && s.columnas[d.column.index]?.alinear === 'derecha') d.cell.styles.halign = 'right';
      },
    }) + 9;
  }

  piePaginas(doc);
  return doc;
}
