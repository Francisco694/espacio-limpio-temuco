/**
 * js/main.js — Espacio Limpio Ltda.
 * Lógica de la Landing Page y Modal de Cotización (B2B / Corporativo)
 */
import { db } from './db-config.js';
import {
    collection,
    addDoc,
    serverTimestamp,
    query,
    where,
    getDocs
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

// Referencias al DOM (Globales)
const navbar = document.getElementById('navbar');
const modal = document.getElementById('modalCotizar');
const formContent = document.getElementById('modalFormContent');
const successMessage = document.getElementById('success-message');
const form = document.getElementById('cotizador-form');
const btnSubmit = document.getElementById('btn-submit');
const formError = document.getElementById('form-error');

// Control del Scroll del Navbar
function toggleNavbarScroll() {
    if (window.scrollY > 30) {
        navbar.classList.add('scrolled');
    } else {
        navbar.classList.remove('scrolled');
    }
}

// Control del Modal de Cotización exportado a global
window.toggleModal = function() {
    modal.classList.toggle('hidden');
    
    // Si se está cerrando el modal, resetear su estado
    if (modal.classList.contains('hidden')) {
        setTimeout(() => {
            if(formContent) formContent.classList.remove('hidden');
            if(successMessage) successMessage.classList.add('hidden');
            if(form) form.reset();
            if(formError) formError.classList.add('hidden');
            if(btnSubmit) {
                btnSubmit.disabled = false;
                btnSubmit.innerHTML = '<span>Enviar Solicitud</span>';
            }
            
            // Reiniciar el select de horas
            const selectHora = document.getElementById('hora');
            if(selectHora) {
                selectHora.innerHTML = '<option value="">Selecciona una fecha primero</option>';
                selectHora.disabled = true;
            }
        }, 300);
    }
};

// Limpiar estilos de error visuales
function limpiarErrores() {
    formError.classList.add('hidden');
    formError.textContent = '';
    const inputs = form.querySelectorAll('input, textarea, select');
    inputs.forEach(input => {
        input.classList.remove('border-red-500', 'focus:ring-red-500');
    });
}

// Generador de bloques de horario según el día de la semana
function getHorariosPorDia(fechaStr) {
    // Formato local para no perder días por UTC
    const [yyyy, mm, dd] = fechaStr.split('-');
    const d = new Date(yyyy, mm - 1, dd);
    const dia = d.getDay(); // 0 = Dom, 1 = Lun, ..., 6 = Sab
    
    let slots = [];
    if (dia >= 1 && dia <= 5) {
        // Lunes a Viernes 09:30 a 17:30
        slots = ['09:30', '10:00', '10:30', '11:00', '11:30', '12:00', '12:30', '13:00', '13:30', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00', '17:30'];
    } else if (dia === 6) {
        // Sabado 09:30 a 13:00
        slots = ['09:30', '10:00', '10:30', '11:00', '11:30', '12:00', '12:30', '13:00'];
    }
    return slots;
}

// Consulta a Firebase para bloquear horas ya tomadas
async function cargarHorasDisponibles() {
    const inputFecha = document.getElementById('fecha');
    const selectHora = document.getElementById('hora');
    const fechaStr = inputFecha.value;

    selectHora.innerHTML = '<option value="">Cargando disponibilidad...</option>';
    selectHora.disabled = true;

    if (!fechaStr) {
        selectHora.innerHTML = '<option value="">Selecciona una fecha primero</option>';
        return;
    }

    // Validar que la fecha no sea en el pasado
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

    if (fechaElegida.getDay() === 0) { // 0 es Domingo
        formError.textContent = 'No atendemos los días domingo. Por favor selecciona otro día.';
        formError.classList.remove('hidden');
        selectHora.innerHTML = '<option value="">Día no disponible</option>';
        return;
    }

    limpiarErrores();
    const slots = getHorariosPorDia(fechaStr);

    try {
        // Consultar a Firestore por citas existentes en esa fecha
        const q = query(collection(db, 'cotizaciones'), where('fecha', '==', fechaStr));
        const querySnapshot = await getDocs(q);
        const horasOcupadas = [];
        
        querySnapshot.forEach((doc) => {
            if (doc.data().hora) {
                horasOcupadas.push(doc.data().hora);
            }
        });

        // Filtrar quitando las horas que ya están en Firebase
        const horasDisponibles = slots.filter(hora => !horasOcupadas.includes(hora));

        // Actualizar el Dropdown (Select)
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
        console.error("Error al consultar horas disponibles:", error);
        selectHora.innerHTML = '<option value="">Error al cargar horas</option>';
    }
}

// Validar formulario antes de enviar
function validarFormulario() {
    limpiarErrores();
    let esValido = true;
    
    const nombre = document.getElementById('nombre');
    const rut = document.getElementById('rut');
    const correo = document.getElementById('correo');
    const telefono = document.getElementById('telefono');
    const fecha = document.getElementById('fecha');
    const hora = document.getElementById('hora');
    const descripcion = document.getElementById('descripcion');
    
    // Validar tipo de cliente (radio)
    const tipoClienteSeleccionado = document.querySelector('input[name="tipoCliente"]:checked');

    if (!nombre.value.trim() || !rut.value.trim() || !correo.value.trim() || !telefono.value.trim() || !fecha.value || !hora.value || !descripcion.value.trim() || !tipoClienteSeleccionado) {
        formError.textContent = 'Por favor, completa todos los campos y selecciona una hora disponible.';
        formError.classList.remove('hidden');
        esValido = false;
    }

    // Validar que la fecha no sea en el pasado
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

// Manejar el envío del formulario a Firebase
async function handleFormSubmit(e) {
    e.preventDefault();
    
    if (!validarFormulario()) return;

    // Obtener valores
    const cotizacion = {
        nombre: document.getElementById('nombre').value.trim(),
        rut: document.getElementById('rut').value.trim(),
        tipoCliente: document.querySelector('input[name="tipoCliente"]:checked').value,
        correo: document.getElementById('correo').value.trim(),
        telefono: document.getElementById('telefono').value.trim(),
        fecha: document.getElementById('fecha').value,
        hora: document.getElementById('hora').value,
        descripcion: document.getElementById('descripcion').value.trim(),
        estadoCRM: 'Pendiente de Revisión',
        creadoEn: serverTimestamp(),
        fuente: 'Modal Web'
    };

    // Estado de carga
    btnSubmit.disabled = true;
    btnSubmit.innerHTML = '<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Procesando...';
    if (window.lucide) window.lucide.createIcons();

    try {
        // Guardar en Firestore
        const docRef = await addDoc(collection(db, 'cotizaciones'), cotizacion);
        console.log(`[CRM] Nueva solicitud registrada: ${docRef.id}`);

        // Ocultar formulario y mostrar éxito
        formContent.classList.add('hidden');
        successMessage.classList.remove('hidden');
        
    } catch (error) {
        console.error('[Firebase Error]', error);
        formError.textContent = `Hubo un error al procesar tu solicitud. Intenta nuevamente.`;
        formError.classList.remove('hidden');
        
        // Restaurar botón
        btnSubmit.disabled = false;
        btnSubmit.innerHTML = '<span>Enviar Solicitud</span>';
    }
}
        window.toggleModal = function() {
            const modal = document.getElementById('modalCotizar');
            const formContent = document.getElementById('modalFormContent');
            const successMsg = document.getElementById('success-message');
            const form = document.getElementById('cotizador-form');
            const btnSubmit = document.getElementById('btn-submit');
            const formError = document.getElementById('form-error');
            const selectHora = document.getElementById('hora');

            modal.classList.toggle('hidden');
            
            // Resetear el estado del modal al cerrar
            if(modal.classList.contains('hidden')) {
                setTimeout(() => {
                    if(formContent) formContent.classList.remove('hidden');
                    if(successMsg) successMsg.classList.add('hidden');
                    if(form) form.reset();
                    if(formError) formError.classList.add('hidden');
                    if(btnSubmit) {
                        btnSubmit.disabled = false;
                        btnSubmit.innerText = 'Enviar Solicitud';
                    }
                    if(selectHora) {
                        selectHora.innerHTML = '<option value="">Selecciona fecha</option>';
                        selectHora.disabled = true;
                    }
                }, 300);
            }
        }
// Inicializar funciones y Event Listeners al cargar el DOM
function init() {
    // Scroll event para el Navbar
    window.addEventListener('scroll', toggleNavbarScroll, { passive: true });
    toggleNavbarScroll(); // Comprobar estado inicial
    
    // Configurar fecha mínima al día de hoy localmente e instanciar el revisor de horas
    const inputFecha = document.getElementById('fecha');
    if (inputFecha) {
        const tzoffset = (new Date()).getTimezoneOffset() * 60000;
        const localISOTime = (new Date(Date.now() - tzoffset)).toISOString().split('T')[0];
        
        inputFecha.setAttribute('min', localISOTime);
        inputFecha.addEventListener('change', cargarHorasDisponibles); // Cuando cambia la fecha, carga las horas
    }

    // Asignar submit al nuevo formulario
    if (form) {
        form.addEventListener('submit', handleFormSubmit);
    }

    // Ocultar mensaje de error cuando el usuario empiece a escribir
    const inputs = document.querySelectorAll('#cotizador-form input, #cotizador-form textarea, #cotizador-form select');
    inputs.forEach(input => {
        input.addEventListener('input', () => {
            if (!formError.classList.contains('hidden')) {
                formError.classList.add('hidden');
            }
        });
    });

    console.log('[Espacio Limpio] Landing iniciada. Modal B2B y Calendario Activos.');
}

// Arrancar cuando el documento esté listo
document.addEventListener('DOMContentLoaded', init);