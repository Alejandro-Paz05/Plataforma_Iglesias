# Política de respaldo y recuperación

**Sistema de Administración de Aportaciones · Centro Evangelístico Ebenezer**

Usar Supabase **no sustituye** una política propia de respaldo. La información de miembros y aportaciones es
personal y financiera: debe poder recuperarse ante errores, fallas del proveedor o pérdida de acceso a la cuenta,
y debe protegerse mientras está respaldada.

---

## 1. Qué se respalda y cómo

| Nivel | Qué contiene | Quién | Frecuencia | Herramienta |
|---|---|---|---|---|
| **A. Respaldo de la aplicación** | Todas las tablas (miembros, aportaciones, fondos, métodos, configuración, administradores, bitácora) en JSON, más CSV de miembros y aportaciones | Super Admin (sin conocimientos técnicos) | **Mensual**, y siempre después del cierre anual | *Configuración → Respaldo* |
| **B. Respaldo técnico de la base de datos** | Estructura completa (tablas, funciones, triggers, políticas RLS) + datos + usuarios de Auth | Persona técnica | **Semanal** | `scripts/respaldo-bd.ps1` (pg_dump) |
| **C. Respaldo del proveedor** | Copias automáticas de Supabase | Supabase | Según el plan | Panel: *Database → Backups* |
| **D. Documentos archivados** | PDF de cartas anuales en el bucket privado `documentos` | Super Admin | Anual | Descarga desde Supabase → *Storage* |

> **Importante:** Revise en su panel (*Database → Backups*) qué copias incluye su plan de Supabase. En el plan
> gratuito no debe asumirse que existan copias recuperables, y los proyectos gratuitos pueden pausarse por
> inactividad. Para producción se recomienda un plan de pago con copias diarias (y, si es posible, *Point in Time Recovery*).
>
> Los respaldos de base de datos **no incluyen los archivos de Storage** (logo y cartas archivadas): respáldelos aparte (nivel D).

### Regla 3-2-1

Mantenga **3 copias** de los datos (Supabase + 2 respaldos), en **2 medios distintos** (por ejemplo, disco cifrado
y nube privada), con **1 copia fuera** de las instalaciones de la iglesia.

---

## 2. Procedimiento A — Respaldo mensual desde la aplicación

1. Inicie sesión como Super Admin.
2. Vaya a **Configuración → Respaldo**.
3. Pulse **Respaldo completo (JSON)**. Opcionalmente descargue también **Miembros (CSV)** y **Aportaciones (CSV)**.
4. Mueva los archivos a una ubicación **cifrada** (BitLocker, unidad USB cifrada o carpeta privada de la nube
   con verificación en dos pasos). **No** los envíe por correo ni los deje en *Descargas*.
5. Nombre de carpeta sugerido: `Respaldos CEE/AAAA/AAAA-MM/`.
6. La exportación queda registrada en la bitácora (acción `EXPORTAR_DATOS`).

El archivo JSON conserva todos los campos (incluidos UUID, estados, motivos de anulación y vínculos de corrección),
por lo que un técnico puede reconstruir la información a partir de él si fuera necesario.

---

## 3. Procedimiento B — Respaldo técnico semanal (pg_dump)

**Requisitos:** herramientas cliente de PostgreSQL (`pg_dump`, `pg_restore`, `psql`) con versión igual o superior
a la del servidor de Supabase.

1. Obtenga la cadena de conexión en Supabase → **Connect** → *Session pooler*.
2. Defínala **solo como variable de entorno** (nunca en un archivo del proyecto):
   ```powershell
   $env:SUPABASE_DB_URL = 'postgresql://postgres.xxxx:CONTRASEÑA@aws-0-us-east-1.pooler.supabase.com:5432/postgres'
   ```
3. Ejecute:
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\scripts\respaldo-bd.ps1 -Destino "D:\RespaldosCEE"
   ```
4. Se generan `cee-AAAAMMDD-HHmm-public.dump`, `cee-AAAAMMDD-HHmm-auth-usuarios.sql` y sus huellas `.sha256`.
5. Copie la carpeta a las dos ubicaciones de la regla 3-2-1.
6. Cierre la ventana de PowerShell para que la variable con la contraseña desaparezca.

---

## 4. Recuperación

### 4.1 Error de captura (caso más común)

No se restaura nada: la aportación se **anula** o se **corrige** desde la aplicación. El registro original se conserva
y la bitácora muestra quién hizo el cambio, cuándo y por qué.

### 4.2 Restaurar desde el respaldo del proveedor

En Supabase → *Database → Backups*, elija la copia y siga el asistente. Esto reemplaza el estado de la base de datos;
coordínelo con el Super Admin y registre la fecha y el motivo.

### 4.3 Restaurar un respaldo técnico en un proyecto nuevo

1. Cree un proyecto nuevo en Supabase y obtenga su cadena de conexión (`$env:DESTINO_DB_URL`).
2. Verifique la integridad de los archivos:
   ```powershell
   Get-FileHash .\cee-AAAAMMDD-HHmm-public.dump -Algorithm SHA256   # compare con el .sha256
   ```
3. Restaure primero los usuarios de Auth (las tablas de la aplicación hacen referencia a ellos):
   ```powershell
   psql "$env:DESTINO_DB_URL" -v ON_ERROR_STOP=1 -f .\cee-AAAAMMDD-HHmm-auth-usuarios.sql
   ```
4. Restaure el esquema de la aplicación y sus datos:
   ```powershell
   pg_restore --dbname="$env:DESTINO_DB_URL" --no-owner --no-privileges --clean --if-exists .\cee-AAAAMMDD-HHmm-public.dump
   ```
5. Vuelva a ejecutar la migración de seguridad (`supabase/migrations/20260922000400_seguridad_rls.sql`) y la de
   Storage (`20260922000600_storage.sql`) para garantizar privilegios, políticas y buckets.
6. Ejecute `supabase/pruebas/verificacion_fase1.sql`: todas las pruebas deben decir **OK**.
7. Actualice `js/config.js` con la URL y la clave pública del nuevo proyecto, y vuelva a subir el logo.
8. Revise en la aplicación: totales del año, estado de cuenta de un miembro y últimos registros de la bitácora.

> Si `pg_restore` informa conflictos con objetos existentes del esquema `public`, repita el paso 4 sobre un proyecto
> recién creado. Documente cualquier incidencia.

### 4.4 Prueba de restauración (obligatoria)

**Cada trimestre**, restaure el último respaldo técnico en un proyecto de prueba siguiendo 4.3 y compare:
cantidad de miembros, cantidad de aportaciones, total válido del año y último número de recibo. Un respaldo que
nunca se ha probado no es un respaldo confiable.

---

## 5. Protección de la información respaldada

- Los respaldos contienen nombres, direcciones, teléfonos, correos y montos donados: trátelos como **confidenciales**.
- Guárdelos solo en medios **cifrados** y con acceso limitado al Super Admin y al responsable técnico.
- No use memorias USB sin cifrar, carpetas compartidas públicas ni correo electrónico.
- Conserve los registros financieros el tiempo que indique su contador (comúnmente **al menos 7 años**) y
  elimine de forma segura las copias vencidas.
- Si se pierde un medio con respaldos, informe al liderazgo de la iglesia y evalúe cambiar contraseñas y claves.
- Rote la contraseña de la base de datos si se sospecha que la cadena de conexión fue expuesta.

---

## 6. Registro de respaldos (sugerido)

| Fecha | Tipo (A/B/C/D) | Responsable | Ubicación | Verificado (sí/no) | Observaciones |
|---|---|---|---|---|---|
| | | | | | |
