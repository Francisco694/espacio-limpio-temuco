/**
 * js/dashboard.js — Espacio Limpio Ltda.
 * Lógica Intacta - Actualizados Colores de Gráficos a Paleta SaaS
 */
import { db } from './db-config.js';
import { collection, query, orderBy, limit, onSnapshot } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

const COLLECTION = 'cotizaciones';
const NOMBRES_SERVICIO = {
    hogar:            'Limpieza Residencial',
    oficinas:         'Limpieza de Oficinas',
    postconstruccion: 'Post-Construcción',
    electrodomesticos:'Hornos / Electrodomésticos',
};

// Colores unificados con la paleta SaaS
const CHART_COLORS = {
    primary:   '#2563eb', // Blue 600
    secondary: '#94a3b8', // Slate 400
    accent:    '#cbd5e1', // Slate 300
    fill:      'rgba(37, 99, 235, 0.1)',
    fillLine:  'rgba(37, 99, 235, 0.05)',
};

const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

let _cotizaciones = [];
let _chartBar = null;
let _chartLine = null;
let _searchQuery = '';
let _unsubscribe = null;

function showView(viewId) {
    if (viewId === 'logout') {
        if (confirm('¿Seguro que deseas cerrar sesión?')) window.location.href = 'index.html';
        return;
    }
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const target = document.getElementById(`view-${viewId}`);
    if (target) target.classList.add('active');
    document.querySelectorAll('.sidebar-nav-item').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.view === viewId);
    });
    const titulos = { panel: 'Panel Principal', clientes: 'Gestión de Clientes', agendamiento: 'Agendamiento', cotizaciones: 'Cotizaciones', reportes: 'Reportes', ajustes: 'Ajustes del Sistema' };
    document.getElementById('header-title').textContent = titulos[viewId] || 'Panel';
    if (window.lucide) window.lucide.createIcons();
    document.getElementById('sidebar').classList.remove('open');
}

function suscribirACotizaciones() {
    const q = query(collection(db, COLLECTION), orderBy('creadoEn', 'desc'), limit(100));
    if (_unsubscribe) _unsubscribe();
    _unsubscribe = onSnapshot(q,
        (snapshot) => {
            _cotizaciones = snapshot.docs.map(doc => ({
                id: doc.id, ...doc.data(), creadoEnDate: doc.data().creadoEn?.toDate?.() || new Date(),
            }));
            actualizarDashboard();
        },
        (error) => {
            console.error('[Firestore] Error en snapshot:', error);
            cargarDatosDemostracion();
        }
    );
}

function cargarDatosDemostracion() {
    const hoy = new Date(); const ayer = new Date(hoy); ayer.setDate(hoy.getDate() - 1);
    const hace2 = new Date(hoy); hace2.setDate(hoy.getDate() - 2); const hace5 = new Date(hoy); hace5.setDate(hoy.getDate() - 5);
    const hace7 = new Date(hoy); hace7.setDate(hoy.getDate() - 7);
    const formato = (d) => d.toISOString().split('T')[0];

    _cotizaciones = [
        { id:'demo1', nombre:'María González', tipoServicio:'hogar', nombreServicio:'Limpieza Residencial', whatsapp:'+56912345678', fecha: formato(hoy), hora:'10:00', valorCLP:102000, estadoCRM:'Visita Agendada', creadoEnDate: hoy },
        { id:'demo2', nombre:'Carlos Rojas', tipoServicio:'oficinas', nombreServicio:'Limpieza de Oficinas', whatsapp:'+56987654321', fecha: formato(hoy), hora:'14:30', valorCLP:225000, estadoCRM:'Visita Agendada', creadoEnDate: hoy },
        { id:'demo3', nombre:'Ana Muñoz', tipoServicio:'postconstruccion', nombreServicio:'Post-Construcción', whatsapp:'+56911223344', fecha: formato(ayer), hora:'09:00', valorCLP:375000, estadoCRM:'Visita Agendada', creadoEnDate: ayer },
        { id:'demo4', nombre:'Luis Fernández', tipoServicio:'electrodomesticos', nombreServicio:'Hornos / Electrodomésticos',whatsapp:'+56955667788',fecha: formato(ayer), hora:'16:00', valorCLP: 35000, estadoCRM:'Visita Agendada', creadoEnDate: ayer },
        { id:'demo5', nombre:'Patricia Lagos', tipoServicio:'hogar', nombreServicio:'Limpieza Residencial', whatsapp:'+56933445566', fecha: formato(hace2), hora:'11:00', valorCLP: 84000, estadoCRM:'Visita Agendada', creadoEnDate: hace2 },
        { id:'demo6', nombre:'Roberto Soto', tipoServicio:'oficinas', nombreServicio:'Limpieza de Oficinas', whatsapp:'+56944556677', fecha: formato(hace5), hora:'08:30', valorCLP:300000, estadoCRM:'Visita Agendada', creadoEnDate: hace5 },
        { id:'demo7', nombre:'Valentina Parra', tipoServicio:'hogar', nombreServicio:'Limpieza Residencial', whatsapp:'+56922334455', fecha: formato(hace7), hora:'15:00', valorCLP: 60000, estadoCRM:'Visita Agendada', creadoEnDate: hace7 },
        { id:'demo8', nombre:'Diego Morales', tipoServicio:'postconstruccion', nombreServicio:'Post-Construcción', whatsapp:'+56999887766', fecha: formato(hace7), hora:'13:00', valorCLP:500000, estadoCRM:'Visita Agendada', creadoEnDate: hace7 },
    ];
    actualizarDashboard();
}

function actualizarDashboard() {
    renderizarKPIs(); renderizarTabla(_cotizaciones); renderizarAlertas(); renderizarTimeline(); renderizarGraficos(); actualizarResumenFinanciero();
}

function renderizarKPIs() {
    const hoy = new Date(); const inicioSemana = new Date(hoy); inicioSemana.setDate(hoy.getDate() - hoy.getDay());
    const clientesUnicos = new Set(_cotizaciones.map(c => c.whatsapp || c.nombre));
    const citasHoy = _cotizaciones.filter(c => c.fecha === hoy.toISOString().split('T')[0]).length;
    const pendientes = _cotizaciones.filter(c => c.estadoCRM === 'Visita Agendada').length;
    const reservasSemana = _cotizaciones.filter(c => { const f = new Date(c.fecha + 'T00:00:00'); return f >= inicioSemana && f <= hoy; }).length;

    animarKPI('kpi-total-clientes', clientesUnicos.size); animarKPI('kpi-citas-hoy', citasHoy);
    animarKPI('kpi-pendientes', pendientes); animarKPI('kpi-reservas-semana', reservasSemana);
}

function animarKPI(id, target) {
    const el = document.getElementById(id); if (!el) return;
    const start = parseInt(el.textContent) || 0; const steps = 20; const step = (target - start) / steps;
    let current = start; let count = 0;
    const interval = setInterval(() => {
        current += step; count++; el.textContent = Math.round(current);
        if (count >= steps) { el.textContent = target; clearInterval(interval); }
    }, 30);
}

function renderizarTabla(datos) {
    const tbody = document.getElementById('clientes-tbody'); if (!tbody) return;
    const filtrados = datos.filter(c => {
        if (!_searchQuery) return true;
        const q = _searchQuery.toLowerCase();
        return ((c.nombre || '').toLowerCase().includes(q) || (c.whatsapp || '').toLowerCase().includes(q) || (c.nombreServicio || '').toLowerCase().includes(q) || (c.estadoCRM || '').toLowerCase().includes(q));
    });

    const counter = document.getElementById('table-count'); if (counter) counter.textContent = `${filtrados.length} registros`;

    if (filtrados.length === 0) { tbody.innerHTML = `<tr><td colspan="6"><div style="text-align:center; padding:24px; color:#64748b;">No hay coincidencias.</div></td></tr>`; return; }

    tbody.innerHTML = filtrados.map(c => `
        <tr>
            <td>
                <div class="client-cell">
                    <div class="client-avatar-sm">${obtenerIniciales(c.nombre || 'NN')}</div>
                    <span class="client-name-text">${escapeHtml(c.nombre || '—')}</span>
                </div>
            </td>
            <td>${escapeHtml(c.nombreServicio || NOMBRES_SERVICIO[c.tipoServicio] || c.tipoServicio || '—')}</td>
            <td>${escapeHtml(c.whatsapp || '—')}</td>
            <td><span style="font-weight:600">${formatearFecha(c.fecha)}</span> <span style="opacity:0.6; font-size:0.7rem; margin-left:4px">${c.hora || ''}</span></td>
            <td style="font-family:var(--font-display); font-weight:700;">${c.valorCLP ? formatCLP(c.valorCLP) : '—'}</td>
            <td><span class="estado-badge ${obtenerClaseEstado(c.estadoCRM)}">${escapeHtml(c.estadoCRM || '—')}</span></td>
        </tr>`).join('');
    if (window.lucide) window.lucide.createIcons();
}

function renderizarAlertas() {
    const feed = document.getElementById('alerts-feed'); if (!feed) return;
    const recientes = _cotizaciones.slice(0, 8);
    if (recientes.length === 0) { feed.innerHTML = '<p style="font-size:0.75rem; color:#94a3b8; text-align:center;">Sin actividad</p>'; return; }

    const tipos = [{ dot: 'alert-dot-green', prefijo: 'Nueva cotización' }, { dot: 'alert-dot-teal', prefijo: 'Cita agendada' }, { dot: 'alert-dot-blue', prefijo: 'Caso registrado' }];
    feed.innerHTML = recientes.map((c, i) => `
        <div class="alert-item">
            <span class="alert-dot ${tipos[i % tipos.length].dot}"></span>
            <div class="alert-content">
                <p class="alert-title">${tipos[i % tipos.length].prefijo}: ${escapeHtml(c.nombre || 'Cliente')}</p>
                <p class="alert-meta">${escapeHtml(c.nombreServicio || NOMBRES_SERVICIO[c.tipoServicio] || '')} · ${tiempoRelativo(c.creadoEnDate)}</p>
            </div>
        </div>`).join('');
}

function renderizarTimeline() {
    const feed = document.getElementById('timeline-feed'); if (!feed) return;
    const ultimos = _cotizaciones.slice(0, 6);
    if (ultimos.length === 0) { feed.innerHTML = '<p style="text-align:center; color:#94a3b8; font-size:0.8rem;">Sin interacciones</p>'; return; }

    const estilos = [{ icon: 'calendar', label: 'Cita agendada' }, { icon: 'file-text', label: 'Cotización generada' }, { icon: 'user-plus', label: 'Nuevo cliente' }];
    feed.innerHTML = ultimos.map((c, i) => `
        <div class="timeline-item">
            <div class="timeline-dot"><i data-lucide="${estilos[i % estilos.length].icon}"></i></div>
            <div class="timeline-content">
                <p class="timeline-title">${estilos[i % estilos.length].label}</p>
                <p class="timeline-client">${escapeHtml(c.nombre || 'Cliente desconocido')}</p>
                <p class="timeline-time">${tiempoRelativo(c.creadoEnDate)} · ${c.hora || ''}</p>
            </div>
        </div>`).join('');
    if (window.lucide) window.lucide.createIcons();
}

function renderizarGraficos() {
    const anioActual = new Date().getFullYear();
    const ventasPorMes = Array(12).fill(0); const cantidadPorMes = Array(12).fill(0);

    _cotizaciones.forEach(c => {
        const fechaCot = new Date(c.fecha + 'T00:00:00');
        if (fechaCot.getFullYear() === anioActual) {
            const mes = fechaCot.getMonth();
            ventasPorMes[mes] += (c.valorCLP || 0);
            cantidadPorMes[mes] += 1;
        }
    });

    const ventasK = ventasPorMes.map(v => Math.round(v / 1000));
    const ctxBar = document.getElementById('chart-ventas');
    if (ctxBar) {
        if (_chartBar) _chartBar.destroy();
        _chartBar = new Chart(ctxBar, {
            type: 'bar',
            data: { labels: MESES, datasets: [{ label: 'Ventas (miles $)', data: ventasK, backgroundColor: MESES.map((_, i) => i === new Date().getMonth() ? CHART_COLORS.primary : CHART_COLORS.accent), borderRadius: 4, barThickness: 16 }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false }, ticks: { color: '#64748b' } }, y: { grid: { color: '#e2e8f0' }, ticks: { color: '#64748b', callback: (v) => `$${v}K` } } } }
        });
    }

    const ctxLine = document.getElementById('chart-tendencia');
    if (ctxLine) {
        if (_chartLine) _chartLine.destroy();
        _chartLine = new Chart(ctxLine, {
            type: 'line',
            data: { labels: MESES, datasets: [{ label: 'Cotizaciones', data: cantidadPorMes, borderColor: CHART_COLORS.primary, backgroundColor: CHART_COLORS.fillLine, borderWidth: 2, pointBackgroundColor: CHART_COLORS.primary, fill: true, tension: 0.3 }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false }, ticks: { color: '#64748b' } }, y: { grid: { color: '#e2e8f0' }, ticks: { color: '#64748b', stepSize: 1 } } } }
        });
    }
}

function actualizarResumenFinanciero() {
    const total = _cotizaciones.reduce((acc, c) => acc + (c.valorCLP || 0), 0);
    const promedio = _cotizaciones.length > 0 ? Math.round(total / _cotizaciones.length) : 0;
    document.getElementById('valor-total-cotizado').textContent = formatCLP(total);
    document.getElementById('valor-promedio').textContent = formatCLP(promedio);
}

function iniciarBusqueda() {
    const input = document.getElementById('search-input');
    if (input) input.addEventListener('input', () => { _searchQuery = input.value.trim(); renderizarTabla(_cotizaciones); });
}

function exportarCSV() {
    if (_cotizaciones.length === 0) return alert('No hay datos para exportar.');
    const headers = ['Nombre','Servicio','WhatsApp','Fecha','Hora','Valor CLP','Estado CRM'];
    const filas = _cotizaciones.map(c => `"${c.nombre || ''}","${c.nombreServicio || ''}","${c.whatsapp || ''}","${c.fecha || ''}","${c.hora || ''}",${c.valorCLP || 0},"${c.estadoCRM || ''}"`);
    const csv = [headers.join(','), ...filas].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `crm_export_${new Date().toISOString().split('T')[0]}.csv`; a.click(); URL.revokeObjectURL(url);
}

function formatCLP(valor) { return '$ ' + Math.round(valor).toLocaleString('es-CL'); }
function formatearFecha(fechaStr) { if (!fechaStr) return '—'; const [anio, mes, dia] = fechaStr.split('-'); return `${dia} ${MESES[parseInt(mes) - 1]} ${anio}`; }
function tiempoRelativo(fecha) {
    if (!fecha || !(fecha instanceof Date)) return '—';
    const diffMin = Math.floor((new Date() - fecha) / 60000);
    if (diffMin < 1) return 'Ahora mismo'; if (diffMin < 60) return `hace ${diffMin} min`;
    const diffH = Math.floor(diffMin / 60); if (diffH < 24) return `hace ${diffH}h`;
    const diffD = Math.floor(diffH / 24); if (diffD === 1) return 'Ayer';
    if (diffD < 7) return `hace ${diffD} días`; return formatearFecha(fecha.toISOString().split('T')[0]);
}
function obtenerIniciales(nombre) { return nombre.split(' ').filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join(''); }
function obtenerClaseEstado(estado) { return { 'Visita Agendada': 'estado-agendada', 'Pendiente': 'estado-pendiente', 'Completada': 'estado-completada' }[estado] || 'estado-pendiente'; }
function escapeHtml(str) { return String(str).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[m]); }
function setearFechaHeader() { const el = document.getElementById('header-date'); if (el) { const hoy = new Date(); el.textContent = `${['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'][hoy.getDay()]} ${hoy.getDate()} ${MESES[hoy.getMonth()]} ${hoy.getFullYear()}`; } }

function iniciarTabsGraficos() {
    document.querySelectorAll('.chart-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.chart-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById('chart-bar-wrap').classList.toggle('hidden', tab.dataset.chart !== 'bar');
            document.getElementById('chart-line-wrap').classList.toggle('hidden', tab.dataset.chart !== 'line');
        });
    });
}

function init() {
    setearFechaHeader();
    document.querySelectorAll('[data-view]').forEach(btn => btn.addEventListener('click', () => showView(btn.dataset.view)));
    const toggleBtn = document.getElementById('sidebar-toggle'); const sidebar = document.getElementById('sidebar');
    if (toggleBtn && sidebar) toggleBtn.addEventListener('click', () => sidebar.classList.toggle('open'));
    const btnRefresh = document.getElementById('btn-refresh');
    if (btnRefresh) btnRefresh.addEventListener('click', () => { btnRefresh.querySelector('i')?.classList.add('animate-spin'); setTimeout(() => btnRefresh.querySelector('i')?.classList.remove('animate-spin'), 1000); suscribirACotizaciones(); });
    iniciarBusqueda(); iniciarTabsGraficos();
    const btnExport = document.getElementById('btn-export'); if (btnExport) btnExport.addEventListener('click', exportarCSV);
    try { suscribirACotizaciones(); } catch (err) { cargarDatosDemostracion(); }
}
document.addEventListener('DOMContentLoaded', init);