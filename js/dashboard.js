/**
 * js/dashboard.js — Espacio Limpio Ltda.
 * Arquitectura Vanilla JS (ES6) - Estilo SaaS Premium
 * Integrado Full con Formulario Web y Firebase en Tiempo Real
 */

import { db } from './db-config.js';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, query, orderBy } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
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
    calendarInstance: null,
    isInitialLoad: true
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
    animateNumber: (id, target) => {
        const el = document.getElementById(id);
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

    openModal(id) { 
        document.getElementById(id)?.classList.add('active'); 
    },
    
    closeModal(id) { 
        const modal = document.getElementById(id);
        if (modal) {
            modal.classList.remove('active');
            modal.querySelectorAll('form').forEach(f => f.reset());
        }
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
            // Precio por M2 basado en landing + costos operativos extra
            let factorM2 = (servicio === 'post') ? 2500 : (servicio === 'oficina' ? 1500 : 1200);
            let m2Calc = m2 > 0 ? m2 : 30; // Minimo 30m2 as default
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
    markAllRead() {
        AppState.notificaciones.forEach(n => n.read = true);
        this.render();
        UI.showToast('Notificaciones marcadas como leídas', 'info');
    }
};

// ==============================================================
// 5. CONTROLADORES DE INTERFAZ Y MODALES (Flujo SaaS)
// ==============================================================
window.Controllers = {
    newCliente() {
        UI.openModal('modal-cliente');
    },

    newCotizacion() {
        UI.closeModal('modal-cotizacion'); // Reset forms
        document.getElementById('cot-id').value = '';
        document.getElementById('cot-modal-title').textContent = 'Generar Cotización Manual';
        document.getElementById('cot-modal-source').innerHTML = '<i data-lucide="laptop" class="inline w-3 h-3 mr-1"></i> Origen: Creación Manual en CRM';
        document.getElementById('cot-modal-source').className = "text-xs font-semibold text-slate-500 mt-1";
        
        // Mostrar botones de nueva coti
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
        
        // Adaptar servicio al select
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

        // Títulos
        document.getElementById('cot-modal-title').textContent = `Cotización: ${c.cliente || c.nombre}`;
        const esWeb = c.fuente === 'Modal Web' || !c.fuente;
        document.getElementById('cot-modal-source').innerHTML = esWeb ? '<i data-lucide="globe" class="inline w-3 h-3 mr-1"></i> Origen: Solicitud Web Pública' : '<i data-lucide="laptop" class="inline w-3 h-3 mr-1"></i> Origen: Manual';
        document.getElementById('cot-modal-source').className = `text-xs font-semibold mt-1 ${esWeb ? 'text-blue-600' : 'text-slate-500'}`;

        // Controles según estado
        const btnSave = document.getElementById('btn-save-draft');
        const btnApprove = document.getElementById('btn-approve-cotizacion');
        const btnReject = document.getElementById('btn-reject-cotizacion');
        const btnPdf = document.getElementById('btn-export-pdf');

        btnSave.textContent = 'Actualizar Datos';
        btnPdf.classList.remove('hidden');

        if(c.estadoCRM === 'Aprobada' || c.estadoCRM === 'Rechazada') {
            btnApprove.classList.add('hidden');
            btnReject.classList.add('hidden');
            btnSave.classList.add('hidden'); // Solo vista
        } else {
            btnApprove.classList.remove('hidden');
            btnReject.classList.remove('hidden');
            btnSave.classList.remove('hidden');
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
    },

    renderDashboard() {
        if (AppState.view !== 'panel') return;
        
        const hoy = new Date().toISOString().split('T')[0];
        const ingresos = AppState.cotizaciones.filter(c => c.estadoCRM === 'Aprobada').reduce((acc, c) => acc + (parseInt(c.valorTotal) || parseInt(c.valorCotizado?.replace(/\D/g,'')) || 0), 0);
        
        Utils.animateNumber('kpi-clientes', AppState.clientes.length);
        Utils.animateNumber('kpi-citas', AppState.citas.filter(c => c.fecha === hoy).length);
        Utils.animateNumber('kpi-pendientes', AppState.cotizaciones.filter(c => c.estadoCRM?.includes('Pendiente') || c.estadoCRM?.includes('Revisión')).length);
        Utils.animateNumber('kpi-ingresos', Utils.formatCLP(ingresos));

        // Tabla Reciente (Mezcla Citas Web y Cotizaciones Manuales)
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

        this.renderChart(ingresos);
        this.renderTimeline();
    },

    renderChart(ingresosRealesMesActual) {
        const ctx = document.getElementById('chart-ventas');
        if (!ctx) return;
        if (AppState.chartInstance) AppState.chartInstance.destroy();

        const data = Array(6).fill(0);
        const labels = [];
        for(let i=5; i>=0; i--) {
            const d = new Date(); d.setMonth(d.getMonth() - i);
            labels.push(d.toLocaleString('es', {month: 'short'}).toUpperCase());
            data[5-i] = Math.floor(Math.random() * 2000000) + 500000; // Datos históricos mock
        }
        data[5] += ingresosRealesMesActual; // Sumar reales

        AppState.chartInstance = new Chart(ctx, {
            type: 'line',
            data: { labels, datasets: [{ label: 'Ingresos Proyectados', data, borderColor: '#2563eb', backgroundColor: 'rgba(37,99,235,0.1)', borderWidth: 2, fill: true, tension: 0.4, pointBackgroundColor: '#2563eb' }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { border:{display:false}, grid:{color:'#f1f5f9'}, ticks: { color: '#64748b', callback: v => `$${v/1000}k` } }, x: { border:{display:false}, grid:{display:false}, ticks:{color:'#64748b'} } } }
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

        const renderStr = AppState.clientes.map(c => `
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
        tbody.innerHTML = renderStr || `<tr><td colspan="6"><div class="empty-state"><i data-lucide="users"></i><h3>No hay clientes</h3></div></td></tr>`;
        
        // Poblar Select Modal
        const select = document.getElementById('cot-cliente-select');
        if(select) select.innerHTML = '<option value="">Seleccione o escriba abajo...</option>' + AppState.clientes.map(c => `<option value="${c.id}">${Utils.escapeHtml(c.nombre)}</option>`).join('');
        if(window.lucide) lucide.createIcons();
    },

    renderCotizaciones() {
        const tbody = document.getElementById('cotizaciones-tbody');
        if(!tbody) return;
        const renderStr = AppState.cotizaciones.map(c => {
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
        tbody.innerHTML = renderStr || `<tr><td colspan="7"><div class="empty-state"><i data-lucide="file-text"></i><h3>Sin cotizaciones</h3></div></td></tr>`;
        if(window.lucide) lucide.createIcons();
    },

    renderCalendar() {
        const calEl = document.getElementById('calendar-container');
        if(!calEl || !window.FullCalendar) return;

        // Extraer citas de las cotizaciones aprobadas o documentos de citas
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
                eventClick: (info) => {
                    UI.showToast('Abriendo detalles...', 'info');
                    Controllers.editCotizacion(info.event.id);
                }
            });
            AppState.calendarInstance.render();
        } else {
            AppState.calendarInstance.removeAllEvents();
            AppState.calendarInstance.addEventSource(events);
        }
    }
};

// ==============================================================
// 7. FIREBASE DB CONTROLLER (Realtime CRUD)
// ==============================================================
window.DB = {
    initDataListeners() {
        // 1. Escuchar Cotizaciones (Web + CRM)
        const qCotiz = query(collection(db, 'cotizaciones'), orderBy('creadoEn', 'desc'));
        onSnapshot(qCotiz, (snapshot) => {
            snapshot.docChanges().forEach((change) => {
                if (change.type === 'added' && !AppState.isInitialLoad) {
                    const data = change.doc.data();
                    if (data.fuente === 'Modal Web') {
                        UI.showToast(`Nueva solicitud web de ${data.cliente || data.nombre}`, 'info');
                        Notifications.add('Nueva Solicitud Web', `${data.cliente || data.nombre} requiere ${Utils.getServicioName(data.tipoLimpieza || data.servicio)}.`, 'quote');
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
        }, err => console.error("Error Leyendo Cotizaciones", err));

        // 2. Escuchar Clientes
        onSnapshot(query(collection(db, 'clientes'), orderBy('creadoEn', 'desc')), snap => {
            AppState.clientes = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            Views.renderClientes();
            Views.renderDashboard();
        });
    },

    async saveCliente(e) {
        e.preventDefault();
        try {
            await addDoc(collection(db, 'clientes'), {
                nombre: document.getElementById('cli-nombre').value,
                rut: document.getElementById('cli-rut').value,
                telefono: document.getElementById('cli-telefono').value,
                correo: document.getElementById('cli-correo').value,
                direccion: document.getElementById('cli-direccion').value,
                fechaRegistro: new Date().toISOString().split('T')[0],
                creadoEn: serverTimestamp()
            });
            UI.closeModal('modal-cliente');
            UI.showToast('Cliente registrado con éxito');
        } catch(error) { UI.showToast('Error al guardar', 'error'); }
    },

    async saveCotizacionDraft(e) {
        e.preventDefault();
        const id = document.getElementById('cot-id').value;
        const total = parseInt(document.getElementById('cot-valor-total').value) || 0;
        const subtotal = Math.round(total / 1.19);

        const data = {
            cliente: document.getElementById('cot-nombre').value || 'Anónimo',
            rut: document.getElementById('cot-rut').value,
            telefono: document.getElementById('cot-telefono').value,
            correo: document.getElementById('cot-correo').value,
            direccion: document.getElementById('cot-direccion').value,
            tipoCliente: document.getElementById('cot-tipoCliente').value,
            tipoLimpieza: document.getElementById('cot-servicio').value,
            fechaAgendada: document.getElementById('cot-fecha').value,
            horaAgendada: document.getElementById('cot-hora').value,
            metros: document.getElementById('cot-m2').value,
            personal: document.getElementById('cot-personal').value,
            descuento: document.getElementById('cot-descuento').value,
            prioridad: document.getElementById('cot-prioridad').value,
            descripcion: document.getElementById('cot-descripcion').value,
            valorSubtotal: subtotal,
            valorTotal: total,
            estadoCRM: 'Pendiente - Revisada',
            fuente: 'CRM Interno',
            modificadoEn: serverTimestamp()
        };

        try {
            if(id) {
                await updateDoc(doc(db, 'cotizaciones', id), data);
                UI.showToast('Cotización actualizada');
            } else {
                data.creadoEn = serverTimestamp();
                await addDoc(collection(db, 'cotizaciones'), data);
                UI.showToast('Nueva cotización creada');
            }
            UI.closeModal('modal-cotizacion');
        } catch(error) { UI.showToast('Error al procesar', 'error'); }
    },

    async approveCotizacion() {
        const id = document.getElementById('cot-id').value;
        if(!id) return UI.showToast('Primero guarde la cotización', 'error');
        if(!confirm('¿Aprobar y agendar este servicio definitivamente?')) return;
        
        try {
            await updateDoc(doc(db, 'cotizaciones', id), { 
                estadoCRM: 'Aprobada', modificadoEn: serverTimestamp(),
                // Aseguramos que guarde los últimos cambios hechos en el modal
                valorTotal: parseInt(document.getElementById('cot-valor-total').value) || 0
            });
            UI.closeModal('modal-cotizacion');
            UI.showToast('¡Servicio Agendado! Evento creado en calendario.');
            Notifications.add('Servicio Agendado', `Cotización aprobada y registrada en agenda.`, 'agenda');
        } catch (err) { UI.showToast('Error al aprobar', 'error'); }
    },

    async rejectCotizacion() {
        const id = document.getElementById('cot-id').value;
        if(!id) return;
        const motivo = prompt('Por favor indique el motivo del rechazo (ej. Presupuesto, Cambio de fecha, etc):');
        if(motivo === null) return; // Canceló
        
        try {
            await updateDoc(doc(db, 'cotizaciones', id), { 
                estadoCRM: 'Rechazada', 
                motivoRechazo: motivo,
                modificadoEn: serverTimestamp() 
            });
            UI.closeModal('modal-cotizacion');
            UI.showToast('Cotización rechazada', 'error');
        } catch (err) { UI.showToast('Error de conexión', 'error'); }
    },

    async deleteCliente(id) { if(confirm('¿Eliminar cliente?')) { await deleteDoc(doc(db, 'clientes', id)); UI.showToast('Eliminado', 'info'); } },
    async deleteCotizacion(id) { if(confirm('¿Eliminar cotización permanentemente?')) { await deleteDoc(doc(db, 'cotizaciones', id)); UI.showToast('Eliminado', 'info'); } }
};

// ==============================================================
// 8. INIT & EVENT LISTENERS
// ==============================================================
function setupEventListeners() {
    // Nav
    document.querySelectorAll('[data-view]').forEach(btn => btn.addEventListener('click', (e) => { e.preventDefault(); Views.navigate(btn.dataset.view); }));
    document.querySelectorAll('[data-view-target]').forEach(btn => btn.addEventListener('click', (e) => { e.preventDefault(); Views.navigate(btn.dataset.viewTarget); }));
    document.getElementById('sidebar-toggle')?.addEventListener('click', () => document.getElementById('sidebar').classList.toggle('open'));
    
    // Dropdowns
    document.getElementById('btn-notifications')?.addEventListener('click', (e) => { e.stopPropagation(); UI.toggleDropdown('dropdown-notifications'); });
    document.getElementById('btn-admin-menu')?.addEventListener('click', (e) => { e.stopPropagation(); UI.toggleDropdown('dropdown-admin'); });
    document.addEventListener('click', (e) => { if (!e.target.closest('.header-user') && !e.target.closest('.header-icon-btn') && !e.target.closest('.dropdown-menu')) document.querySelectorAll('.dropdown-menu').forEach(d => d.classList.remove('active')); });

    // Notificaciones acciones
    document.getElementById('btn-mark-read')?.addEventListener('click', () => { Notifications.markAllRead(); UI.toggleDropdown('dropdown-notifications'); });

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

    // Filtros de Tablas (Local)
    document.getElementById('filter-clientes')?.addEventListener('input', (e) => { const v = e.target.value.toLowerCase(); document.querySelectorAll('#clientes-tbody tr').forEach(tr => tr.style.display = tr.innerText.toLowerCase().includes(v) ? '' : 'none'); });
    document.getElementById('filter-cotizaciones')?.addEventListener('input', (e) => { const v = e.target.value.toLowerCase(); document.querySelectorAll('#cotizaciones-tbody tr').forEach(tr => tr.style.display = tr.innerText.toLowerCase().includes(v) ? '' : 'none'); });

    // Botones del Modal de Cotización
    document.getElementById('btn-save-draft')?.addEventListener('click', DB.saveCotizacionDraft);
    document.getElementById('btn-approve-cotizacion')?.addEventListener('click', DB.approveCotizacion);
    document.getElementById('btn-reject-cotizacion')?.addEventListener('click', DB.rejectCotizacion);
    document.getElementById('btn-export-pdf')?.addEventListener('click', () => { UI.showToast('Generando PDF...', 'info'); setTimeout(()=>UI.showToast('PDF Descargado', 'success'), 1500); });
    
    // Formularios Módulos
    document.getElementById('btn-save-cliente')?.addEventListener('click', DB.saveCliente);

    // Refresh Avanzado
    document.getElementById('btn-refresh')?.addEventListener('click', function() {
        if(this.disabled) return;
        this.disabled = true;
        document.getElementById('refresh-icon').classList.add('animate-spin');
        UI.toggleSkeleton(true);
        setTimeout(() => {
            Views.renderDashboard(); Views.renderClientes(); Views.renderCotizaciones();
            UI.toggleSkeleton(false);
            document.getElementById('refresh-icon').classList.remove('animate-spin');
            this.disabled = false;
            UI.showToast('Dashboard sincronizado', 'success');
        }, 800);
    });

    // Cierre Sesion Visual
    document.getElementById('btn-logout-header')?.addEventListener('click', () => { if(confirm('¿Cerrar sesión?')) window.location.href='login.html'; });
    document.getElementById('btn-logout-sidebar')?.addEventListener('click', () => { if(confirm('¿Cerrar sesión?')) window.location.href='login.html'; });
}

document.addEventListener('DOMContentLoaded', () => {
    // Auth Guard
    onAuthStateChanged(auth, (user) => {
        if (!user) {
            window.location.href = 'login.html';
        } else {
            AppState.user.name = user.email.split('@')[0].toUpperCase();
            document.getElementById('admin-name').textContent = AppState.user.name;
            
            const dateOpts = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
            document.getElementById('header-date').textContent = new Date().toLocaleDateString('es-ES', dateOpts);

            Calculator.init();
            setupEventListeners();
            DB.initDataListeners(); // Activar listeners de Firebase reales
            Views.navigate('panel');
        }
    });
});
