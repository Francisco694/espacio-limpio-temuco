# Documentación Técnica - CRM Espacio Limpio

## 1. Descripción General del Proyecto
**Espacio Limpio CRM** es un sistema web de gestión (SaaS) diseñado para la administración de clientes, agendamiento de servicios, generación de cotizaciones y control de personal. 

Está construido bajo una arquitectura de **Single Page Application (SPA) simulada**, utilizando Vanilla JavaScript (sin frameworks como React o Angular), lo que lo hace extremadamente rápido y ligero.

---

## 2. Tecnologías Utilizadas
* **Frontend:** HTML5, CSS3, Vanilla JavaScript (ES6).
* **Estilos:** Tailwind CSS (cargado vía CDN para desarrollo rápido).
* **Base de Datos & Backend:** Firebase Firestore (NoSQL).
* **Autenticación:** Firebase Authentication.
* **Librerías Externas:**
  * `Lucide Icons`: Para la iconografía de la interfaz.
  * `Chart.js`: Para la renderización de gráficos en el módulo de Reportes.
  * `FullCalendar`: Para la visualización del calendario de agendamientos.

---

## 3. Estructura de la Base de Datos (Firestore)
El sistema utiliza una base de datos NoSQL basada en colecciones y documentos.

1. **`usuarios`**: Controla el acceso al sistema (RBAC).
   * *Campos:* `nombre`, `email`, `rol` (admin/colaborador), `estado` (activo/bloqueado), `creadoEn`.
2. **`clientes`**: Directorio de clientes de la empresa.
   * *Campos:* `nombre`, `rut`, `telefono`, `correo`, `direccion`, `fechaRegistro`.
3. **`cotizaciones`**: El núcleo comercial del sistema.
   * *Campos:* `cliente`, `servicio`, `m2`, `personal`, `valorSubtotal`, `valorTotal`, `estadoCRM` (Borrador/Pendiente/Aprobada/Rechazada), `fechaAgendada`.
4. **`configuracion / precios`**: (Documento único) Almacena las tarifas dinámicas del negocio.
   * *Campos:* `base_hogar`, `base_oficina`, `m2_hogar`, `extra_personal`, etc.

---

## 4. Control de Acceso y Roles (RBAC)
El sistema maneja dos niveles de privilegio. La validación ocurre en el archivo `dashboard.js` al momento de iniciar sesión (`onAuthStateChanged`).

* **Administrador (`admin`):** Acceso total. Puede ver finanzas, reportes, cambiar tarifas, y gestionar (crear/bloquear) colaboradores.
* **Colaborador (`colaborador`):** Acceso operativo. 
  * *Restricciones automáticas:* Se ocultan las pestañas de Reportes, Ajustes y Colaboradores. Los ingresos financieros se enmascaran (`***`). No pueden aprobar/agendar cotizaciones ni eliminar registros.

---

## 5. Arquitectura del Archivo Principal (`js/dashboard.js`)
Para evitar el "código espagueti", el archivo `dashboard.js` está dividido en objetos modulares estandarizados. Si alguien necesita modificar algo, debe buscar en el objeto correspondiente:

### `AppState` (Estado Global)
Es la "memoria RAM" de la aplicación. En lugar de consultar a la base de datos por cada clic, Firebase descarga los datos aquí. Contiene las listas de clientes, cotizaciones y la configuración de precios actuales.

### `Utils` (Utilidades)
Funciones de ayuda reutilizables:
* `formatCLP()`: Convierte números a formato moneda ($).
* `formatDate()` / `relativeTime()`: Manejo de fechas amigables.
* `escapeHtml()`: Previene hackeos por inyección de código (XSS).

### `UI` (Interfaz de Usuario)
Controla elementos visuales flotantes independientes de la vista:
* `showToast()`: Muestra las notificaciones verdes/rojas abajo a la derecha.
* `openModal()` / `closeModal()`: Controla la apertura y cierre de ventanas emergentes.

### `Calculator` (Motor Matemático)
Es el cerebro de las cotizaciones.
* Escucha los cambios en los inputs (metros cuadrados, servicio, descuentos).
* Extrae las tarifas de `AppState.configuracion`.
* Compara si el cálculo por M2 es menor a la "Tarifa Base". Si es menor, cobra la tarifa base obligatoriamente.
* Calcula el IVA y actualiza la pantalla.

### `Controllers` (Acciones de Usuario)
Contiene las funciones que se ejecutan cuando el usuario hace clic en los botones principales (Guardar Cliente, Aprobar Cotización, Generar PDF).
* **Nota sobre PDF:** `exportarPDF()` genera una ventana HTML virtual "al vuelo", le inyecta estilos CSS corporativos y lanza la función nativa `window.print()` del navegador.

### `Views` (Renderizado de Pantallas)
Encargado de inyectar código HTML dinámico en la pantalla.
* `Maps(viewId)`: Oculta todas las secciones (`<section>`) y muestra solo la solicitada. Actúa como un *Router*. Contiene la barrera de seguridad que expulsa a colaboradores de zonas prohibidas.
* `renderCotizaciones()`, `renderClientes()`: Recorren los arreglos de `AppState` y dibujan los `<tr>` de las tablas.

### `DB` (Conexión Base de Datos)
El único objeto autorizado para hablar con Firebase.
* `initDataListeners()`: Activa los "oídos" (`onSnapshot`). Si alguien modifica un dato en otra computadora, la pantalla se actualiza sola en tiempo real sin recargar.
* `save...`, `approve...`, `delete...`: Funciones asíncronas para escribir, actualizar o borrar documentos.

---

## 6. Flujos Críticos a Considerar (Para futuros desarrolladores)

1. **Creación de Colaboradores:** Actualmente, el botón "Crear Cuenta" en el panel guarda los **permisos** del colaborador en Firestore (`usuarios`). Sin embargo, por arquitectura de seguridad de Firebase Auth (para evitar que cierre la sesión del admin), la credencial real (correo/contraseña) debe crearse en la Consola de Firebase > Authentication.
2. **Textos Fijos (Hardcoded) vs Dinámicos:** Los precios en el menú `<select>` de servicios se actualizan dinámicamente mediante la función `Views.updateServiciosDropdown()`, la cual sobrescribe los textos estáticos del HTML.

---
*Documentación generada y actualizada a la última versión estable (Gestión de Roles y Tarifas Dinámicas).*