/**
 * js/main.js — Espacio Limpio Ltda.
 * Arquitectura Backend/B2B (Firebase) - Estrictamente Lógica de Negocio.
 */

import { db } from './db-config.js';
import { collection, addDoc, serverTimestamp, query, where, getDocs } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

// ==========================================
// 1. LÓGICA DEL MODAL DE COTIZACIONES (EXISTENTE)
// ==========================================
const form = document.getElementById('cotizador-form');
const btnSubmit = document.getElementById('btn-submit');
const formError = document.getElementById('form-error');
const formContent = document.getElementById('modalFormContent');
const successMessage = document.getElementById('success-message');

function limpiarErrores() {
    if(!formError) return;
    formError.classList.add('hidden');
    formError.textContent = '';
}

function getHorariosPorDia(fechaStr) {
    const [yyyy, mm, dd] = fechaStr.split('-');
    const d = new Date(yyyy, mm - 1, dd);
    const dia = d.getDay(); 
    
    let slots = [];
    if (dia >= 1 && dia <= 5) {
        slots = ['09:30', '10:00', '10:30', '11:00', '11:30', '12:00', '12:30', '13:00', '13:30', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00', '17:30'];
    } else if (dia === 6) {
        slots = ['09:30', '10:00', '10:30', '11:00', '11:30', '12:00', '12:30', '13:00'];
    }
    return slots;
}

async function cargarHorasDisponibles() {
    const inputFecha = document.getElementById('fecha');
    const selectHora = document.getElementById('hora');
    
    if(!inputFecha || !selectHora) return;
    const fechaStr = inputFecha.value;

    selectHora.innerHTML = '<option value="">Cargando disponibilidad...</option>';
    selectHora.disabled = true;

    if (!fechaStr) {
        selectHora.innerHTML = '<option value="">Selecciona una fecha primero</option>';
        return;
    }

    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const [yyyy, mm, dd] = fechaStr.split('-');
    const fechaElegida = new Date(yyyy, mm - 1, dd);

    if (fechaElegida < hoy) {
        formError.textContent = 'La fecha sugerida no puede estar en el pasado.';
        formError.classList.remove('hidden');
        selectHora.innerHTML = '<option value="">Fecha inválida</option>';
        return;
    }

    if (fechaElegida.getDay() === 0) { 
        formError.textContent = 'No atendemos los días domingo. Por favor selecciona otro día.';
        formError.classList.remove('hidden');
        selectHora.innerHTML = '<option value="">Día no disponible</option>';
        return;
    }

    limpiarErrores();
    const slots = getHorariosPorDia(fechaStr);

    try {
        const q = query(collection(db, 'cotizaciones'), where('fecha', '==', fechaStr));
        const querySnapshot = await getDocs(q);
        const horasOcupadas = [];
        
        querySnapshot.forEach((doc) => {
            if (doc.data().hora) horasOcupadas.push(doc.data().hora);
        });

        const horasDisponibles = slots.filter(hora => !horasOcupadas.includes(hora));

        selectHora.innerHTML = '<option value="">Seleccione una hora</option>';
        if (horasDisponibles.length === 0) {
            selectHora.innerHTML = '<option value="">Sin horas disponibles este día</option>';
        } else {
            horasDisponibles.forEach(h => {
                selectHora.innerHTML += `<option value="${h}">${h}</option>`;
            });
            selectHora.disabled = false;
        }
    } catch (error) {
        console.error("Error al consultar disponibilidad en Base de Datos:", error);
        selectHora.innerHTML = '<option value="">Error al cargar horas</option>';
    }
}

function validarFormulario() {
    limpiarErrores();
    let esValido = true;
    
    const nombre = document.getElementById('nombre');
    const rut = document.getElementById('rut');
    const correo = document.getElementById('correo');
    const telefono = document.getElementById('telefono');
    const direccion = document.getElementById('direccion'); // NUEVO CAMPO
    const fecha = document.getElementById('fecha');
    const hora = document.getElementById('hora');
    const descripcion = document.getElementById('descripcion');
    const tipoClienteSeleccionado = document.querySelector('input[name="tipoCliente"]:checked');

    // Se agrega !direccion.value.trim() a la validación
    if (!nombre.value.trim() || !rut.value.trim() || !correo.value.trim() || !telefono.value.trim() || !direccion.value.trim() || !fecha.value || !hora.value || !descripcion.value.trim() || !tipoClienteSeleccionado) {
        formError.textContent = 'Por favor, completa todos los campos y selecciona una hora disponible.';
        formError.classList.remove('hidden');
        esValido = false;
    }

    if (fecha.value) {
        const hoy = new Date();
        hoy.setHours(0, 0, 0, 0);
        const [yyyy, mm, dd] = fecha.value.split('-');
        const fechaElegida = new Date(yyyy, mm - 1, dd);
        
        if (fechaElegida < hoy) {
            formError.textContent = 'La fecha sugerida no puede estar en el pasado.';
            formError.classList.remove('hidden');
            esValido = false;
        }
    }
    return esValido;
}

async function handleFormSubmit(e) {
    e.preventDefault();
    
    if (!validarFormulario()) return;

    // Se agrega 'direccion' al payload que viaja a Firestore
    const cotizacion = {
        nombre: document.getElementById('nombre').value.trim(),
        rut: document.getElementById('rut').value.trim(),
        tipoCliente: document.querySelector('input[name="tipoCliente"]:checked').value,
        correo: document.getElementById('correo').value.trim(),
        telefono: document.getElementById('telefono').value.trim(),
        direccion: document.getElementById('direccion').value.trim(), // NUEVO CAMPO
        fecha: document.getElementById('fecha').value,
        hora: document.getElementById('hora').value,
        descripcion: document.getElementById('descripcion').value.trim(),
        estadoCRM: 'Pendiente de Revisión',
        creadoEn: serverTimestamp(),
        fuente: 'Modal Web'
    };

    btnSubmit.disabled = true;
    btnSubmit.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Procesando...';

    try {
        const docRef = await addDoc(collection(db, 'cotizaciones'), cotizacion);
        console.log(`[CRM] Solicitud Web Procesada: ${docRef.id}`);
        
        if(formContent) formContent.classList.add('hidden');
        if(successMessage) successMessage.classList.remove('hidden');
        
    } catch (error) {
        console.error('[Firebase Error]', error);
        formError.textContent = `Hubo un error al procesar tu solicitud. Intenta nuevamente.`;
        formError.classList.remove('hidden');
        
        btnSubmit.disabled = false;
        btnSubmit.innerHTML = '<span>Enviar Solicitud</span>';
    }
}

// ==========================================
// 2. LÓGICA DEL FORMULARIO DE CONTACTO RÁPIDO (NUEVO)
// ==========================================
async function handleContactoSubmit(e) {
    e.preventDefault();
    
    const contactoForm = document.getElementById('contacto-form');
    const btnContactoSubmit = document.getElementById('btn-contacto-submit');
    const contactoMsg = document.getElementById('contacto-msg');
    
    // 1. Validar campos
    const nombre = document.getElementById('contacto-nombre').value.trim();
    const correo = document.getElementById('contacto-correo').value.trim();
    const motivo = document.getElementById('contacto-motivo').value.trim();
    const mensaje = document.getElementById('contacto-mensaje').value.trim();

    if (!nombre || !correo || !motivo || !mensaje) {
        contactoMsg.textContent = 'Por favor, complete todos los campos obligatorios.';
        contactoMsg.className = 'text-center text-sm text-red-500 font-bold bg-red-50 p-3 rounded-lg';
        contactoMsg.classList.remove('hidden');
        return;
    }

    // 2. Construir Payload
    const consulta = {
        nombre: nombre,
        correo: correo,
        motivo: motivo,
        mensaje: mensaje,
        estado: "Nueva",
        fuente: "Formulario Web",
        creadoEn: serverTimestamp()
    };

    // 3. Mostrar estado de carga
    btnContactoSubmit.disabled = true;
    btnContactoSubmit.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Enviando...';
    contactoMsg.classList.add('hidden');

    // 4. Integración Firebase con Try/Catch
    try {
        const docRef = await addDoc(collection(db, 'consultas'), consulta);
        console.log(`[Firebase] Nueva consulta registrada correctamente con ID: ${docRef.id}`);

        // 5. Mostrar Mensaje de Éxito
        contactoMsg.innerHTML = '<i class="fas fa-check-circle mr-1"></i> ¡Consulta enviada correctamente! Nos contactaremos con usted pronto.';
        contactoMsg.className = 'text-center text-sm text-green-600 font-bold bg-green-50 p-3 rounded-lg';
        contactoMsg.classList.remove('hidden');

        // Limpiar formulario
        contactoForm.reset();

    } catch (error) {
        // Manejar errores de Firestore
        console.error('[Firebase Error en Consultas]', error);
        contactoMsg.innerHTML = '<i class="fas fa-exclamation-circle mr-1"></i> Hubo un error al enviar su consulta. Intente nuevamente.';
        contactoMsg.className = 'text-center text-sm text-red-500 font-bold bg-red-50 p-3 rounded-lg';
        contactoMsg.classList.remove('hidden');
    } finally {
        // Restaurar estado del botón
        btnContactoSubmit.disabled = false;
        btnContactoSubmit.innerHTML = 'Enviar Consulta';
    }
}


// ==========================================
// 3. INICIALIZADOR GLOBAL DE EVENT LISTENERS
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    // 3.1 Listeners del Cotizador
    const inputFecha = document.getElementById('fecha');
    if (inputFecha) {
        const tzoffset = (new Date()).getTimezoneOffset() * 60000;
        const localISOTime = (new Date(Date.now() - tzoffset)).toISOString().split('T')[0];
        
        inputFecha.setAttribute('min', localISOTime);
        inputFecha.addEventListener('change', cargarHorasDisponibles);
    }

    if (form) {
        form.addEventListener('submit', handleFormSubmit);
    }

    const inputsCotizador = document.querySelectorAll('#cotizador-form input, #cotizador-form textarea, #cotizador-form select');
    inputsCotizador.forEach(input => {
        input.addEventListener('input', () => {
            if (formError && !formError.classList.contains('hidden')) {
                formError.classList.add('hidden');
            }
        });
    });

    // 3.2 Listeners del Formulario de Contacto (NUEVO)
    const contactoForm = document.getElementById('contacto-form');
    if (contactoForm) {
        contactoForm.addEventListener('submit', handleContactoSubmit);
    }

    // Ocultar error de Contacto al escribir
    const inputsContacto = document.querySelectorAll('#contacto-form input, #contacto-form textarea');
    const contactoMsg = document.getElementById('contacto-msg');
    inputsContacto.forEach(input => {
        input.addEventListener('input', () => {
            if (contactoMsg && !contactoMsg.classList.contains('hidden') && contactoMsg.classList.contains('text-red-500')) {
                contactoMsg.classList.add('hidden');
            }
        });
    });
});