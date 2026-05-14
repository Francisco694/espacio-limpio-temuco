/**
 * js/dashboard.js — Espacio Limpio Ltda.
 * Arquitectura Vanilla JS (ES6) - Estilo SaaS Premium
 */

import { db } from './db-config.js';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, query, orderBy, Timestamp, getDocs } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { getAuth, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';

const auth = getAuth();

// ==============================================================
// 1. ESTADO GLOBAL (State Management)
// ==============================================================
const AppState = {
    view: 'panel',
    user: { name: 'Admin', role: 'Superadmin' },
    clientes: [],
    cotizaciones: [],
    citas: [],
    notificaciones: [],
    chartInstance: null,
    chartServicios: null,
    chartConversion: null,
    calendarInstance: null,
    isInitialLoad: true,
    // NUEVO: Variables de estado para los filtros en tiempo real
    filtros: {
        clientes: '',
        cotizaciones: ''
    }
};

// ==============================================================
// 2. UTILIDADES CORE
// ==============================================================
const Utils = {
    formatCLP: (val) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(val || 0),
    formatDate: (dateStr) => {
        if (!dateStr) return '—';
        const [y, m, d] = dateStr.split('-');
        const meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
        return `${d} ${meses[parseInt(m)-1]} ${y}`;
    },
    relativeTime: (date) => {
        if (!date) return '—';
        const diff = Math.floor((new Date() - date) / 60000);
        if (diff < 1) return 'Ahora';
        if (diff < 60) return `Hace ${diff}m`;
        if (diff < 1440) return `Hace ${Math.floor(diff/60)}h`;
        return Utils.formatDate(date.toISOString().split('T')[0]);
    },
    escapeHtml: (str) => String(str).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[m]),
    animateNumber: (selector, target) => {
        const el = document.querySelector(selector);
        if (!el) return;
        if(typeof target === 'string' && target.includes('$')) { el.textContent = target; return; }
        const start = parseInt(el.textContent) || 0;
        const diff = target - start;
        let current = start; let step = 0;
        const timer = setInterval(() => {
            step++; current += diff / 30;
            el.textContent = Math.round(current);
            if (step >= 30) { el.textContent = target; clearInterval(timer); }
        }, 800 / 30);
    },
    getServicioName: (val) => {
        const map = { 'hogar': 'Limpieza Residencial', 'oficina': 'Limpieza de Oficinas', 'post': 'Post-Construcción', 'electro': 'Hornos / Electrodomésticos' };
        return map[val] || val;
    }
};

// ==============================================================
// 3. UI CONTROLLER (Toasts, Modals, Dropdowns)
// ==============================================================
window.UI = {
    showToast(message, type = 'success') {
        const container = document.getElementById('toast-container');
        if (!container) return;
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        const icon = type === 'success' ? 'check-circle' : type === 'error' ? 'alert-circle' : 'info';
        const color = type === 'success' ? 'text-green-400' : type === 'error' ? 'text-red-400' : 'text-blue-400';
        toast.innerHTML = `<i data-lucide="${icon}" class="${color} w-5 h-5 flex-shrink-0"></i><span>${message}</span>`;
        container.appendChild(toast);
        if (window.lucide) lucide.createIcons();
        setTimeout(() => { toast.classList.add('fade-out'); setTimeout(() => toast.remove(), 300); }, 3000);
    },
    openModal(id) { document.getElementById(id)?.classList.add('active'); },
    closeModal(id) { 
        const modal = document.getElementById(id);
        if (modal) { modal.classList.remove('active'); modal.querySelectorAll('form').forEach(f => f.reset()); }
    },
    toggleDropdown(id) {
        document.querySelectorAll('.dropdown-menu').forEach(d => { if (d.id !== id) d.classList.remove('active'); });
        document.getElementById(id)?.classList.toggle('active');
    },
    toggleSkeleton(active) {
        document.querySelectorAll('[data-kpi], table tbody tr td, .chart-wrap').forEach(el => {
            if (active) el.classList.add('skeleton'); else el.classList.remove('skeleton');
        });
    },
    getBadgeClass(status) {
        const s = (status || '').toLowerCase();
        if(s.includes('aprobad') || s.includes('completad') || s.includes('confirmad')) return 'estado-aprobada';
        if(s.includes('pendient') || s.includes('revisi')) return 'estado-pendiente';
        if(s.includes('rechazad') || s.includes('cancelad')) return 'estado-rechazada';
        return 'estado-borrador';
    }
};

// ==============================================================
// 4. CONTROLADORES DE NEGOCIO (Calculadora, Notificaciones)
// ==============================================================
const Calculator = {
    init() {
        document.querySelectorAll('.calc-trigger').forEach(el => el.addEventListener('input', () => this.calculate()));
        document.getElementById('cot-servicio')?.addEventListener('change', () => this.calculate());
    },
    calculate() {
        const baseValues = { 'hogar': 20000, 'oficina': 35000, 'post': 80000, 'electro': 35000 };
        const servicio = document.getElementById('cot-servicio').value;
        const m2 = parseInt(document.getElementById('cot-m2').value) || 0;
        const personal = parseInt(document.getElementById('cot-personal').value) || 1;
        const descuento = parseInt(document.getElementById('cot-descuento').value) || 0;

        let base = baseValues[servicio] || 0;
        let subtotal = 0;
        
        if(servicio === 'electro') {
            subtotal = base;
        } else {
            let factorM2 = (servicio === 'post') ? 2500 : (servicio === 'oficina' ? 1500 : 1200);
            let m2Calc = m2 > 0 ? m2 : 30; 
            subtotal = (factorM2 * m2Calc) + ((personal - 1) * 15000) - descuento;
        }
        
        if (subtotal < 0) subtotal = 0;
        let iva = Math.round(subtotal * 0.19);
        let total = subtotal + iva;
        this.updateUI(subtotal, iva, total);
    },
    updateUI(sub, iva, tot) {
        document.getElementById('label-subtotal').textContent = Utils.formatCLP(sub);
        document.getElementById('label-iva').textContent = Utils.formatCLP(iva);
        document.getElementById('cot-valor-total').value = tot;
    }
};

const Notifications = {
    add(title, message, type = 'info') {
        AppState.notificaciones.unshift({ id: Math.random().toString(), title, message, type, date: new Date(), read: false });
        this.render();
    },
    render() {
        const unread = AppState.notificaciones.filter(n => !n.read).length;
        const badge = document.getElementById('notif-badge');
        if(badge) badge.style.display = unread > 0 ? 'block' : 'none';
        const sideDot = document.getElementById('menu-cotiz-dot');
        if(sideDot) sideDot.style.display = unread > 0 ? 'block' : 'none';

        const list = document.getElementById('notif-list');
        if(!list) return;

        if (AppState.notificaciones.length === 0) {
            list.innerHTML = `<div class="p-4 text-center text-xs text-slate-500">No hay notificaciones nuevas</div>`;
            return;
        }

        list.innerHTML = AppState.notificaciones.slice(0, 10).map(n => `
            <div class="notif-item ${!n.read ? 'unread' : ''}">
                <div class="notif-icon ${n.type === 'quote' ? 'quote' : 'agenda'}"><i data-lucide="${n.type === 'quote' ? 'file-text' : 'calendar-check'}" class="w-4 h-4"></i></div>
                <div>
                    <p class="text-sm font-bold text-slate-800">${n.title}</p>
                    <p class="text-xs text-slate-500 mt-1">${n.message}</p>
                    <p class="text-[10px] text-slate-400 mt-1">${Utils.relativeTime(n.date)}</p>
                </div>
            </div>
        `).join('');
        if(window.lucide) lucide.createIcons();
    },
    markAllRead() { AppState.notificaciones.forEach(n => n.read = true); this.render(); UI.showToast('Leídas', 'info'); }
};

window.Controllers = {
    newCliente() { UI.openModal('modal-cliente'); },
    newCotizacion() {
        UI.closeModal('modal-cotizacion');
        document.getElementById('cot-id').value = '';
        document.getElementById('cot-modal-title').textContent = 'Generar Cotización Manual';
        document.getElementById('cot-modal-source').innerHTML = '<i data-lucide="laptop" class="inline w-3 h-3 mr-1"></i> Origen: Manual';
        document.getElementById('btn-approve-cotizacion').classList.add('hidden');
        document.getElementById('btn-reject-cotizacion').classList.add('hidden');
        document.getElementById('btn-export-pdf').classList.add('hidden');
        document.getElementById('btn-save-draft').textContent = 'Guardar Cotización';
        if(window.lucide) lucide.createIcons();
        Calculator.calculate();
        UI.openModal('modal-cotizacion');
    },
    editCotizacion(id) {
        const c = AppState.cotizaciones.find(x => x.id === id);
        if(!c) return;
        document.getElementById('cot-id').value = c.id;
        document.getElementById('cot-nombre').value = c.cliente || c.nombre || '';
        document.getElementById('cot-rut').value = c.rut || '';
        document.getElementById('cot-telefono').value = c.telefono || '';
        document.getElementById('cot-correo').value = c.correo || '';
        document.getElementById('cot-direccion').value = c.direccion || '';
        document.getElementById('cot-tipoCliente').value = c.tipoCliente || 'Persona Natural';
        
        let selValue = c.tipoLimpieza || c.servicio || 'hogar';
        if(selValue === 'Limpieza Residencial') selValue = 'hogar';
        if(selValue === 'Limpieza de Oficinas') selValue = 'oficina';
        if(selValue === 'Post-Construcción') selValue = 'post';
        
        document.getElementById('cot-servicio').value = selValue;
        document.getElementById('cot-fecha').value = c.fechaAgendada || c.fecha || '';
        document.getElementById('cot-hora').value = c.horaAgendada || c.hora || '';
        document.getElementById('cot-m2').value = c.metros || c.m2 || 0;
        document.getElementById('cot-descripcion').value = c.descripcion || '';
        document.getElementById('cot-prioridad').value = c.prioridad || 'Normal';
        document.getElementById('cot-personal').value = c.personal || 1;
        document.getElementById('cot-descuento').value = c.descuento || 0;

        document.getElementById('cot-modal-title').textContent = `Cotización: ${c.cliente || c.nombre}`;
        const esWeb = c.fuente === 'Modal Web' || !c.fuente;
        document.getElementById('cot-modal-source').innerHTML = esWeb ? '<i data-lucide="globe" class="inline w-3 h-3 mr-1"></i> Origen: Solicitud Web Pública' : '<i data-lucide="laptop" class="inline w-3 h-3 mr-1"></i> Origen: Manual';
        
        const btnSave = document.getElementById('btn-save-draft');
        const btnApprove = document.getElementById('btn-approve-cotizacion');
        const btnReject = document.getElementById('btn-reject-cotizacion');
        
        btnSave.textContent = 'Actualizar Datos';
        document.getElementById('btn-export-pdf').classList.remove('hidden');

        if(c.estadoCRM === 'Aprobada' || c.estadoCRM === 'Rechazada') {
            btnApprove.classList.add('hidden'); btnReject.classList.add('hidden'); btnSave.classList.add('hidden');
        } else {
            btnApprove.classList.remove('hidden'); btnReject.classList.remove('hidden'); btnSave.classList.remove('hidden');
        }

        if(window.lucide) lucide.createIcons();
        Calculator.calculate();
        UI.openModal('modal-cotizacion');
    }
};

// ==============================================================
// 6. CONTROLADORES DE VISTA (Renders)
// ==============================================================
const Views = {
    navigate(viewId) {
        AppState.view = viewId;
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        document.getElementById(`view-${viewId}`)?.classList.add('active');
        document.querySelectorAll('.sidebar-nav-item').forEach(btn => btn.classList.toggle('active', btn.dataset.view === viewId));
        
        const titles = { panel: 'Panel Principal', clientes: 'Directorio de Clientes', agendamiento: 'Calendario Operativo', cotizaciones: 'Gestión de Cotizaciones', reportes: 'Reportes Avanzados', ajustes: 'Configuración del CRM' };
        document.getElementById('header-title').textContent = titles[viewId] || 'Panel';
        
        if (window.innerWidth < 900) document.getElementById('sidebar').classList.remove('open');
        
        if (viewId === 'panel') this.renderDashboard();
        if (viewId === 'agendamiento') this.renderCalendar();
        if (viewId === 'reportes') this.renderReportes();
    },

    renderDashboard() {
        if (AppState.view !== 'panel') return;
        
        const hoy = new Date().toISOString().split('T')[0];
        const ingresos = AppState.cotizaciones.filter(c => c.estadoCRM === 'Aprobada').reduce((acc, c) => acc + (parseInt(c.valorTotal) || parseInt(c.valorCotizado?.replace(/\D/g,'')) || 0), 0);
        
        Utils.animateNumber('[data-kpi="clientes"]', AppState.clientes.length);
        Utils.animateNumber('[data-kpi="citas"]', AppState.citas.filter(c => c.fecha === hoy || c.fechaAgendada === hoy).length);
        Utils.animateNumber('[data-kpi="pendientes"]', AppState.cotizaciones.filter(c => c.estadoCRM?.includes('Pendiente') || c.estadoCRM?.includes('Revisi')).length);
        Utils.animateNumber('[data-kpi="ingresos"]', Utils.formatCLP(ingresos));

        const tbody = document.getElementById('recent-quotes-tbody');
        if(tbody) {
            const r = AppState.cotizaciones.slice(0, 5);
            tbody.innerHTML = r.length ? r.map(c => `
                <tr class="hover:bg-slate-50 clickable-row" onclick="Controllers.editCotizacion('${c.id}')">
                    <td class="font-medium text-slate-900"><div class="flex items-center gap-2">${c.fuente==='Modal Web'?'<i data-lucide="globe" class="w-3 h-3 text-blue-500"></i>':''}${Utils.escapeHtml(c.cliente || c.nombre)}</div></td>
                    <td>${Utils.escapeHtml(Utils.getServicioName(c.tipoLimpieza || c.servicio))}</td>
                    <td>${Utils.formatDate(c.fechaAgendada || c.fecha)}</td>
                    <td class="font-bold">${c.valorTotal ? Utils.formatCLP(c.valorTotal) : (c.valorCotizado || '$ 0')}</td>
                    <td><span class="estado-badge ${UI.getBadgeClass(c.estadoCRM)}">${c.estadoCRM || 'Pendiente'}</span></td>
                </tr>
            `).join('') : `<tr><td colspan="6" class="empty-state">Sin solicitudes recientes</td></tr>`;
        }

        this.renderChart();
        this.renderTimeline();
    },

    renderChart() {
        const ctx = document.getElementById('chart-ventas');
        if (!ctx) return;
        if (AppState.chartInstance) AppState.chartInstance.destroy();

        const data = Array(6).fill(0);
        const labels = [];
        const anioActual = new Date().getFullYear();
        
        for(let i=5; i>=0; i--) {
            const d = new Date(); d.setMonth(d.getMonth() - i);
            labels.push(d.toLocaleString('es', {month: 'short'}).toUpperCase());
            
            const mesTarget = d.getMonth();
            const ingresosMes = AppState.cotizaciones.filter(c => {
               if(c.estadoCRM !== 'Aprobada') return false;
               const cDate = c.creadoEnDate || new Date(c.fechaAgendada || c.fecha);
               return cDate.getMonth() === mesTarget && cDate.getFullYear() === anioActual;
            }).reduce((acc, c) => acc + (parseInt(c.valorTotal) || parseInt(c.valorCotizado?.replace(/\D/g,'')) || 0), 0);
            
            data[5-i] = ingresosMes;
        }

        AppState.chartInstance = new Chart(ctx, {
            type: 'line',
            data: { labels, datasets: [{ label: 'Ingresos', data, borderColor: '#2563eb', backgroundColor: 'rgba(37,99,235,0.1)', borderWidth: 2, fill: true, tension: 0.4, pointBackgroundColor: '#2563eb' }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { border:{display:false}, grid:{color:'#f1f5f9'}, ticks: { color: '#64748b', callback: v => `$${v/1000}k` } }, x: { border:{display:false}, grid:{display:false}, ticks:{color:'#64748b'} } } }
        });
    },

    renderReportes() {
        if (AppState.view !== 'reportes') return;
        const ctxServicios = document.getElementById('chart-servicios');
        const ctxConversion = document.getElementById('chart-conversion');
        if (!ctxServicios || !ctxConversion) return;

        if (AppState.chartServicios) AppState.chartServicios.destroy();
        if (AppState.chartConversion) AppState.chartConversion.destroy();

        // 1. Gráfico de Torta (Servicios)
        const counts = { hogar: 0, oficina: 0, post: 0, electro: 0 };
        AppState.cotizaciones.forEach(c => {
            let s = c.tipoLimpieza || c.servicio || '';
            if (s.includes('Residencial') || s === 'hogar') counts.hogar++;
            else if (s.includes('Oficinas') || s === 'oficina') counts.oficina++;
            else if (s.includes('Post') || s === 'post') counts.post++;
            else counts.electro++;
        });

        AppState.chartServicios = new Chart(ctxServicios, {
            type: 'doughnut',
            data: {
                labels: ['Residencial', 'Oficinas', 'Post-Construcción', 'Hornos'],
                datasets: [{ data: [counts.hogar, counts.oficina, counts.post, counts.electro], backgroundColor: ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6'], borderWidth: 0 }]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
        });

        // 2. Gráfico de Barras (Conversión)
        let est = { aprobadas: 0, pendientes: 0, rechazadas: 0 };
        AppState.cotizaciones.forEach(c => {
            const e = (c.estadoCRM || '').toLowerCase();
            if(e.includes('aprobad') || e.includes('agendad')) est.aprobadas++;
            else if(e.includes('rechazad') || e.includes('cancelad')) est.rechazadas++;
            else est.pendientes++;
        });

        AppState.chartConversion = new Chart(ctxConversion, {
            type: 'bar',
            data: {
                labels: ['Aprobadas', 'Pendientes', 'Rechazadas'],
                datasets: [{ label: 'Cantidad', data: [est.aprobadas, est.pendientes, est.rechazadas], backgroundColor: ['#10b981', '#f59e0b', '#ef4444'], borderRadius: 6 }]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, grid: { color: '#f1f5f9' }, ticks: { precision: 0 } }, x: { grid: { display: false } } } }
        });
    },

    renderTimeline() {
        const feed = document.getElementById('timeline-feed');
        if(!feed) return;
        const recientes = AppState.cotizaciones.slice(0, 5);
        feed.innerHTML = recientes.length ? recientes.map(c => `
            <div class="timeline-item">
                <div class="timeline-dot"><i data-lucide="${c.fuente==='Modal Web'?'globe':'file-text'}"></i></div>
                <div class="timeline-content">
                    <p class="timeline-title">${c.estadoCRM === 'Aprobada' ? 'Servicio Agendado' : 'Cotización Registrada'}</p>
                    <p class="timeline-client">${Utils.escapeHtml(c.cliente || c.nombre)} - ${Utils.escapeHtml(Utils.getServicioName(c.tipoLimpieza || c.servicio))}</p>
                    <p class="timeline-time">${Utils.relativeTime(c.creadoEnDate)}</p>
                </div>
            </div>
        `).join('') : '<div class="empty-state" style="padding:20px"><p>Sin interacciones</p></div>';
        if(window.lucide) lucide.createIcons();
    },

    renderClientes() {
        const tbody = document.getElementById('clientes-tbody');
        if(!tbody) return;

        // APLICAR FILTRO REACTIVO
        const query = AppState.filtros.clientes;
        const filtrados = AppState.clientes.filter(c => {
            if(!query) return true;
            const textoBusqueda = `${c.nombre||''} ${c.rut||''} ${c.correo||''}`.toLowerCase();
            return textoBusqueda.includes(query);
        });

        const renderStr = filtrados.map(c => `
            <tr>
                <td><div class="client-cell"><div class="client-avatar-sm">${c.nombre.charAt(0)}</div><div><p class="client-name-text">${Utils.escapeHtml(c.nombre)}</p><p class="text-xs text-slate-500">${c.rut}</p></div></div></td>
                <td><p class="text-sm">${Utils.escapeHtml(c.telefono)}</p><p class="text-xs text-slate-500">${Utils.escapeHtml(c.correo)}</p></td>
                <td class="text-sm text-slate-600 truncate max-w-[150px]">${Utils.escapeHtml(c.direccion)}</td>
                <td class="text-sm text-slate-600">${Utils.formatDate(c.fechaRegistro)}</td>
                <td><span class="estado-badge estado-completada">Activo</span></td>
                <td class="text-center">
                    <button onclick="DB.deleteCliente('${c.id}')" class="p-1.5 text-red-500 hover:bg-red-50 rounded transition"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                </td>
            </tr>
        `).join('');
        
        tbody.innerHTML = renderStr || `<tr><td colspan="6"><div class="empty-state"><i data-lucide="users"></i><h3>No hay coincidencias</h3></div></td></tr>`;
        
        const select = document.getElementById('cot-cliente-select');
        if(select) select.innerHTML = '<option value="">Seleccione o escriba abajo...</option>' + AppState.clientes.map(c => `<option value="${c.id}">${Utils.escapeHtml(c.nombre)}</option>`).join('');
        if(window.lucide) lucide.createIcons();
    },

    renderCotizaciones() {
        const tbody = document.getElementById('cotizaciones-tbody');
        if(!tbody) return;

        // APLICAR FILTRO REACTIVO
        const query = AppState.filtros.cotizaciones;
        const filtrados = AppState.cotizaciones.filter(c => {
            if(!query) return true;
            const textoBusqueda = `${c.cliente||c.nombre||''} ${c.tipoLimpieza||c.servicio||''} ${c.estadoCRM||''}`.toLowerCase();
            return textoBusqueda.includes(query);
        });

        const renderStr = filtrados.map(c => {
            const isWeb = c.fuente === 'Modal Web';
            const valTotal = c.valorTotal ? Utils.formatCLP(c.valorTotal) : (c.valorCotizado || '$ 0');
            const subtotal = c.valorSubtotal ? Utils.formatCLP(c.valorSubtotal) : '—';
            
            return `
            <tr class="hover:bg-slate-50 clickable-row" onclick="Controllers.editCotizacion('${c.id}')">
                <td><p class="font-bold text-slate-800 flex items-center gap-2">${isWeb?'<i data-lucide="globe" class="w-3 h-3 text-blue-500"></i>':''}${Utils.escapeHtml(c.cliente || c.nombre)}</p></td>
                <td class="text-sm text-slate-600">${Utils.escapeHtml(Utils.getServicioName(c.tipoLimpieza || c.servicio))}</td>
                <td class="text-sm"><span class="font-semibold">${Utils.formatDate(c.fechaAgendada || c.fecha)}</span><br><span class="text-xs text-slate-500">${c.horaAgendada || c.hora || ''}</span></td>
                <td class="text-sm font-semibold ${c.prioridad==='Urgente'?'text-red-500':(c.prioridad==='Alta'?'text-yellow-600':'text-slate-500')}">${c.prioridad || 'Normal'}</td>
                <td class="text-sm text-slate-600">${subtotal}</td>
                <td class="font-bold text-blue-700">${valTotal}</td>
                <td><span class="estado-badge ${UI.getBadgeClass(c.estadoCRM)}">${c.estadoCRM || 'Pendiente'}</span></td>
            </tr>
        `}).join('');
        
        tbody.innerHTML = renderStr || `<tr><td colspan="7"><div class="empty-state"><i data-lucide="search-x"></i><h3>No hay coincidencias</h3></div></td></tr>`;
        if(window.lucide) lucide.createIcons();
    },

    renderCalendar() {
        const calEl = document.getElementById('calendar-container');
        if(!calEl || !window.FullCalendar) return;

        const events = AppState.cotizaciones.filter(c => c.estadoCRM === 'Aprobada').map(c => ({
            id: c.id, 
            title: `${c.cliente || c.nombre} - ${Utils.getServicioName(c.tipoLimpieza || c.servicio)}`, 
            start: `${c.fechaAgendada || c.fecha}T${c.horaAgendada || c.hora || '09:00:00'}`,
            backgroundColor: '#16a34a', borderColor: 'transparent'
        }));

        if(!AppState.calendarInstance) {
            AppState.calendarInstance = new FullCalendar.Calendar(calEl, {
                initialView: 'timeGridWeek', locale: 'es', slotMinTime: '08:00:00', slotMaxTime: '19:00:00',
                headerToolbar: { left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek' },
                events: events,
                eventClick: (info) => { UI.showToast('Abriendo detalles...', 'info'); Controllers.editCotizacion(info.event.id); }
            });
            AppState.calendarInstance.render();
        } else {
            AppState.calendarInstance.removeAllEvents();
            AppState.calendarInstance.addEventSource(events);
        }
    }
};

// ==============================================================
// 7. FIREBASE DB CONTROLLER
// ==============================================================
window.DB = {
    initDataListeners() {
        const qCotiz = query(collection(db, 'cotizaciones'), orderBy('creadoEn', 'desc'));
        onSnapshot(qCotiz, (snapshot) => {
            snapshot.docChanges().forEach((change) => {
                if (change.type === 'added' && !AppState.isInitialLoad) {
                    const data = change.doc.data();
                    if (data.fuente === 'Modal Web') {
                        UI.showToast(`Nueva solicitud web de ${data.cliente || data.nombre}`, 'info');
                        Notifications.add('Nueva Solicitud Web', `${data.cliente || data.nombre} requiere limpieza.`, 'quote');
                    }
                }
            });

            AppState.cotizaciones = snapshot.docs.map(doc => ({
                id: doc.id, ...doc.data(), creadoEnDate: doc.data().creadoEn?.toDate?.() || new Date()
            }));

            AppState.isInitialLoad = false;
            Views.renderDashboard();
            Views.renderCotizaciones();
            if(AppState.view === 'agendamiento') Views.renderCalendar();
            if(AppState.view === 'reportes') Views.renderReportes();
        }, err => console.error("Error Leyendo Cotizaciones", err));

        onSnapshot(query(collection(db, 'clientes'), orderBy('creadoEn', 'desc')), snap => {
            AppState.clientes = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            Views.renderClientes();
            Views.renderDashboard();
        });

        onSnapshot(collection(db, 'citas'), snap => {
            AppState.citas = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            Views.renderDashboard();
        });
    },

    async saveCliente(e) {
        e.preventDefault();
        try {
            await addDoc(collection(db, 'clientes'), {
                nombre: document.getElementById('cli-nombre').value, rut: document.getElementById('cli-rut').value,
                telefono: document.getElementById('cli-telefono').value, correo: document.getElementById('cli-correo').value,
                direccion: document.getElementById('cli-direccion').value, fechaRegistro: new Date().toISOString().split('T')[0],
                creadoEn: serverTimestamp()
            });
            UI.closeModal('modal-cliente'); UI.showToast('Cliente registrado con éxito');
        } catch(error) { UI.showToast('Error al guardar', 'error'); }
    },

    async saveCotizacionDraft(e) {
        e.preventDefault();
        const id = document.getElementById('cot-id').value;
        const total = parseInt(document.getElementById('cot-valor-total').value) || 0;
        const subtotal = Math.round(total / 1.19);

        const data = {
            cliente: document.getElementById('cot-nombre').value || 'Anónimo',
            rut: document.getElementById('cot-rut').value, telefono: document.getElementById('cot-telefono').value,
            correo: document.getElementById('cot-correo').value, direccion: document.getElementById('cot-direccion').value,
            tipoCliente: document.getElementById('cot-tipoCliente').value, tipoLimpieza: document.getElementById('cot-servicio').value,
            fechaAgendada: document.getElementById('cot-fecha').value, horaAgendada: document.getElementById('cot-hora').value,
            metros: document.getElementById('cot-m2').value, personal: document.getElementById('cot-personal').value,
            descuento: document.getElementById('cot-descuento').value, prioridad: document.getElementById('cot-prioridad').value,
            descripcion: document.getElementById('cot-descripcion').value, valorSubtotal: subtotal, valorTotal: total,
            estadoCRM: 'Pendiente - Revisada', fuente: 'CRM Interno', modificadoEn: serverTimestamp()
        };

        try {
            if(id) { await updateDoc(doc(db, 'cotizaciones', id), data); UI.showToast('Cotización actualizada'); } 
            else { data.creadoEn = serverTimestamp(); await addDoc(collection(db, 'cotizaciones'), data); UI.showToast('Nueva cotización creada'); }
            UI.closeModal('modal-cotizacion');
        } catch(error) { UI.showToast('Error al procesar', 'error'); }
    },

    async approveCotizacion() {
        const id = document.getElementById('cot-id').value;
        if(!id) return;
        if(!confirm('¿Aprobar y agendar este servicio definitivamente?')) return;
        try {
            await updateDoc(doc(db, 'cotizaciones', id), { 
                estadoCRM: 'Aprobada', modificadoEn: serverTimestamp(), valorTotal: parseInt(document.getElementById('cot-valor-total').value) || 0
            });
            UI.closeModal('modal-cotizacion'); UI.showToast('¡Servicio Agendado! Evento creado en calendario.');
            Notifications.add('Servicio Agendado', `Cotización aprobada y registrada en agenda.`, 'agenda');
        } catch (err) { UI.showToast('Error al aprobar', 'error'); }
    },

    async rejectCotizacion() {
        const id = document.getElementById('cot-id').value;
        if(!id) return;
        const motivo = prompt('Por favor indique el motivo del rechazo (ej. Presupuesto, Cambio de fecha, etc):');
        if(motivo === null) return; 
        try {
            await updateDoc(doc(db, 'cotizaciones', id), { estadoCRM: 'Rechazada', motivoRechazo: motivo, modificadoEn: serverTimestamp() });
            UI.closeModal('modal-cotizacion'); UI.showToast('Cotización rechazada', 'error');
        } catch (err) { UI.showToast('Error de conexión', 'error'); }
    },

    async deleteCliente(id) { if(confirm('¿Eliminar cliente permanentemente?')) { await deleteDoc(doc(db, 'clientes', id)); UI.showToast('Eliminado', 'info'); } },
    async deleteCotizacion(id) { if(confirm('¿Eliminar cotización permanentemente?')) { await deleteDoc(doc(db, 'cotizaciones', id)); UI.showToast('Eliminado', 'info'); } },
    
    // --- GENERADOR/LIMPIADOR ---
    async ejecutarCargaMasiva() {
        const authKey = prompt('ESTO BORRARÁ TODO y creará datos limpios sin repetir. Escriba "LIMPIAR" para confirmar:');
        if (authKey !== 'LIMPIAR') return UI.showToast('Operación cancelada.', 'info');

        UI.showToast('Limpiando base de datos... Por favor espere.', 'info');
        
        try {
            const colecciones = ['cotizaciones', 'clientes', 'citas'];
            for (const colName of colecciones) {
                const snapshot = await getDocs(collection(db, colName));
                const promesas = [];
                snapshot.forEach(docSnap => {
                    promesas.push(deleteDoc(doc(db, colName, docSnap.id)));
                });
                await Promise.all(promesas); 
            }

            UI.showToast('Base de datos vacía. Generando nuevos registros...', 'info');

            const clientesBase = [
                { nombre: 'Constructora Sur', rut: '76.123.456-K', tipo: 'Empresa', dir: 'Av. Alemania 123' },
                { nombre: 'Juan Pérez', rut: '15.432.123-5', tipo: 'Persona Natural', dir: 'Los Pablos 456' },
                { nombre: 'Inmobiliaria Araucanía', rut: '77.222.333-4', tipo: 'Empresa', dir: 'San Martín 789' },
                { nombre: 'María Soto', rut: '18.555.666-7', tipo: 'Persona Natural', dir: 'Av. Pablo Neruda 12' },
                { nombre: 'Clínica Alemana Temuco', rut: '70.888.999-0', tipo: 'Empresa', dir: 'Senador Estébanez 2' },
                { nombre: 'Carlos Ruiz', rut: '16.777.888-9', tipo: 'Persona Natural', dir: 'Barrio Inglés' },
                { nombre: 'Automotora Centro', rut: '76.444.555-1', tipo: 'Empresa', dir: 'Caupolicán 1000' },
                { nombre: 'Ana Morales', rut: '17.333.444-2', tipo: 'Persona Natural', dir: 'Portal de la Frontera' },
                { nombre: 'Colegio San José', rut: '71.555.222-3', tipo: 'Empresa', dir: 'Pedro de Valdivia 500' },
                { nombre: 'Pedro Silva', rut: '14.222.111-K', tipo: 'Persona Natural', dir: 'Fundo El Carmen' },
                { nombre: 'Restaurante La Pampa', rut: '76.999.888-7', tipo: 'Empresa', dir: 'Av. Alemania 098' },
                { nombre: 'Camila Castro', rut: '19.444.333-2', tipo: 'Persona Natural', dir: 'Labranza' },
                { nombre: 'Sociedad de Inversiones', rut: '77.111.222-3', tipo: 'Empresa', dir: 'Torre Caupolicán 401' },
                { nombre: 'Luis Gómez', rut: '16.888.777-6', tipo: 'Persona Natural', dir: 'Avenida España' },
                { nombre: 'Familia González', rut: '12.333.222-1', tipo: 'Persona Natural', dir: 'Villa Los Ríos' }
            ];

            const clientesGuardados = [];
            for (let i = 0; i < clientesBase.length; i++) {
                const c = clientesBase[i];
                const fechaRegistro = new Date();
                fechaRegistro.setMonth(fechaRegistro.getMonth() - Math.floor(Math.random() * 6));
                
                const docRef = await addDoc(collection(db, 'clientes'), {
                    nombre: c.nombre, rut: c.rut,
                    correo: `contacto${i}@${c.tipo === 'Empresa' ? 'empresa.cl' : 'mail.com'}`,
                    telefono: `+56 9 ${Math.floor(Math.random()*80000000 + 10000000)}`,
                    direccion: c.dir, tipoCliente: c.tipo,
                    fechaRegistro: fechaRegistro.toISOString().split('T')[0],
                    creadoEn: Timestamp.fromDate(fechaRegistro)
                });
                clientesGuardados.push({ id: docRef.id, ...c });
            }

            const servicios = ['hogar', 'oficina', 'post', 'electro'];
            let registrosCreados = 0;

            for (let i = 0; i <= 7; i++) { 
                const cotizDelMes = Math.floor(Math.random() * 6) + 10; 

                for (let j = 0; j < cotizDelMes; j++) {
                    const cliObj = clientesGuardados[Math.floor(Math.random() * clientesGuardados.length)];
                    
                    const fechaCreacion = new Date();
                    fechaCreacion.setMonth(fechaCreacion.getMonth() - i);
                    fechaCreacion.setDate(Math.floor(Math.random() * 28) + 1); 

                    const fechaAgendada = new Date(fechaCreacion);
                    fechaAgendada.setDate(fechaAgendada.getDate() + Math.floor(Math.random() * 10) + 1);
                    const [yyyy, mm, dd] = fechaAgendada.toISOString().split('T')[0].split('-');

                    const servicioSelect = servicios[Math.floor(Math.random() * servicios.length)];
                    
                    let estadoActual = 'Pendiente';
                    if (i > 1) { estadoActual = Math.random() > 0.2 ? 'Aprobada' : 'Rechazada'; } 
                    else if (i === 1) { estadoActual = Math.random() > 0.4 ? 'Aprobada' : 'Pendiente'; } 
                    else { estadoActual = Math.random() > 0.6 ? 'Pendiente' : 'Aprobada'; }

                    let m2 = 0; let subtotal = 0; let personal = 1;
                    if (servicioSelect === 'hogar') { m2 = Math.floor(Math.random() * 80 + 40); subtotal = (1200 * m2); }
                    else if (servicioSelect === 'oficina') { m2 = Math.floor(Math.random() * 200 + 50); subtotal = (1500 * m2); personal = 2; }
                    else if (servicioSelect === 'post') { m2 = Math.floor(Math.random() * 150 + 60); subtotal = (2500 * m2); personal = 3; }
                    else if (servicioSelect === 'electro') { subtotal = 35000; }

                    const iva = Math.round(subtotal * 0.19); const total = subtotal + iva;

                    const cotizacionRef = await addDoc(collection(db, 'cotizaciones'), {
                        clienteId: cliObj.id, cliente: cliObj.nombre, rut: cliObj.rut,
                        correo: `contacto@${cliObj.tipo === 'Empresa' ? 'empresa.cl' : 'mail.com'}`,
                        telefono: `+56 9 ${Math.floor(Math.random()*80000000 + 10000000)}`,
                        direccion: cliObj.dir, tipoCliente: cliObj.tipo, tipoLimpieza: servicioSelect,
                        fechaAgendada: `${yyyy}-${mm}-${dd}`, horaAgendada: `10:00`,
                        metros: m2, personal: personal, descuento: 0,
                        prioridad: Math.random() > 0.8 ? 'Alta' : 'Normal',
                        descripcion: 'Generado automáticamente. Historial de CRM.',
                        valorSubtotal: subtotal, valorTotal: total,
                        estadoCRM: estadoActual, fuente: Math.random() > 0.4 ? 'Modal Web' : 'CRM Interno',
                        creadoEn: Timestamp.fromDate(fechaCreacion), modificadoEn: Timestamp.fromDate(fechaCreacion)
                    });
                    registrosCreados++;

                    if (estadoActual === 'Aprobada') {
                        await addDoc(collection(db, 'citas'), {
                            cotizacionId: cotizacionRef.id, clienteNombre: cliObj.nombre,
                            servicio: servicioSelect, fecha: `${yyyy}-${mm}-${dd}`,
                            hora: `10:00`, estado: 'Confirmada'
                        });
                    }
                }
            }
            UI.showToast(`¡Éxito! 15 clientes únicos y ${registrosCreados} cotizaciones creadas.`, 'success');
        } catch (error) {
            console.error("Error en limpieza:", error);
            UI.showToast('Error en la operación', 'error');
        }
    }
};

// ==============================================================
// 8. INIT & EVENT LISTENERS
// ==============================================================
function setupEventListeners() {
    document.querySelectorAll('[data-view]').forEach(btn => btn.addEventListener('click', (e) => { e.preventDefault(); Views.navigate(btn.dataset.view); }));
    document.querySelectorAll('[data-view-target]').forEach(btn => btn.addEventListener('click', (e) => { e.preventDefault(); Views.navigate(btn.dataset.viewTarget); }));
    document.getElementById('sidebar-toggle')?.addEventListener('click', () => document.getElementById('sidebar').classList.toggle('open'));
    document.getElementById('btn-notifications')?.addEventListener('click', (e) => { e.stopPropagation(); UI.toggleDropdown('dropdown-notifications'); });
    document.getElementById('btn-admin-menu')?.addEventListener('click', (e) => { e.stopPropagation(); UI.toggleDropdown('dropdown-admin'); });
    document.addEventListener('click', (e) => { if (!e.target.closest('.header-user') && !e.target.closest('.header-icon-btn') && !e.target.closest('.dropdown-menu')) document.querySelectorAll('.dropdown-menu').forEach(d => d.classList.remove('active')); });
    document.getElementById('btn-mark-read')?.addEventListener('click', () => { Notifications.markAllRead(); UI.toggleDropdown('dropdown-notifications'); });
    
    // --- FILTROS REACTIVOS CORREGIDOS (Vinculados al State Global) ---
    document.getElementById('filter-clientes')?.addEventListener('input', (e) => { 
        AppState.filtros.clientes = e.target.value.toLowerCase(); 
        Views.renderClientes(); 
    });
    document.getElementById('filter-cotizaciones')?.addEventListener('input', (e) => { 
        AppState.filtros.cotizaciones = e.target.value.toLowerCase(); 
        Views.renderCotizaciones(); 
    });
    // ----------------------------------------------------------------

    // Buscador Global
    const globalSearch = document.getElementById('global-search');
    const searchDropdown = document.getElementById('search-results-dropdown');
    const searchContent = document.getElementById('search-results-content');
    
    globalSearch?.addEventListener('input', (e) => {
        const val = e.target.value.toLowerCase();
        if(val.length < 2) { searchDropdown.classList.remove('active'); return; }
        
        const resClientes = AppState.clientes.filter(c => c.nombre.toLowerCase().includes(val));
        const resCot = AppState.cotizaciones.filter(c => (c.cliente||c.nombre||'').toLowerCase().includes(val) || (c.tipoLimpieza||c.servicio||'').toLowerCase().includes(val));
        
        let html = '';
        if(resClientes.length) html += `<div class="px-3 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50">Clientes</div>` + resClientes.slice(0,3).map(c => `<div class="search-result-item" onclick="UI.toggleDropdown('search-results-dropdown'); document.querySelector('[data-view-target=\\'clientes\\']').click();"><span class="font-bold text-sm text-slate-800">${Utils.escapeHtml(c.nombre)}</span><span class="text-xs text-slate-500">RUT: ${c.rut}</span></div>`).join('');
        if(resCot.length) html += `<div class="px-3 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50">Cotizaciones</div>` + resCot.slice(0,3).map(c => `<div class="search-result-item" onclick="UI.toggleDropdown('search-results-dropdown'); document.querySelector('[data-view-target=\\'cotizaciones\\']').click();"><span class="font-bold text-sm text-slate-800">${Utils.escapeHtml(Utils.getServicioName(c.tipoLimpieza||c.servicio))}</span><span class="text-xs text-slate-500">${Utils.escapeHtml(c.cliente||c.nombre)} • ${c.estadoCRM}</span></div>`).join('');
        
        searchContent.innerHTML = html || `<div class="p-4 text-center text-xs text-slate-500">No se encontraron coincidencias para "${val}"</div>`;
        searchDropdown.classList.add('active');
    });

    // Formularios Módulos
    document.getElementById('btn-save-cliente')?.addEventListener('click', DB.saveCliente);
    document.getElementById('btn-save-draft')?.addEventListener('click', DB.saveCotizacionDraft);
    document.getElementById('btn-approve-cotizacion')?.addEventListener('click', DB.approveCotizacion);
    document.getElementById('btn-reject-cotizacion')?.addEventListener('click', DB.rejectCotizacion);
    
    document.getElementById('btn-refresh')?.addEventListener('click', function() {
        if(this.disabled) return;
        this.disabled = true; document.getElementById('refresh-icon').classList.add('animate-spin'); UI.toggleSkeleton(true);
        setTimeout(() => { Views.renderDashboard(); Views.renderClientes(); Views.renderCotizaciones(); UI.toggleSkeleton(false); document.getElementById('refresh-icon').classList.remove('animate-spin'); this.disabled = false; UI.showToast('Dashboard sincronizado', 'success'); }, 800);
    });

    document.getElementById('btn-logout-header')?.addEventListener('click', () => { if(confirm('¿Cerrar sesión?')) window.location.href='login.html'; });
    document.getElementById('btn-logout-sidebar')?.addEventListener('click', () => { if(confirm('¿Cerrar sesión?')) window.location.href='login.html'; });
    
    // Exponer función de Limpieza
    window.ejecutarCargaMasiva = DB.ejecutarCargaMasiva;
}

document.addEventListener('DOMContentLoaded', () => {
    onAuthStateChanged(auth, (user) => {
        if (!user) { window.location.href = 'login.html'; } else {
            AppState.user.name = user.email.split('@')[0].toUpperCase();
            document.getElementById('admin-name').textContent = AppState.user.name;
            const dateOpts = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
            document.getElementById('header-date').textContent = new Date().toLocaleDateString('es-ES', dateOpts);
            Calculator.init(); setupEventListeners(); DB.initDataListeners(); Views.navigate('panel');
        }
    });
});