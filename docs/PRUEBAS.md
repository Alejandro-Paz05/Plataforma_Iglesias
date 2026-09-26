# Pruebas y verificación por fases

El sistema se verifica en tres niveles. Antes de usar el sistema con datos reales (y después de cualquier cambio
en la base de datos) ejecute al menos el **nivel 1** en el proyecto de Supabase.

| Nivel | Qué verifica | Dónde se ejecuta | Resultado esperado |
|---|---|---|---|
| 1. Verificación SQL | Integridad financiera, numeración, anulación/corrección, inmutabilidad, bitácora, RLS, familias, anónimos, grupos familiares | SQL Editor de Supabase | 60 + 17 + 17 + 16 pruebas **OK** |
| 2. Migraciones en PGlite | Que las migraciones se instalan en PostgreSQL limpio y pasan la verificación | Navegador local | 9 migraciones OK + 60 + 17 + 17 + 16 pruebas OK |
| 3. Escenario de interfaz | Flujos completos de la aplicación y generación de PDF (con datos simulados) | Navegador local | 68 verificaciones OK, sin errores |

---

## Nivel 1 — Verificación en Supabase

1. Abra Supabase → **SQL Editor** → *New query*.
2. Pegue el contenido completo de `supabase/pruebas/verificacion_fase1.sql` y pulse **Run**.
3. El resultado es una tabla: **todas** las filas deben decir `OK`.
4. Repita con `supabase/pruebas/verificacion_familias.sql` (17 pruebas) `supabase/pruebas/verificacion_anonimos.sql` (17 pruebas) y `supabase/pruebas/verificacion_grupos_familiares.sql` (16 pruebas).

La verificación crea usuarios, miembros y aportaciones de prueba **dentro de una subtransacción que se revierte**:
no deja datos, no consume números de recibo ni de miembro y no deja registros en la bitácora.

## Nivel 2 — Migraciones en PostgreSQL local (PGlite)

Requiere Internet (descarga PGlite, PostgreSQL compilado a WebAssembly).

```powershell
powershell -ExecutionPolicy Bypass -File .\servidor-local.ps1
```

Abra `http://localhost:8080/tests/sql-pglite.html` (migraciones por separado) o
`http://localhost:8080/tests/sql-pglite.html?completa` (instalador único). El entorno simula los roles
`anon`/`authenticated` y los esquemas `auth` y `storage` de Supabase.

## Nivel 3 — Escenario de interfaz con datos simulados

Con el servidor local activo, abra:

- `http://localhost:8080/tests/demo.html` → la aplicación con datos de ejemplo en memoria (contraseña de la
  pantalla de acceso de demostración: `demo`, usando `demo.html?login`).
- `http://localhost:8080/tests/escenario.html` → ejecuta automáticamente los flujos principales (registrar,
  validar, anular, corregir, estado de cuenta, cartas, reportes, miembros, fondos, bitácora) y muestra el
  resultado al final de la página.

> La carpeta `tests/` es solo para desarrollo: **no la publique** (use `scripts/preparar-publicacion.ps1`).

---

## Lista de verificación manual por fase (con Supabase real)

Marque cada punto después de instalar. Antes de avanzar a la siguiente fase, confirme que la anterior está completa.

### Fase 1 — Base de datos y seguridad
- [ ] Las 9 migraciones (o `instalacion_completa.sql`) se ejecutaron sin errores.
- [ ] `verificacion_fase1.sql`, `verificacion_familias.sql`, `verificacion_anonimos.sql` y `verificacion_grupos_familiares.sql` → todas las pruebas **OK**.
- [ ] *Table Editor*: cada tabla muestra el indicador de **RLS habilitado**.
- [ ] *Storage*: existen los buckets `institucional` (público) y `documentos` (privado).

### Fase 2 — Autenticación Super Admin
- [ ] Registro público desactivado (*Authentication → Sign In / Providers → Allow new users to sign up* = off).
- [ ] Usuario Super Admin creado y registrado con `registrar_super_admin`.
- [ ] Inicio de sesión correcto con ese usuario.
- [ ] Un usuario de Auth **no** registrado como administrador recibe “no está autorizado”.
- [ ] Contraseña incorrecta → mensaje “Correo o contraseña incorrectos”.
- [ ] La sesión se cierra tras el tiempo de inactividad configurado (`MINUTOS_INACTIVIDAD`).

### Fase 3 — Dashboard
- [ ] Indicadores de hoy, mes, año y miembros activos coinciden con los datos.
- [ ] Una aportación anulada no suma en los indicadores.

### Fase 4 — Miembros/Donantes
- [ ] Al crear un miembro se asigna `EBE-000001`, `EBE-000002`, … automáticamente.
- [ ] La búsqueda funciona por número, nombre, apellido (con o sin acentos), teléfono y email.
- [ ] Un miembro con aportaciones **no** puede eliminarse; sí puede desactivarse.

### Fase 4b — Familias
- [ ] Al crear una familia se asigna `FAM-000001`, `FAM-000002`, … automáticamente.
- [ ] Se pueden agregar y quitar miembros (desde la familia o desde el formulario del miembro).
- [ ] La carta anual familiar suma las aportaciones válidas de todos sus miembros.
- [ ] En el lote, una familia con carta conjunta recibe una sola carta; sin carta conjunta, una por persona.
- [ ] Eliminar una familia conserva a sus miembros y sus aportaciones.

### Fase 4c — Aportaciones anónimas
- [ ] En *Nueva aportación*, **Aportación anónima** elige al registro "Anónimo" y el recibo dice "Recibido de: Anónimo".
- [ ] "Anónimo" aparece en el historial, en el reporte por miembro y tiene estado de cuenta.
- [ ] "Anónimo" no aparece al buscar para la carta anual ni para agregar a una familia; el lote de cartas lo omite y lo indica.
- [ ] La ficha de "Anónimo" no permite desactivarlo ni eliminarlo; su nombre no se puede cambiar.
- [ ] El panel de inicio no lo cuenta como miembro, pero sus aportaciones sí suman en los totales.

### Fase 4d — Grupos Familiares
- [ ] En *Nueva aportación*, **Grupos Familiares** elige ese registro y se genera su recibo.
- [ ] Tiene estado de cuenta, aparece en los reportes y recibe carta anual (individual y en el lote).
- [ ] No aparece al buscar para agregar a una familia; su ficha no permite desactivarlo ni eliminarlo; su nombre no cambia.

### Fase 5 — Fondos y métodos de pago
- [ ] Se pueden crear, editar y desactivar.
- [ ] Un fondo/método con aportaciones no puede eliminarse.
- [ ] Un fondo/método inactivo no aparece al registrar aportaciones.

### Fase 6 — Aportaciones
- [ ] Se genera el recibo `EBE-AAAA-000001` y es consecutivo.
- [ ] Montos 0, negativos o con más de dos decimales son rechazados.
- [ ] Una fecha futura es rechazada.
- [ ] Anular exige motivo; la aportación se conserva como **ANULADA** y deja de sumar.
- [ ] Corregir crea un recibo nuevo; el original queda **CORREGIDA** y enlazado.
- [ ] No existe forma de eliminar una aportación ni de modificar su monto.

### Fase 7 — Recibos
- [ ] Vista previa, impresión y descarga en PDF.
- [ ] Un recibo anulado muestra la marca de agua y el motivo.

### Fase 8 — Estados de cuenta
- [ ] El total del período excluye anuladas/corregidas.
- [ ] El PDF incluye logo, datos institucionales, miembro, período, detalle y total.

### Fase 9 — Cartas anuales
- [ ] Con bienes o servicios se usa la plantilla correspondiente (y viceversa).
- [ ] El texto puede ajustarse antes de generar; los textos base se editan en Configuración.
- [ ] Generación por lote produce una carta por donante.
- [ ] “Archivar copia” guarda el PDF en el bucket privado `documentos`.

### Fase 10 — Reportes
- [ ] Los 10 reportes muestran totales correctos y se exportan a PDF y CSV.

### Fase 11 — Bitácora
- [ ] Registra creación/modificación de miembros, aportaciones, anulaciones, correcciones, fondos, métodos,
      configuración, inicios de sesión, documentos y exportaciones.
- [ ] El detalle muestra los valores anteriores y nuevos.

### Fase 12 — Configuración, PDF y respaldo
- [ ] Datos institucionales, EIN, responsable y zona horaria guardados.
- [ ] Logo oficial subido y visible en la aplicación y en los PDF.
- [ ] Respaldo JSON descargado y guardado de forma cifrada (ver `docs/RESPALDOS.md`).
- [ ] Respaldo técnico (`scripts/respaldo-bd.ps1`) ejecutado y restauración probada en un proyecto de prueba.
