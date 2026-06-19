/**
 * ==============================================================
 * js/dashboard.js — Espacio Limpio Ltda.
 * Arquitectura Vanilla JS (ES6) - Estilo SaaS Premium
 * * DESCRIPCIÓN: 
 * Este archivo centraliza la lógica del Panel de Administración.
 * Maneja el estado global, cálculos de cotizaciones (Automático/Manual),
 * renderizado de vistas, exportación a PDF, configuración de tarifas dinámicas,
 * creación de colaboradores y la conexión segura (RBAC) con Firebase.
 * ==============================================================
 */

import { db } from './db-config.js';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, setDoc, serverTimestamp, query, orderBy, where, getDocs } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { getAuth, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';

// Inicializamos el servicio de autenticación de Firebase
const auth = getAuth();

// ==============================================================
// 1. ESTADO GLOBAL (State Management)
// ==============================================================
// Almacena en memoria los datos de la base de datos para no tener que consultarla por cada clic
const AppState = {
    view: 'panel', // Vista predeterminada
    user: { name: 'Usuario', role: 'colaborador', email: '' }, // Se asume el rol más bajo por defecto por seguridad
    clientes: [],
    cotizaciones: [],
    citas: [],
    usuarios: [], // Aquí guardaremos la lista de colaboradores
    notificaciones: [],
    chartInstance: null,
    chartServicios: null,
    chartConversion: null,
    calendarInstance: null,
    isInitialLoad: true,
    filtros: { // Textos ingresados en los buscadores en tiempo real
        clientes: '',
        cotizaciones: ''
    },
    // Tarifas por defecto. Se actualizarán automáticamente al leer Firestore
    configuracion: {
        base_hogar: 20000, base_oficina: 35000, base_post: 80000, base_electro: 35000,
        m2_hogar: 1200, m2_oficina: 1500, m2_post: 2500,
        extra_personal: 15000
    }
};

// ==============================================================
// 2. UTILIDADES CORE (Formatos y Helpers)
// ==============================================================
const Utils = {
    // Formato moneda chilena
    formatCLP: (val) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(val || 0),
    
    // Formato de fecha (ej: 25 Jun 2026)
    formatDate: (dateStr) => {
        if (!dateStr) return '—';
        const [y, m, d] = dateStr.split('-');
        const meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
        return `${d} ${meses[parseInt(m)-1]} ${y}`;
    },
    
    // Tiempo relativo (ej: Hace 5m)
    relativeTime: (date) => {
        if (!date) return '—';
        const diff = Math.floor((new Date() - date) / 60000);
        if (diff < 1) return 'Ahora';
        if (diff < 60) return `Hace ${diff}m`;
        if (diff < 1440) return `Hace ${Math.floor(diff/60)}h`;
        return Utils.formatDate(date.toISOString().split('T')[0]);
    },
    
    // Evita inyecciones de código malicioso XSS
    escapeHtml: (str) => String(str).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[m]),
    
    // Efecto visual tipo odómetro para los números del panel
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
    
    // Devuelve el nombre comercial real de los servicios
    getServicioName: (val) => {
        const map = { 'hogar': 'Limpieza Residencial', 'oficina': 'Limpieza de Oficinas', 'post': 'Post-Construcción', 'electro': 'Hornos / Electrodomésticos' };
        return map[val] || val;
    }
};

// ==============================================================
// 3. UI CONTROLLER (Manejo de la Interfaz Visual)
// ==============================================================
window.UI = {
    // Generador de notificaciones emergentes (Toasts)
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
// 4. CALCULADORA DINÁMICA Y NOTIFICACIONES
// ==============================================================
const Calculator = {
    init() {
        document.querySelectorAll('.calc-trigger').forEach(el => el.addEventListener('input', () => this.calculate()));
        document.getElementById('cot-servicio')?.addEventListener('change', () => this.calculate());
        document.getElementById('cot-modo-calculo')?.addEventListener('change', () => this.calculate());
    },
    calculate() {
        const modo = document.getElementById('cot-modo-calculo')?.value || 'auto';
        const inputSubtotal = document.getElementById('cot-subtotal-input');
        let subtotal = 0;

        if (modo === 'auto') {
            // Lógica por Cálculo Automático
            if(inputSubtotal) {
                inputSubtotal.readOnly = true;
                inputSubtotal.classList.add('bg-slate-100');
                inputSubtotal.classList.remove('bg-white', 'border-blue-500', 'ring-2', 'ring-blue-100');
            }
            
            // Cargar configuración de precios desde Firebase (alojada en memoria)
            const cfg = AppState.configuracion;
            const baseValues = { 'hogar': cfg.base_hogar, 'oficina': cfg.base_oficina, 'post': cfg.base_post, 'electro': cfg.base_electro };
            
            const servicio = document.getElementById('cot-servicio')?.value || 'hogar';
            const m2 = parseInt(document.getElementById('cot-m2')?.value) || 0;
            const personal = parseInt(document.getElementById('cot-personal')?.value) || 1;
            
            let base = baseValues[servicio] || 0;
            
            if(servicio === 'electro') {
                subtotal = base + ((personal - 1) * cfg.extra_personal);
            } else {
                let factorM2 = (servicio === 'post') ? cfg.m2_post : (servicio === 'oficina' ? cfg.m2_oficina : cfg.m2_hogar);
                let costoPorM2 = m2 * factorM2;
                
                // Si el cálculo por m2 da menos que la base mínima (o si hay 0 m2), se cobra la base
                let costoServicio = costoPorM2 > base ? costoPorM2 : base;
                subtotal = costoServicio + ((personal - 1) * cfg.extra_personal);
            }
            if(inputSubtotal) inputSubtotal.value = subtotal;

        } else {
            // Lógica por Ingreso Manual
            if(inputSubtotal) {
                inputSubtotal.readOnly = false;
                inputSubtotal.classList.remove('bg-slate-100');
                inputSubtotal.classList.add('bg-white', 'border-blue-500', 'ring-2', 'ring-blue-100');
                subtotal = parseInt(inputSubtotal.value) || 0;
            }
        }

        const descuento = parseInt(document.getElementById('cot-descuento')?.value) || 0;
        let netoFinal = subtotal - descuento;
        if (netoFinal < 0) netoFinal = 0;
        
        let iva = Math.round(netoFinal * 0.19);
        let total = netoFinal + iva;
        
        this.updateUI(iva, total);
    },
    updateUI(iva, tot) {
        const labelIva = document.getElementById('label-iva');
        const cotValorTotal = document.getElementById('cot-valor-total');
        if(labelIva) labelIva.textContent = Utils.formatCLP(iva);
        if(cotValorTotal) cotValorTotal.value = tot;
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

// ==============================================================
// 5. CONTROLADORES GLOBALES (Acciones Principales y RBAC)
// ==============================================================
window.Controllers = {
    newCliente() { UI.openModal('modal-cliente'); },
    
    newColaborador() { 
        document.getElementById('form-colaborador').reset();
        UI.openModal('modal-colaborador'); 
    },

    newCotizacion() {
        UI.closeModal('modal-cotizacion');
        document.getElementById('cot-id').value = '';
        document.getElementById('cot-modal-title').textContent = 'Generar Cotización Manual';
        document.getElementById('cot-modal-source').innerHTML = '<i data-lucide="laptop" class="inline w-3 h-3 mr-1"></i> Origen: Manual';
        document.getElementById('btn-approve-cotizacion').classList.add('hidden');
        document.getElementById('btn-reject-cotizacion').classList.add('hidden');
        document.getElementById('btn-export-pdf').classList.add('hidden');
        document.getElementById('btn-save-draft').textContent = 'Guardar Cotización';
        
        // Forzar a modo automático al generar nueva cotización
        const modoSelect = document.getElementById('cot-modo-calculo');
        if(modoSelect) modoSelect.value = 'auto';

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

        // Preservar el valor subtotal guardado originalmente
        const inputSubtotal = document.getElementById('cot-subtotal-input');
        const modoSelect = document.getElementById('cot-modo-calculo');
        
        if (c.valorSubtotal && inputSubtotal && modoSelect) {
            modoSelect.value = 'manual';
            inputSubtotal.value = c.valorSubtotal;
        }

        document.getElementById('cot-modal-title').textContent = `Cotización: ${c.cliente || c.nombre}`;
        const esWeb = c.fuente === 'Modal Web' || !c.fuente;
        document.getElementById('cot-modal-source').innerHTML = esWeb ? '<i data-lucide="globe" class="inline w-3 h-3 mr-1"></i> Origen: Solicitud Web Pública' : '<i data-lucide="laptop" class="inline w-3 h-3 mr-1"></i> Origen: Manual';
        
        const btnSave = document.getElementById('btn-save-draft');
        const btnApprove = document.getElementById('btn-approve-cotizacion');
        const btnReject = document.getElementById('btn-reject-cotizacion');
        
        btnSave.textContent = 'Actualizar Datos';
        document.getElementById('btn-export-pdf').classList.remove('hidden');

        // RBAC: Colaboradores no pueden Aprobar ni Rechazar
        if(AppState.user.role !== 'admin') {
            btnApprove.classList.add('hidden');
            btnReject.classList.add('hidden');
            btnSave.classList.remove('hidden'); 
        } else {
            if(c.estadoCRM === 'Aprobada' || c.estadoCRM === 'Rechazada') {
                btnApprove.classList.add('hidden'); btnReject.classList.add('hidden'); btnSave.classList.add('hidden');
            } else {
                btnApprove.classList.remove('hidden'); btnReject.classList.remove('hidden'); btnSave.classList.remove('hidden');
            }
        }

        if(window.lucide) lucide.createIcons();
        Calculator.calculate();
        UI.openModal('modal-cotizacion');
    },

    // Generador nativo de Documento PDF
    exportarPDF() {
        const nombre = document.getElementById('cot-nombre').value || 'Cliente General';
        const rut = document.getElementById('cot-rut').value || 'N/A';
        const servicio = Utils.getServicioName(document.getElementById('cot-servicio').value);
        const total = document.getElementById('cot-valor-total').value;
        const fecha = document.getElementById('cot-fecha').value || new Date().toISOString().split('T')[0];
        
        const printWindow = window.open('', '_blank');
        printWindow.document.write(`
            <html>
            <head>
                <title>Cotización - ${nombre}</title>
                <style>
                    body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 40px; color: #333; }
                    .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #2563eb; padding-bottom: 20px; margin-bottom: 30px; }
                    h1 { color: #2563eb; margin: 0; font-size: 24px; }
                    .info-box { background: #f8fafc; padding: 20px; border-radius: 8px; margin-bottom: 30px; }
                    .info-box p { margin: 5px 0; font-size: 14px; }
                    table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 14px; }
                    th, td { border: 1px solid #e2e8f0; padding: 12px; text-align: left; }
                    th { background-color: #f1f5f9; color: #475569; }
                    .total { font-size: 1.5em; font-weight: bold; color: #0f172a; text-align: right; margin-top: 20px; }
                    .footer { margin-top: 50px; font-size: 11px; color: #94a3b8; text-align: center; }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>Espacio Limpio</h1>
                    <div style="text-align: right; color: #64748b; font-size: 12px;">
                        Fecha Emisión: ${Utils.formatDate(new Date().toISOString().split('T')[0])}<br>
                        Documento Oficial Cotización
                    </div>
                </div>
                <div class="info-box">
                    <p><strong>Cliente / Empresa:</strong> ${nombre}</p>
                    <p><strong>RUT:</strong> ${rut}</p>
                    <p><strong>Fecha Programada del Servicio:</strong> ${Utils.formatDate(fecha)}</p>
                </div>
                <table>
                    <tr><th>Descripción del Servicio</th><th>Valor Total Acordado</th></tr>
                    <tr>
                        <td>${servicio} <br><span style="font-size:11px; color:#64748b;">(Incluye personal, insumos e impuestos correspondientes)</span></td>
                        <td style="font-weight:bold;">${Utils.formatCLP(total)}</td>
                    </tr>
                </table>
                <div class="total">Total a Pagar: ${Utils.formatCLP(total)}</div>
                <div class="footer">
                    Este documento ha sido generado automáticamente por la Sociedad de Limpieza R & J Ltda.<br>
                    Para consultas, comuníquese a contacto@espaciolimpio.cl
                </div>
                <script>
                    window.onload = function() { window.print(); }
                </script>
            </body>
            </html>
        `);
        printWindow.document.close();
    }
};

// ==============================================================
// 6. CONTROLADORES DE VISTA (Renders de Pantallas)
// ==============================================================
const Views = {
    // Control de navegación entre paneles
    navigate(viewId) {
        // ESCUDO DE SEGURIDAD (Routing Guard):
        // Si el usuario es colaborador e intenta acceder a zonas bloqueadas, el sistema lo rechaza.
        if (AppState.user.role !== 'admin' && ['reportes', 'ajustes', 'colaboradores'].includes(viewId)) {
            UI.showToast('Acceso denegado. Privilegios de administrador requeridos.', 'error');
            return; 
        }

        AppState.view = viewId;
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        document.getElementById(`view-${viewId}`)?.classList.add('active');
        document.querySelectorAll('.sidebar-nav-item').forEach(btn => btn.classList.toggle('active', btn.dataset.view === viewId));
        
        const titles = { panel: 'Panel Principal', clientes: 'Directorio de Clientes', agendamiento: 'Calendario Operativo', cotizaciones: 'Gestión de Cotizaciones', reportes: 'Reportes Avanzados', ajustes: 'Configuración del CRM', colaboradores: 'Gestión de Colaboradores' };
        document.getElementById('header-title').textContent = titles[viewId] || 'Panel';
        
        if (window.innerWidth < 900) document.getElementById('sidebar').classList.remove('open');
        
        // Ejecución de renderizado condicional. (CORRECCIÓN: Incluye colaboradores)
        if (viewId === 'panel') this.renderDashboard();
        if (viewId === 'agendamiento') this.renderCalendar();
        if (viewId === 'reportes') this.renderReportes();
        if (viewId === 'colaboradores') this.renderColaboradores(); // <--- Renderiza la tabla al cambiar de vista
    },

    renderDashboard() {
        if (AppState.view !== 'panel') return;
        
        const hoy = new Date().toISOString().split('T')[0];
        const ingresos = AppState.cotizaciones.filter(c => c.estadoCRM === 'Aprobada').reduce((acc, c) => acc + (parseInt(c.valorTotal) || parseInt(c.valorCotizado?.replace(/\D/g,'')) || 0), 0);
        
        Utils.animateNumber('[data-kpi="clientes"]', AppState.clientes.length);
        Utils.animateNumber('[data-kpi="citas"]', AppState.citas.filter(c => c.fecha === hoy || c.fechaAgendada === hoy).length);
        Utils.animateNumber('[data-kpi="pendientes"]', AppState.cotizaciones.filter(c => c.estadoCRM?.includes('Pendiente') || c.estadoCRM?.includes('Revisi')).length);
        
        // RBAC: Ocultar KPI de ingresos al colaborador
        const ingresosKpi = document.querySelector('[data-kpi="ingresos"]');
        if (ingresosKpi) {
            if(AppState.user.role !== 'admin') {
                ingresosKpi.textContent = '***';
            } else {
                Utils.animateNumber('[data-kpi="ingresos"]', Utils.formatCLP(ingresos));
            }
        }

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
        
        // RBAC: Colaborador no ve la gráfica financiera
        if(AppState.user.role !== 'admin') {
            ctx.parentElement.innerHTML = '<div class="empty-state h-full flex flex-col justify-center items-center"><i data-lucide="lock" class="w-8 h-8 text-slate-300 mb-2"></i><p class="text-slate-400 text-sm">Información financiera restringida</p></div>';
            if(window.lucide) lucide.createIcons();
            return;
        }

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
                    ${AppState.user.role === 'admin' ? 
                        `<button onclick="DB.deleteCliente('${c.id}')" class="p-1.5 text-red-500 hover:bg-red-50 rounded transition"><i data-lucide="trash-2" class="w-4 h-4"></i></button>` : 
                        `<span class="text-xs text-slate-400">Sin permisos</span>`
                    }
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
    },
    
    // Genera la tabla visual de colaboradores para el módulo del Administrador
    renderColaboradores() {
        const tbody = document.getElementById('colaboradores-tbody');
        if(!tbody) return;

        const renderStr = AppState.usuarios.map(u => {
            const isBloqueado = u.estado === 'bloqueado';
            const badgeClass = isBloqueado ? 'bg-red-100 text-red-700 border-red-200' : 'bg-green-100 text-green-700 border-green-200';
            
            return `
            <tr>
                <td>
                    <div class="client-cell">
                        <div class="client-avatar-sm ${isBloqueado ? 'bg-slate-200 text-slate-500' : ''}">${u.nombre.charAt(0).toUpperCase()}</div>
                        <div><p class="client-name-text">${Utils.escapeHtml(u.nombre)}</p></div>
                    </div>
                </td>
                <td><p class="text-sm text-slate-600">${Utils.escapeHtml(u.email)}</p></td>
                <td><span class="text-xs font-bold uppercase tracking-wider text-slate-500">${u.rol}</span></td>
                <td><span class="estado-badge border ${badgeClass}">${u.estado || 'activo'}</span></td>
                <td class="text-center">
                    <button onclick="DB.toggleEstadoColaborador('${u.id}', '${u.estado}')" class="p-1.5 ${isBloqueado ? 'text-green-600 hover:bg-green-50' : 'text-red-500 hover:bg-red-50'} rounded transition" title="${isBloqueado ? 'Reactivar' : 'Bloquear'}">
                        <i data-lucide="${isBloqueado ? 'unlock' : 'lock'}" class="w-4 h-4"></i>
                    </button>
                </td>
            </tr>
            `;
        }).join('');
        
        tbody.innerHTML = renderStr || `<tr><td colspan="5"><div class="empty-state"><i data-lucide="shield"></i><h3>No hay colaboradores registrados</h3></div></td></tr>`;
        if(window.lucide) lucide.createIcons();
    },

    // Rellena la pestaña Ajustes con la configuración existente en la BD
    renderConfiguracion() {
        const cfg = AppState.configuracion;
        const elHogar = document.getElementById('cfg-base-hogar');
        if (elHogar) {
            elHogar.value = cfg.base_hogar;
            document.getElementById('cfg-base-oficina').value = cfg.base_oficina;
            document.getElementById('cfg-base-post').value = cfg.base_post;
            document.getElementById('cfg-base-electro').value = cfg.base_electro;
            document.getElementById('cfg-m2-hogar').value = cfg.m2_hogar;
            document.getElementById('cfg-m2-oficina').value = cfg.m2_oficina;
            document.getElementById('cfg-m2-post').value = cfg.m2_post;
            document.getElementById('cfg-extra-personal').value = cfg.extra_personal;
        }
    },

    // Actualiza los textos del Dropdown de Servicios con los precios de la BD
    updateServiciosDropdown() {
        const select = document.getElementById('cot-servicio');
        if (!select) return;
        const cfg = AppState.configuracion;
        
        Array.from(select.options).forEach(opt => {
            if(opt.value === 'hogar') opt.text = `Limpieza de Hogar Profunda (Base ${Utils.formatCLP(cfg.base_hogar)})`;
            if(opt.value === 'oficina') opt.text = `Limpieza de Oficinas (Base ${Utils.formatCLP(cfg.base_oficina)})`;
            if(opt.value === 'post') opt.text = `Limpieza Post-Construcción (Base ${Utils.formatCLP(cfg.base_post)})`;
            if(opt.value === 'electro') opt.text = `Hornos / Electrodomésticos (Fijo ${Utils.formatCLP(cfg.base_electro)})`;
        });
    }
};

// ==============================================================
// 7. FIREBASE DB CONTROLLER (Conexión Base de Datos)
// ==============================================================
window.DB = {
    initDataListeners() {
        // Escucha Configuración Dinámica (Precios)
        onSnapshot(doc(db, 'configuracion', 'precios'), (docSnap) => {
            if (docSnap.exists()) {
                AppState.configuracion = { ...AppState.configuracion, ...docSnap.data() };
            }
            Views.renderConfiguracion(); 
            Views.updateServiciosDropdown(); 
            Calculator.calculate(); 
        }, err => console.log("Info: No se pudo cargar doc configuración o no existe aún.", err));

        // Escucha Colección de Usuarios (Módulo Colaboradores)
        onSnapshot(query(collection(db, 'usuarios'), orderBy('creadoEn', 'desc')), snap => {
            AppState.usuarios = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            if(AppState.view === 'colaboradores') Views.renderColaboradores();
        });

        // Escucha Colección de Cotizaciones
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

        // Escucha Colección de Clientes
        onSnapshot(query(collection(db, 'clientes'), orderBy('creadoEn', 'desc')), snap => {
            AppState.clientes = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            Views.renderClientes();
            Views.renderDashboard();
        });

        // Escucha Colección de Citas
        onSnapshot(collection(db, 'citas'), snap => {
            AppState.citas = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            Views.renderDashboard();
        });
    },

    // Crea un perfil en la DB de permisos (RBAC) para el colaborador
    async saveColaborador(e) {
        e.preventDefault();
        
        const nombre = document.getElementById('colab-nombre').value.trim();
        const correo = document.getElementById('colab-correo').value.trim().toLowerCase();
        const rol = document.getElementById('colab-rol').value;
        const pass = document.getElementById('colab-pass').value;

        // Validación para evitar guardar campos vacíos
        if(!nombre || !correo || !pass) {
            UI.showToast('Por favor, completa todos los campos obligatorios', 'error');
            return;
        }

        const btn = document.getElementById('btn-save-colaborador');
        btn.innerHTML = '<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Creando...';
        btn.disabled = true;

        try {
            await addDoc(collection(db, 'usuarios'), {
                nombre,
                email: correo,
                rol,
                estado: 'activo',
                creadoEn: serverTimestamp()
            });
            
            UI.closeModal('modal-colaborador');
            UI.showToast('Colaborador registrado exitosamente en la BD');
        } catch (error) {
            console.error(error);
            UI.showToast('Error al crear colaborador', 'error');
        } finally {
            btn.innerHTML = 'Crear Cuenta';
            btn.disabled = false;
        }
    },

    // Activa o Desactiva acceso de colaboradores al sistema
    async toggleEstadoColaborador(id, estadoActual) {
        const nuevoEstado = estadoActual === 'activo' ? 'bloqueado' : 'activo';
        const msg = nuevoEstado === 'bloqueado' ? '¿Bloquear el acceso de este usuario al CRM?' : '¿Reactivar el acceso de este usuario?';
        
        if(confirm(msg)) {
            try {
                await updateDoc(doc(db, 'usuarios', id), { estado: nuevoEstado });
                UI.showToast(`Acceso del usuario ${nuevoEstado}`);
            } catch(e) {
                UI.showToast('Error al actualizar estado', 'error');
            }
        }
    },

    // Guarda las configuraciones de tarifas dinámicas
    async saveConfiguracion() {
        try {
            const btn = document.getElementById('btn-save-config');
            if(!btn) return;
            btn.innerHTML = '<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Guardando...';
            
            const dataConfig = {
                base_hogar: parseInt(document.getElementById('cfg-base-hogar').value) || 0,
                base_oficina: parseInt(document.getElementById('cfg-base-oficina').value) || 0,
                base_post: parseInt(document.getElementById('cfg-base-post').value) || 0,
                base_electro: parseInt(document.getElementById('cfg-base-electro').value) || 0,
                m2_hogar: parseInt(document.getElementById('cfg-m2-hogar').value) || 0,
                m2_oficina: parseInt(document.getElementById('cfg-m2-oficina').value) || 0,
                m2_post: parseInt(document.getElementById('cfg-m2-post').value) || 0,
                extra_personal: parseInt(document.getElementById('cfg-extra-personal').value) || 0,
                actualizadoEn: serverTimestamp()
            };

            await setDoc(doc(db, 'configuracion', 'precios'), dataConfig, { merge: true });
            
            UI.showToast('Precios y tarifas actualizadas con éxito');
            btn.innerHTML = '<i data-lucide="save" class="w-4 h-4"></i> Guardar Configuración';
            if(window.lucide) lucide.createIcons();
            
        } catch (error) {
            console.error("Error Guardando Configuración: ", error);
            UI.showToast('Error al guardar las tarifas', 'error');
            const btn = document.getElementById('btn-save-config');
            if(btn) btn.innerHTML = '<i data-lucide="save" class="w-4 h-4"></i> Guardar Configuración';
        }
    },

    // Guardado de clientes
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

    // Guardado y actualización de cotizaciones
    async saveCotizacionDraft(e) {
        e.preventDefault();
        const id = document.getElementById('cot-id').value;
        const total = parseInt(document.getElementById('cot-valor-total').value) || 0;
        
        const inputSub = document.getElementById('cot-subtotal-input');
        const subtotal = inputSub ? (parseInt(inputSub.value) || 0) : Math.round(total / 1.19);

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

    // Aprobación de cotizaciones para Calendario
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

    // Rechazo de cotizaciones (Obliga a justificar motivo)
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

    // Eliminar Cliente
    async deleteCliente(id) { 
        if(confirm('¿Eliminar cliente permanentemente?')) { 
            try { await deleteDoc(doc(db, 'clientes', id)); UI.showToast('Eliminado', 'info'); } 
            catch(e) { UI.showToast('Error al eliminar', 'error'); }
        } 
    },

    // Eliminar Cotización
    async deleteCotizacion(id) { 
        if(confirm('¿Eliminar cotización permanentemente?')) { 
            try { await deleteDoc(doc(db, 'cotizaciones', id)); UI.showToast('Eliminado', 'info'); } 
            catch(e) { UI.showToast('Error al eliminar', 'error'); }
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
    
    // Filtros
    document.getElementById('filter-clientes')?.addEventListener('input', (e) => { AppState.filtros.clientes = e.target.value.toLowerCase(); Views.renderClientes(); });
    document.getElementById('filter-cotizaciones')?.addEventListener('input', (e) => { AppState.filtros.cotizaciones = e.target.value.toLowerCase(); Views.renderCotizaciones(); });

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

    // Binding Modales Principales
    document.getElementById('btn-save-cliente')?.addEventListener('click', DB.saveCliente);
    document.getElementById('btn-save-draft')?.addEventListener('click', DB.saveCotizacionDraft);
    document.getElementById('btn-approve-cotizacion')?.addEventListener('click', DB.approveCotizacion);
    document.getElementById('btn-reject-cotizacion')?.addEventListener('click', DB.rejectCotizacion);
    
    // Binding Configuración Tarifas y Creación de Usuarios
    document.getElementById('btn-save-config')?.addEventListener('click', () => { DB.saveConfiguracion(); });
    document.getElementById('btn-save-colaborador')?.addEventListener('click', DB.saveColaborador);

    // Binding Generar PDF
    document.getElementById('btn-export-pdf')?.addEventListener('click', (e) => { e.preventDefault(); Controllers.exportarPDF(); });

    // Binding Refrescar Vista
    document.getElementById('btn-refresh')?.addEventListener('click', function() {
        if(this.disabled) return;
        this.disabled = true; document.getElementById('refresh-icon').classList.add('animate-spin'); UI.toggleSkeleton(true);
        setTimeout(() => { Views.renderDashboard(); Views.renderClientes(); Views.renderCotizaciones(); UI.toggleSkeleton(false); document.getElementById('refresh-icon').classList.remove('animate-spin'); this.disabled = false; UI.showToast('Dashboard sincronizado', 'success'); }, 800);
    });

    // CIERRE DE SESIÓN SEGURO FIREBASE
    const handleLogout = async (e) => {
        e.preventDefault();
        if(confirm('¿Estás seguro de cerrar sesión?')) {
            try {
                await signOut(auth); // Destruye el token de sesión real de Firebase
                window.location.replace('login.html'); // Previene acceso por historial de navegación
            } catch (error) {
                UI.showToast('Error al cerrar sesión', 'error');
            }
        }
    };
    
    document.getElementById('btn-logout-header')?.addEventListener('click', handleLogout);
    document.getElementById('btn-logout-sidebar')?.addEventListener('click', handleLogout);
}

// ==============================================================
// 9. APP INIT (Control de Sesión y RBAC Múltiple)
// ==============================================================
document.addEventListener('DOMContentLoaded', () => {
    onAuthStateChanged(auth, async (user) => {
        if (!user) { 
            // Expulsión si no existe sesión válida
            window.location.replace('login.html'); 
        } else {
            AppState.user.email = user.email;
            
            try {
                // LECTURA DE ROL (RBAC) desde Firestore
                const q = query(collection(db, 'usuarios'), where('email', '==', user.email.toLowerCase()));
                const snap = await getDocs(q);
                
                if (!snap.empty) {
                    const userData = snap.docs[0].data();
                    AppState.user.role = userData.rol;
                    AppState.user.name = userData.nombre;
                    
                    if (userData.estado === 'bloqueado') {
                        alert('Tu acceso al CRM ha sido bloqueado por un administrador.');
                        await signOut(auth);
                        window.location.replace('login.html');
                        return;
                    }
                } else {
                    // Fallback de seguridad: Si no hay usuario registrado en la tabla, asume administrador 
                    // (Útil para la primera configuración del superusuario).
                    AppState.user.role = 'admin'; 
                    AppState.user.name = user.email.split('@')[0].toUpperCase();
                }

                // Inyección Visual del nombre y rol
                document.getElementById('admin-name').textContent = AppState.user.name;
                document.getElementById('admin-role').textContent = AppState.user.role === 'admin' ? 'Administrador' : 'Colaborador';
                
                // APLICAR RESTRICCIONES VISUALES (RBAC)
                if (AppState.user.role !== 'admin') {
                    // Ocultar Menú Lateral
                    document.getElementById('nav-reportes')?.classList.add('hidden');
                    document.getElementById('nav-ajustes')?.classList.add('hidden');
                    document.getElementById('nav-colaboradores')?.classList.add('hidden');
                    
                    // Ocultar Botones de Configuración/Perfil en el Dropdown Superior
                    document.querySelectorAll('[data-view-target="ajustes"]').forEach(btn => btn.classList.add('hidden'));
                }
                
                const dateOpts = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
                document.getElementById('header-date').textContent = new Date().toLocaleDateString('es-ES', dateOpts);
                
                Calculator.init(); 
                setupEventListeners(); 
                DB.initDataListeners(); 
                Views.navigate('panel');

            } catch (error) {
                console.error("Error validando rol:", error);
            }
        }
    });
});