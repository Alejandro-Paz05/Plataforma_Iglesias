// Punto de entrada: autenticación, estructura, menú y enrutador.
import { sb, configuracionPendiente, claveEsSecreta } from './supabase.js';
import { CONFIG } from './config.js';
import { estado, cargarConfiguracion, cargarCatalogos, registrarEvento } from './state.js';
import { html, pintar, $, $$, mensajeError, cerrarModales, alerta, cargando } from './utils.js';
import { icono } from './icons.js';
import { mostrarLogin } from './views/login.js';

const MENU = [
  { seccion: null, items: [{ ruta: 'inicio', texto: 'Inicio', icono: 'home' }] },
  {
    seccion: 'Registro',
    items: [
      { ruta: 'miembros', texto: 'Miembros / Donantes', icono: 'users' },
      { ruta: 'familias', texto: 'Familias', icono: 'heart' },
      { ruta: 'aportaciones/nueva', texto: 'Nueva aportación', icono: 'plus-circle' },
      { ruta: 'aportaciones', texto: 'Historial de aportaciones', icono: 'list' },
    ],
  },
  {
    seccion: 'Documentos',
    items: [
      { ruta: 'recibos', texto: 'Recibos', icono: 'receipt' },
      { ruta: 'estados-cuenta', texto: 'Estados de cuenta', icono: 'file-text' },
      { ruta: 'cartas', texto: 'Cartas anuales', icono: 'mail' },
      { ruta: 'reportes', texto: 'Reportes', icono: 'bar-chart' },
    ],
  },
  {
    seccion: 'Administración',
    items: [
      { ruta: 'fondos', texto: 'Fondos', icono: 'layers' },
      { ruta: 'metodos-pago', texto: 'Métodos de pago', icono: 'credit-card' },
      { ruta: 'bitacora', texto: 'Bitácora', icono: 'clock' },
      { ruta: 'configuracion', texto: 'Configuración', icono: 'settings' },
    ],
  },
];

const UUID = '([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})';
const vista = (nombre) => () => import(`./views/${nombre}.js`);

const RUTAS = [
  { patron: /^inicio$/, modulo: vista('inicio'), menu: 'inicio' },
  { patron: /^miembros$/, modulo: vista('miembros'), fn: 'lista', menu: 'miembros' },
  { patron: /^miembros\/nuevo$/, modulo: vista('miembros'), fn: 'formulario', menu: 'miembros' },
  { patron: new RegExp(`^miembros/${UUID}$`), modulo: vista('miembros'), fn: 'detalle', menu: 'miembros' },
  { patron: new RegExp(`^miembros/${UUID}/editar$`), modulo: vista('miembros'), fn: 'formulario', menu: 'miembros' },
  { patron: /^familias$/, modulo: vista('familias'), fn: 'lista', menu: 'familias' },
  { patron: /^familias\/nueva$/, modulo: vista('familias'), fn: 'formulario', menu: 'familias' },
  { patron: new RegExp(`^familias/${UUID}$`), modulo: vista('familias'), fn: 'detalle', menu: 'familias' },
  { patron: new RegExp(`^familias/${UUID}/editar$`), modulo: vista('familias'), fn: 'formulario', menu: 'familias' },
  { patron: /^aportaciones\/nueva$/, modulo: vista('aportacion-nueva'), menu: 'aportaciones/nueva' },
  { patron: /^aportaciones$/, modulo: vista('aportaciones'), fn: 'lista', menu: 'aportaciones' },
  { patron: new RegExp(`^aportaciones/${UUID}$`), modulo: vista('aportaciones'), fn: 'detalle', menu: 'aportaciones' },
  { patron: /^recibos$/, modulo: vista('recibos'), menu: 'recibos' },
  { patron: /^estados-cuenta$/, modulo: vista('estados-cuenta'), menu: 'estados-cuenta' },
  { patron: /^cartas$/, modulo: vista('cartas'), menu: 'cartas' },
  { patron: /^reportes$/, modulo: vista('reportes'), menu: 'reportes' },
  { patron: /^fondos$/, modulo: vista('catalogos'), fn: 'fondos', menu: 'fondos' },
  { patron: /^metodos-pago$/, modulo: vista('catalogos'), fn: 'metodos', menu: 'metodos-pago' },
  { patron: /^bitacora$/, modulo: vista('bitacora'), menu: 'bitacora' },
  { patron: /^configuracion$/, modulo: vista('configuracion'), menu: 'configuracion' },
];

const raiz = () => $('#app');
let temporizadorInactividad = null;
let mensajeSiguienteLogin = null;

// ---------------------------------------------------------------------
// Arranque
// ---------------------------------------------------------------------
async function iniciar() {
  if (configuracionPendiente()) return pantallaConfiguracion();
  if (claveEsSecreta()) return pantallaClaveSecreta();

  sb.auth.onAuthStateChange((evento) => {
    // Diferido: no se deben hacer llamadas a Supabase dentro del callback.
    if (evento === 'SIGNED_OUT') setTimeout(alCerrarSesion, 0);
  });

  try {
    const { data } = await sb.auth.getSession();
    if (data?.session) await entrar(data.session, false);
    else irALogin();
  } catch (e) {
    irALogin(mensajeError(e));
  }
}

function irALogin(mensaje = null) {
  estado.usuario = null;
  detenerInactividad();
  cerrarModales();
  mostrarLogin(raiz(), {
    mensaje: mensaje || mensajeSiguienteLogin,
    alIngresar: (sesion) => entrar(sesion, true),
  });
  mensajeSiguienteLogin = null;
}

async function entrar(sesion, esNuevoIngreso) {
  pintar(raiz(), html`<div class="pantalla-carga"><div class="spinner" aria-hidden="true"></div><p>Verificando autorización…</p></div>`);
  const { data: autorizado, error } = await sb.rpc('es_super_admin');
  if (error || !autorizado) {
    mensajeSiguienteLogin = error
      ? mensajeError(error)
      : 'Su usuario no está autorizado para usar este sistema. Contacte al administrador.';
    await sb.auth.signOut();
    irALogin();
    return;
  }
  estado.usuario = sesion.user;
  try {
    await Promise.all([cargarConfiguracion(), cargarCatalogos()]);
  } catch (e) {
    pintar(raiz(), html`<div class="login"><div class="login-tarjeta">${alerta('error', mensajeError(e))}
      <button class="btn btn-primario btn-bloque mt-2" id="reintentar">Reintentar</button></div></div>`);
    $('#reintentar').addEventListener('click', () => location.reload());
    return;
  }
  if (esNuevoIngreso) registrarEvento('INICIAR_SESION', { descripcion: `Inicio de sesión: ${sesion.user.email}` });
  pintarEstructura();
  iniciarInactividad();
  if (!location.hash || location.hash === '#' || location.hash === '#/') location.hash = '#/inicio';
  else enrutar();
}

async function cerrarSesion({ porInactividad = false } = {}) {
  if (porInactividad) mensajeSiguienteLogin = 'Su sesión se cerró automáticamente por inactividad.';
  else await registrarEvento('CERRAR_SESION', { descripcion: `Cierre de sesión: ${estado.usuario?.email || ''}` });
  await sb.auth.signOut();
  alCerrarSesion();
}

function alCerrarSesion() {
  if (!estado.usuario && raiz().querySelector('.login')) return;
  irALogin();
}

// ---------------------------------------------------------------------
// Estructura (menú lateral + barra superior)
// ---------------------------------------------------------------------
export function urlLogo() {
  return estado.config?.logo_url || 'assets/logo.png';
}

function pintarEstructura() {
  const cfg = estado.config;
  pintar(raiz(), html`
    <div class="estructura">
      <aside class="menu" id="menu" aria-label="Menú principal">
        <div class="menu-marca">
          <a class="menu-logo" href="#/inicio" title="Ir al inicio">
            <img src="${urlLogo()}" alt="${cfg.nombre_iglesia} — ${cfg.lema || ''}" id="logo-menu">
          </a>
        </div>
        <nav>
          ${MENU.map((g) => html`
            ${g.seccion ? html`<div class="menu-seccion">${g.seccion}</div>` : ''}
            ${g.items.map((i) => html`<a href="#/${i.ruta}" data-menu="${i.ruta}">${icono(i.icono)}<span>${i.texto}</span></a>`)}
          `)}
          <div class="menu-seccion">Sesión</div>
          <a href="#" id="salir-menu">${icono('log-out')}<span>Cerrar sesión</span></a>
        </nav>
        <div class="menu-pie">Sistema de Administración de Aportaciones</div>
      </aside>
      <div class="velo-menu" id="velo-menu"></div>
      <div class="principal">
        <header class="barra">
          <button type="button" class="btn btn-icono boton-menu" id="abrir-menu" aria-label="Abrir menú" aria-controls="menu">${icono('menu')}</button>
          <h1 id="titulo-pagina">Inicio</h1>
          <div class="barra-usuario">
            <span class="correo" title="${estado.usuario.email}">${estado.usuario.email}</span>
            <span class="insignia">${icono('shield')} Super Admin</span>
            <button type="button" class="btn" id="salir">${icono('log-out')}<span>Cerrar sesión</span></button>
          </div>
        </header>
        <main class="contenido" id="contenido" tabindex="-1"></main>
      </div>
    </div>`);

  $('#logo-menu').addEventListener('error', (e) => { e.target.src = 'assets/logo.png'; }, { once: true });
  const salir = (e) => { e.preventDefault(); cerrarSesion(); };
  $('#salir').addEventListener('click', salir);
  $('#salir-menu').addEventListener('click', salir);
  $('#abrir-menu').addEventListener('click', () => {
    $('#menu').classList.add('abierto');
    $('#velo-menu').classList.add('visible');
  });
  $('#velo-menu').addEventListener('click', cerrarMenuMovil);
}

function cerrarMenuMovil() {
  $('#menu')?.classList.remove('abierto');
  $('#velo-menu')?.classList.remove('visible');
}

function ponerTitulo(texto) {
  const h = $('#titulo-pagina');
  if (h) h.textContent = texto;
  document.title = `${texto} · Sistema de Administración de Aportaciones`;
}

// Actualiza nombre y logo del menú cuando cambia la configuración.
export function refrescarMarca() {
  const img = $('#logo-menu');
  if (img) {
    img.src = urlLogo();
    img.alt = `${estado.config.nombre_iglesia} — ${estado.config.lema || ''}`;
  }
}

// ---------------------------------------------------------------------
// Enrutador (hash)
// ---------------------------------------------------------------------
function leerRuta() {
  const h = decodeURIComponent(location.hash.replace(/^#\/?/, '')) || 'inicio';
  const [ruta, qs] = h.split('?');
  return { ruta: ruta.replace(/\/+$/, ''), query: new URLSearchParams(qs || '') };
}

async function enrutar() {
  if (!estado.usuario || !$('#contenido')) return;
  cerrarModales();
  cerrarMenuMovil();
  const { ruta, query } = leerRuta();
  const r = RUTAS.find((x) => x.patron.test(ruta));
  if (!r) {
    location.hash = '#/inicio';
    return;
  }
  const params = ruta.match(r.patron).slice(1);
  $$('[data-menu]').forEach((a) => {
    const activo = a.dataset.menu === r.menu;
    a.classList.toggle('activo', activo);
    if (activo) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });

  // Cada vista escribe en su propio contenedor: si el usuario navega antes
  // de que termine de cargar, la vista anterior queda desconectada.
  const principal = $('#contenido');
  const cont = document.createElement('div');
  principal.replaceChildren(cont);
  pintar(cont, cargando());
  window.scrollTo(0, 0);

  let modulo;
  try {
    modulo = await r.modulo();
  } catch (e) {
    // El código de la sección no se pudo descargar (p. ej., el servidor local se cerró).
    console.error(e);
    if (cont.isConnected) {
      pintar(cont, alerta('error', html`
        <p><strong>No se pudo descargar esta sección de la aplicación.</strong></p>
        <p>Si usa el sistema en este equipo, verifique que la ventana <em>Servidor CEE</em> esté abierta
           (o haga doble clic en <code>iniciar-sistema.cmd</code>) y recargue la página.</p>
        <p><button type="button" class="btn mt-1" id="recargar-pagina">${icono('refresh')} Recargar página</button></p>`));
      $('#recargar-pagina', cont)?.addEventListener('click', () => location.reload());
    }
    return;
  }

  try {
    await modulo[r.fn || 'render']({ cont, params, query, titulo: ponerTitulo });
  } catch (e) {
    console.error(e);
    if (cont.isConnected) {
      pintar(cont, alerta('error', html`<p><strong>No se pudo cargar esta sección.</strong></p><p>${mensajeError(e)}</p>`));
    }
  }
}

window.addEventListener('hashchange', enrutar);

// ---------------------------------------------------------------------
// Cierre de sesión por inactividad
// ---------------------------------------------------------------------
const EVENTOS_ACTIVIDAD = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart'];
function reiniciarInactividad() {
  const minutos = Number(CONFIG.MINUTOS_INACTIVIDAD) || 0;
  clearTimeout(temporizadorInactividad);
  if (minutos > 0 && estado.usuario) {
    temporizadorInactividad = setTimeout(() => cerrarSesion({ porInactividad: true }), minutos * 60000);
  }
}
function iniciarInactividad() {
  EVENTOS_ACTIVIDAD.forEach((ev) => document.addEventListener(ev, reiniciarInactividad, { passive: true }));
  reiniciarInactividad();
}
function detenerInactividad() {
  clearTimeout(temporizadorInactividad);
  EVENTOS_ACTIVIDAD.forEach((ev) => document.removeEventListener(ev, reiniciarInactividad));
}

// ---------------------------------------------------------------------
// Pantallas de configuración inicial
// ---------------------------------------------------------------------
function pantallaConfiguracion() {
  pintar(raiz(), html`
    <div class="login"><div class="login-tarjeta" style="max-width:620px">
      <div class="login-marca"><img src="assets/logo.png" alt=""><h1>Centro Evangelístico Ebenezer</h1>
        <p class="sistema">Sistema de Administración de Aportaciones</p></div>
      ${alerta('advertencia', html`<p><strong>Configuración pendiente.</strong></p>
        <p>Abra el archivo <code>js/config.js</code> y coloque la <em>Project URL</em> y la clave pública
        <em>anon / publishable</em> de su proyecto de Supabase (Project Settings → API).</p>
        <p>Consulte el archivo <code>README.md</code> para la guía completa de instalación.</p>`)}
    </div></div>`);
}

function pantallaClaveSecreta() {
  pintar(raiz(), html`
    <div class="login"><div class="login-tarjeta" style="max-width:620px">
      ${alerta('error', html`<p><strong>Clave secreta detectada. La aplicación no se iniciará.</strong></p>
        <p>En <code>js/config.js</code> se colocó una clave <em>service_role / secret</em>. Esa clave da acceso
        total a la base de datos y nunca debe usarse en el navegador.</p>
        <p>Reemplácela por la clave pública <em>anon / publishable</em> y, por seguridad, <strong>rote la clave
        secreta</strong> en Supabase (Project Settings → API).</p>`)}
    </div></div>`);
}

iniciar();
