# Sistema de Administración de Aportaciones

**Centro Evangelístico Ebenezer — “Tocando a las Naciones”**

Aplicación web para administrar miembros/donantes y registrar, consultar, controlar y reportar sus aportaciones:
recibos, estados de cuenta, cartas anuales de contribuciones, reportes, bitácora y respaldos.

- **Backend:** Supabase (PostgreSQL, Auth, Row Level Security, Storage).
- **Frontend:** aplicación web estática (HTML, CSS y JavaScript con módulos). No requiere compilación ni Node.js.
- **Idioma:** español · **Moneda:** USD · **Fechas:** MM/DD/AAAA en la zona horaria configurada de la iglesia.
- **Acceso:** un nivel, **SUPER ADMIN**.

---

## Contenido

1. [Estructura del proyecto](#1-estructura-del-proyecto)
2. [Instalación paso a paso](#2-instalación-paso-a-paso)
3. [Uso diario](#3-uso-diario)
4. [Reglas financieras](#4-reglas-financieras)
5. [Seguridad](#5-seguridad)
6. [Administradores](#6-administradores)
7. [Respaldos](#7-respaldos)
8. [Pruebas](#8-pruebas)
9. [Solución de problemas](#9-solución-de-problemas)
10. [Mantenimiento](#10-mantenimiento)

---

## 1. Estructura del proyecto

```
index.html                 Página principal de la aplicación
_headers                   Encabezados de seguridad (Netlify / Cloudflare Pages)
assets/logo.png            Logo oficial (versión con fondo transparente)
assets/icono.png           Ícono de la pestaña del navegador
docs/identidad/            Archivo original del logo oficial
css/styles.css             Estilos (azul institucional en la variable --azul)
js/config.js               ← URL y clave pública de Supabase (configurar)
js/app.js                  Autenticación, menú y rutas
js/pdf.js                  Recibos, estados de cuenta, cartas y reportes en PDF
js/views/*.js              Pantallas (inicio, miembros, aportaciones, recibos, …)
vendor/                    Librerías locales: supabase-js 2.117.0, jsPDF 4.2.1, AutoTable 5.0.8
supabase/migrations/       Migraciones SQL por orden (FASE 1)
supabase/instalacion_completa.sql   Las 8 migraciones en un solo archivo
supabase/pruebas/verificacion_fase1.sql   Verificación automática (60 pruebas)
supabase/pruebas/verificacion_familias.sql   Verificación de familias (17 pruebas)
supabase/pruebas/verificacion_anonimos.sql   Verificación de aportaciones anónimas (17 pruebas)
scripts/                   Respaldo técnico, preparación de publicación, generador del SQL
docs/RESPALDOS.md          Política de respaldo y recuperación
docs/PRUEBAS.md            Pruebas y lista de verificación por fase
tests/                     Pruebas de desarrollo (NO publicar)
servidor-local.ps1         Servidor para probar en este equipo
```

---

## 2. Instalación paso a paso

### 2.1 Crear el proyecto en Supabase

1. Cree una cuenta en <https://supabase.com> y un **proyecto nuevo** (región cercana a la iglesia).
2. Guarde la contraseña de la base de datos en un gestor de contraseñas. **No** la escriba en archivos del proyecto.
3. Para uso real se recomienda un plan con copias de seguridad diarias (ver `docs/RESPALDOS.md`).

### 2.2 Crear la base de datos (FASE 1)

1. Supabase → **SQL Editor** → *New query*.
2. Pegue **todo** el contenido de `supabase/instalacion_completa.sql` y pulse **Run** (una sola vez).
   *Alternativa:* ejecutar los 8 archivos de `supabase/migrations/` en orden, o `supabase db push` con la CLI.
3. Verifique: pegue `supabase/pruebas/verificacion_fase1.sql` y pulse **Run**. **Las 60 pruebas deben decir OK.**
   Después pegue `supabase/pruebas/verificacion_familias.sql` y pulse **Run**: **las 17 pruebas deben decir OK.**
   Por último pegue `supabase/pruebas/verificacion_anonimos.sql` y pulse **Run**: **las 17 pruebas deben decir OK.**

> **¿Ya tenía instalada la versión anterior (sin familias)?** No vuelva a ejecutar `instalacion_completa.sql`.
> Pegue solo `supabase/migrations/20260922000700_familias.sql` en el SQL Editor, pulse **Run** una vez y
> luego ejecute `verificacion_familias.sql`. No modifica ni borra los datos existentes.
>
> **¿Ya tenía instalada la versión anterior (sin aportaciones anónimas)?** Pegue solo
> `supabase/migrations/20260926000800_aportaciones_anonimas.sql`, pulse **Run** una vez y luego ejecute
> `verificacion_anonimos.sql`. Crea el registro **"Anónimo"** y no modifica los demás datos. Si ya tenía un miembro
> creado a mano para las aportaciones anónimas, escriba su número en la línea indicada del archivo antes de ejecutarlo.

Esto crea las tablas, restricciones, numeración segura, triggers de integridad, bitácora, políticas RLS,
fondos y métodos iniciales, configuración inicial y los buckets de Storage.

### 2.3 Configurar la autenticación y el SUPER ADMIN (FASE 2)

1. **Desactive el registro público:** *Authentication → Sign In / Providers →* desactive
   **“Allow new users to sign up”**. (Aunque alguien se registrara, no vería nada sin ser administrador.)
2. Cree el usuario: *Authentication → Users → Add user → Create new user* con el correo del Super Admin,
   una contraseña robusta (12+ caracteres) y **Auto Confirm User** activado.
3. Autorícelo como Super Admin en el **SQL Editor**:
   ```sql
   select public.registrar_super_admin('correo@iglesia.org', 'Nombre Apellido');
   ```
4. Opcional: en *Authentication → URL Configuration* coloque la URL donde publicará la aplicación.

### 2.4 Conectar la aplicación

Abra `js/config.js` y complete con los datos de *Project Settings → API* (o *Connect*):

```js
export const CONFIG = {
  SUPABASE_URL: 'https://abcdefghijk.supabase.co',
  SUPABASE_ANON_KEY: 'eyJ...  (clave pública anon)  o  sb_publishable_...',
  MINUTOS_INACTIVIDAD: 30,
};
```

> ⚠ Use **solo** la clave pública *anon/publishable*. **Nunca** la clave *service_role / secret*: la aplicación
> se niega a iniciar si la detecta.

### 2.5 Probar en este equipo

```powershell
powershell -ExecutionPolicy Bypass -File .\servidor-local.ps1
```

Abra <http://localhost:8080> e inicie sesión con el Super Admin. (Abrir `index.html` con doble clic no funciona:
los módulos de JavaScript requieren un servidor.)

### 2.6 Publicar en Internet (HTTPS)

1. Genere la carpeta de publicación (excluye pruebas, SQL y documentación):
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\scripts\preparar-publicacion.ps1
   ```
2. Publique la carpeta `publicar/` en un hosting estático con HTTPS, por ejemplo:
   - **Netlify:** *Add new site → Deploy manually* y arrastre la carpeta `publicar`.
   - **Cloudflare Pages:** *Create → Pages → Upload assets*.
   - Cualquier servidor web con HTTPS (IIS, Nginx, Apache) sirviendo archivos estáticos.
3. El archivo `_headers` aplica encabezados de seguridad en Netlify y Cloudflare Pages. En otros servidores,
   configure encabezados equivalentes (X-Frame-Options DENY, nosniff, HSTS, Referrer-Policy).
4. Si usa un dominio personalizado de Supabase (no `*.supabase.co`), agréguelo a la política CSP de `index.html`.

### 2.7 Identidad institucional

1. Inicie sesión y vaya a **Configuración → Datos institucionales**: dirección, teléfono, email, sitio web, **EIN**,
   nombre y cargo del responsable que firma, y **zona horaria**.
2. **Logo oficial:** ya está incluido (`assets/logo.png`, generado del original en `docs/identidad/` con fondo
   transparente). Se usa en la pantalla de acceso, el menú y todos los PDF. Si en el futuro cambia, puede subir otro
   desde *Configuración → Subir logo oficial* (PNG/JPG/WEBP, máx. 2 MB) o reemplazar `assets/logo.png`.
3. **Color institucional:** azul del logo, `#101B6F` (variable `--azul` en `css/styles.css` y `AZUL` en `js/pdf.js`).
4. **Textos de documentos:** *Configuración → Textos de documentos*. **Revise las cartas anuales con su asesor
   fiscal o contador** antes de emitirlas.

---

## 3. Uso diario

```
Iniciar sesión → Inicio (indicadores) → Miembros/Donantes → Familias → Nueva aportación → Recibo
              → Estados de cuenta → Cartas anuales → Reportes → Bitácora
```

- **Nueva aportación:** busque al miembro por nombre, número, teléfono o email; indique fecha, fondo, monto, método,
  referencia y si hubo bienes o servicios. Al guardar se muestra el número de recibo con las opciones
  **VER RECIBO · GENERAR PDF · NUEVA APORTACIÓN**. La fecha, el fondo y el método se recuerdan para capturas en lote.
- **Historial:** filtros por recibo, miembro, fechas, fondo, método y estado; totales válidos; exportación CSV.
- **Recibos:** individuales o todos los listados en un solo PDF (útil después de cada servicio).
- **Familias:** agrupan a varias personas (por ejemplo, un matrimonio). Cada aportación sigue registrada a nombre
  de quien la dio; la familia solo las reúne para los documentos. Se crean en *Familias → Nueva familia* o desde el
  formulario del miembro (*Familia → + Crear familia nueva…*). Si la familia tiene **carta conjunta**, el lote de
  cartas genera una sola carta con el total de todos sus miembros.
- **Aportaciones anónimas:** en *Nueva aportación* pulse **Aportación anónima** (o busque "Anónimo"). Quedan a nombre
  del registro del sistema **"Anónimo"**, que aparece así en el historial, los reportes, los recibos y su estado de
  cuenta, y cuenta en todos los totales. No recibe carta anual, no puede pertenecer a una familia ni eliminarse o
  desactivarse. Para la ofrenda en efectivo basta una aportación por servicio (p. ej., "Ofrenda servicio domingo").
- **Estados de cuenta:** por miembro, por familia o de "Anónimo" y período, con vista previa, impresión y PDF.
- **Cartas anuales:** individual o familiar (con texto editable) o **por lote** (un PDF con una carta por donante
  o familia), y **archivo privado** de copias en Storage.
- **Reportes:** del día, por rango, mensual, anual, por miembro, por fondo, por método (todos o uno solo, p. ej. solo Efectivo), anuladas, miembros activos e
  inactivos; exportables a PDF y CSV (Excel).

---

## 4. Reglas financieras

Estas reglas se aplican **en la base de datos** (triggers, restricciones y privilegios), no solo en la pantalla:

| Regla | Cómo se garantiza |
|---|---|
| Las aportaciones no se eliminan | Sin privilegio `DELETE` + trigger que bloquea `DELETE` y `TRUNCATE` incluso al propietario |
| Montos siempre mayores que $0.00 | Restricción `CHECK (monto > 0)` + validación en pantalla |
| Datos financieros inmutables | Trigger: miembro, fecha, fondo, monto, método y bienes/servicios no pueden cambiar |
| Anulación con trazabilidad | Estado `ANULADA` con motivo obligatorio (mín. 5 caracteres), fecha y usuario; el registro se conserva |
| Corrección enlazada | La corrección crea un recibo nuevo (`corrige_aportacion_id`); el original pasa a `CORREGIDA` (`corregida_por_id`). Solo una corrección por aportación |
| Recibos únicos y consecutivos | `EBE-AAAA-000001` generado en el servidor con contador transaccional + `UNIQUE`; el cliente no puede enviarlo |
| Números de miembro | `EBE-000001` generado en el servidor, inmutable; el UUID es el identificador interno |
| Totales | Solo suman aportaciones `REGISTRADA`; se calculan en la base de datos o en centavos |
| Fechas | No se aceptan fechas futuras (según la zona horaria de la iglesia) |
| Catálogos y miembros con historial | No se eliminan si tienen aportaciones; se desactivan |
| Datos sensibles de pago | No se almacenan números de tarjeta, CVV, credenciales ni datos bancarios |

Para eliminar físicamente una aportación en una situación **extraordinaria** (por ejemplo, una orden legal) se
requiere acceso directo a la base de datos, desactivar el trigger `aportaciones_no_eliminar` y documentarlo.
No es un procedimiento normal.

---

## 5. Seguridad

- **Autenticación:** Supabase Auth. Las contraseñas nunca se guardan en tablas de la aplicación.
- **Autorización en el servidor:** todas las tablas tienen **RLS**; solo usuarios presentes y activos en
  `administradores` con rol `SUPER_ADMIN` pueden leer o escribir (`public.es_super_admin()`).
- **Privilegios mínimos:** el rol anónimo no tiene acceso a ninguna tabla; el rol autenticado solo tiene los
  privilegios necesarios (por ejemplo, en `aportaciones` solo puede insertar/actualizar columnas permitidas).
- **Bitácora inmutable:** se escribe mediante triggers; nadie puede modificarla ni borrarla desde la aplicación.
- **Claves:** el navegador solo usa la clave pública. La aplicación rechaza claves *service_role*. La cadena de
  conexión de la base de datos solo se usa en respaldos mediante una **variable de entorno**.
- **Sesión:** se guarda en `sessionStorage` (termina al cerrar el navegador) y se cierra por inactividad.
- **Navegador:** política CSP estricta (solo scripts propios), todo el contenido se escapa antes de mostrarse y
  las exportaciones CSV están protegidas contra inyección de fórmulas.
- **Storage:** el bucket `documentos` es privado (solo Super Admin, sin modificación ni borrado desde la app).
  El bucket `institucional` es de lectura pública **solo** para el logo; no suba allí información de miembros.

---

## 6. Administradores

Por seguridad, los administradores se gestionan **solo desde el SQL Editor**:

```sql
-- Agregar (el usuario debe existir en Authentication → Users)
select public.registrar_super_admin('nuevo@iglesia.org', 'Nombre');

-- Desactivar (conserva la trazabilidad en la bitácora)
update public.administradores set activo = false where email = 'persona@iglesia.org';

-- Ver administradores
select email, nombre, rol, activo, created_at from public.administradores;
```

No elimine usuarios de Auth que tengan historial: desactívelos. La base de datos impide borrar usuarios que
registraron operaciones, para conservar la trazabilidad.

---

## 7. Respaldos

Resumen (detalle en **`docs/RESPALDOS.md`**):

- **Mensual:** *Configuración → Respaldo → Respaldo completo (JSON)*, guardado en un medio cifrado.
- **Semanal (técnico):** `scripts/respaldo-bd.ps1` con `pg_dump` (cadena de conexión en variable de entorno).
- **Proveedor:** copias automáticas de Supabase según el plan.
- **Trimestral:** prueba de restauración en un proyecto de prueba.

---

## 8. Pruebas

Detalle en **`docs/PRUEBAS.md`**. En resumen:

- `supabase/pruebas/verificacion_fase1.sql` → 60 pruebas automáticas de integridad y seguridad (no deja datos).
- `supabase/pruebas/verificacion_familias.sql` → 17 pruebas de familias (no deja datos).
- `supabase/pruebas/verificacion_anonimos.sql` → 17 pruebas de aportaciones anónimas (no deja datos).
- `tests/sql-pglite.html` → instala las migraciones en PostgreSQL local (PGlite) y ejecuta la verificación.
- `tests/escenario.html` → recorre los flujos de la interfaz con datos simulados y genera los PDF.

---

## 9. Solución de problemas

| Síntoma | Causa probable / solución |
|---|---|
| “Configuración pendiente” | Complete `js/config.js` (URL y clave pública). |
| “Clave secreta detectada” | Se usó la clave *service_role*: cámbiela por la *anon/publishable* y **rote** la secreta. |
| “Su usuario no está autorizado” | Falta ejecutar `registrar_super_admin` para ese correo, o el administrador está inactivo. |
| “Correo o contraseña incorrectos” | Verifique las credenciales; restablezca la contraseña desde *Authentication → Users*. |
| Pantalla en blanco al abrir `index.html` con doble clic | Use `servidor-local.ps1` o publíquela en un hosting. |
| No se muestra el logo | Verifique que el bucket `institucional` exista y sea público; vuelva a subir el logo. |
| “No se pudo conectar con el servidor” | Sin Internet o el proyecto de Supabase está pausado (plan gratuito tras inactividad). |
| La vista previa del PDF no aparece (algunas tabletas) | Use “Abrir en pestaña nueva” o “Descargar PDF”. |

---

## 10. Mantenimiento

- **Cambios de base de datos:** agregue una nueva migración numerada en `supabase/migrations/`, regenere el
  instalador (`scripts/generar-instalacion-sql.ps1`) y vuelva a ejecutar la verificación.
- **Librerías:** están en `vendor/` con versiones fijas. Para actualizarlas, descargue la nueva versión UMD, pruebe
  con `tests/escenario.html` y actualice este README.
- **Nuevos niveles de acceso:** el campo `administradores.rol` y la función `es_super_admin()` son el punto de
  extensión para agregar roles (por ejemplo, un tesorero de solo lectura) con nuevas políticas RLS.
