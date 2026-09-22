// Pantalla de inicio de sesión (Supabase Auth).
import { sb } from '../supabase.js';
import { html, pintar, $, alerta, mensajeError } from '../utils.js';
import { icono } from '../icons.js';

export async function mostrarLogin(raiz, { mensaje = null, alIngresar }) {
  let publicos = { nombre_iglesia: 'Centro Evangelístico Ebenezer', lema: 'Tocando a las Naciones', logo_url: null };

  const dibujar = (error = mensaje) => {
    pintar(raiz, html`
      <div class="login">
        <div class="login-tarjeta">
          <div class="login-marca">
            <img src="${publicos.logo_url || 'assets/logo.png'}" alt="Logo ${publicos.nombre_iglesia}" id="logo-login">
            <h1>${publicos.nombre_iglesia}</h1>
            <p class="sistema">Sistema de Administración de Aportaciones</p>
          </div>
          <form id="form-login" novalidate>
            <div id="mensaje-login">${error ? alerta('error', error) : ''}</div>
            <div class="campo">
              <label for="correo">Correo electrónico</label>
              <input id="correo" class="entrada" type="email" autocomplete="username" required inputmode="email">
            </div>
            <div class="campo">
              <label for="clave">Contraseña</label>
              <input id="clave" class="entrada" type="password" autocomplete="current-password" required>
            </div>
            <button type="submit" class="btn btn-primario" id="entrar">${icono('key')} Iniciar sesión</button>
          </form>
          <p class="login-pie">Acceso exclusivo para personal autorizado.</p>
        </div>
      </div>`);

    $('#logo-login').addEventListener('error', (e) => { e.target.src = 'assets/logo.png'; }, { once: true });
    const form = $('#form-login');
    const correo = $('#correo');
    const clave = $('#clave');
    correo.focus();

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = correo.value.trim();
      if (!email || !clave.value) {
        pintar($('#mensaje-login'), alerta('error', 'Ingrese su correo electrónico y contraseña.'));
        return;
      }
      const boton = $('#entrar');
      boton.disabled = true;
      boton.textContent = 'Verificando…';
      const { data, error: err } = await sb.auth.signInWithPassword({ email, password: clave.value });
      if (err || !data?.session) {
        boton.disabled = false;
        pintar(boton, html`${icono('key')} Iniciar sesión`);
        clave.value = '';
        clave.focus();
        pintar($('#mensaje-login'), alerta('error', mensajeError(err || new Error('No se pudo iniciar sesión.'))));
        return;
      }
      alIngresar(data.session);
    });
  };

  dibujar();

  // Nombre, lema y logo configurados (información pública).
  try {
    const { data } = await sb.rpc('datos_publicos_iglesia');
    if (data && raiz.querySelector('#form-login') && !$('#correo').value) {
      publicos = { ...publicos, ...Object.fromEntries(Object.entries(data).filter(([, v]) => v)) };
      dibujar();
    }
  } catch {
    /* se mantienen los datos predeterminados */
  }
}
