/**
 * js/main.js — Espacio Limpio Ltda.
 * Lógica combinada de UI (Landing) y Firebase/Cotizaciones.
 */
import { db } from './db-config.js'; // Importamos db (Storage fue eliminado del proyecto)
import {
    collection,
    addDoc,
    serverTimestamp,
    query,
    where,
    getDocs
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

// Endpoint del backend Node.js encargado de subir imágenes a Cloudinary
const CLOUDINARY_UPLOAD_ENDPOINT =
    window.location.hostname === "localhost"
        ? "http://localhost:3000/api/upload"
        : "/api/upload";

// ==========================================
// 1. FUNCIONES GLOBALES (Modales)
// ==========================================
window.toggleModal = function() {
    const modal = document.getElementById('modalCotizar');
    if (!modal) return;
    
    modal.classList.toggle('hidden');
    
    // Resetear al cerrar
    if (modal.classList.contains('hidden')) {
        setTimeout(() => {
            const formContent = document.getElementById('modalFormContent');
            const successMsg = document.getElementById('success-message');
            const form = document.getElementById('cotizador-form');
            const btnSubmit = document.getElementById('btn-submit');
            const formError = document.getElementById('form-error');
            const selectHora = document.getElementById('hora');
            const filePreview = document.getElementById('file-preview');

            if (formContent) formContent.classList.remove('hidden');
            if (successMsg) successMsg.classList.add('hidden');
            if (form) form.reset();
            if (formError) formError.classList.add('hidden');
            if (btnSubmit) {
                btnSubmit.disabled = false;
                btnSubmit.innerHTML = 'Enviar Solicitud'; 
            }
            if (selectHora) {
                selectHora.innerHTML = '<option value="">Selecciona fecha</option>';
                selectHora.disabled = true;
            }
            if (filePreview) filePreview.innerHTML = '';
            
        }, 300);
    }
};

// ==========================================
// 2. LÓGICA DE FIREBASE Y COTIZACIONES
// ==========================================
function limpiarErrores() {
    const formError = document.getElementById('form-error');
    if(formError) {
        formError.classList.add('hidden');
        formError.textContent = '';
    }
    const form = document.getElementById('cotizador-form');
    if(!form) return;
    const inputs = form.querySelectorAll('input, textarea, select');
    inputs.forEach(input => {
        input.classList.remove('border-red-500', 'focus:ring-red-500');
    });
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
    const formError = document.getElementById('form-error');
    
    if(!inputFecha || !selectHora || !formError) return;
    
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
            if (doc.data().hora) {
                horasOcupadas.push(doc.data().hora);
            }
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
        console.error("Error al consultar horas:", error);
        selectHora.innerHTML = '<option value="">Error al cargar horas</option>';
    }
}

function validarFormulario() {
    limpiarErrores();
    let esValido = true;
    const formError = document.getElementById('form-error');
    
    const nombre = document.getElementById('nombre');
    const rut = document.getElementById('rut');
    const correo = document.getElementById('correo');
    const telefono = document.getElementById('telefono');
    const fecha = document.getElementById('fecha');
    const hora = document.getElementById('hora');
    const descripcion = document.getElementById('descripcion');
    
    const tipoClienteSeleccionado = document.querySelector('input[name="tipoCliente"]:checked');

    if (!nombre.value.trim() || !rut.value.trim() || !correo.value.trim() || !telefono.value.trim() || !fecha.value || !hora.value || !descripcion.value.trim() || !tipoClienteSeleccionado) {
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

/**
 * Sube un conjunto de archivos (imágenes) al backend Node.js, el cual las
 * almacena en Cloudinary y devuelve sus datos (url, public_id).
 *
 * - Si no se reciben archivos, devuelve [] sin producir errores ni llamadas de red.
 * - Si el backend o Cloudinary fallan, lanza un error para que quien llame a esta
 *   función (handleFormSubmit) pueda mostrarlo y evitar guardar la cotización.
 * - Devuelve ÚNICAMENTE un array de URLs (string), nunca objetos, File ni Base64.
 */
async function subirImagenesCloudinary(archivos) {
    if (!archivos || archivos.length === 0) {
        return [];
    }

    const formData = new FormData();
    for (let i = 0; i < archivos.length; i++) {
        formData.append('imagenes', archivos[i]);
    }

    const response = await fetch(CLOUDINARY_UPLOAD_ENDPOINT, {
        method: 'POST',
        body: formData
    });

    if (!response.ok) {
        throw new Error(`El servidor de imágenes respondió con estado ${response.status}`);
    }

    const data = await response.json();

    if (!data || data.success !== true || !Array.isArray(data.evidencias)) {
        throw new Error('Respuesta inválida del servidor de imágenes (Cloudinary).');
    }

    // Extraemos únicamente la propiedad "url" de cada evidencia devuelta
    return data.evidencias.map(evidencia => evidencia.url);
}

async function handleFormSubmit(e) {
    e.preventDefault();
    
    if (!validarFormulario()) return;

    const btnSubmit = document.getElementById('btn-submit');
    const formContent = document.getElementById('modalFormContent');
    const successMessage = document.getElementById('success-message');
    const formError = document.getElementById('form-error');

    // 1. VALIDAR PESO DE LOS ARCHIVOS ANTES DE PROCESAR
    const inputEvidencia = document.getElementById('evidencia');
    const archivos = inputEvidencia ? inputEvidencia.files : [];
    const MAX_SIZE_MB = 10;
    const MAX_BYTES = MAX_SIZE_MB * 1024 * 1024;

    if (archivos.length > 0) {
        for (let i = 0; i < archivos.length; i++) {
            if (archivos[i].size > MAX_BYTES) {
                formError.textContent = `El archivo "${archivos[i].name}" supera los ${MAX_SIZE_MB}MB permitidos. Sube archivos más ligeros.`;
                formError.classList.remove('hidden');
                return; // Detener la ejecución
            }
        }
    }

    btnSubmit.disabled = true;
    btnSubmit.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Procesando...';

    try {
        // 2. SUBIR ARCHIVOS A CLOUDINARY (vía backend Node.js) SI EXISTEN
        if (archivos.length > 0) {
            btnSubmit.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Subiendo archivos...';
        }

        const evidenciaUrls = await subirImagenesCloudinary(archivos);

        btnSubmit.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Guardando datos...';

        // 3. CREAR EL OBJETO COTIZACIÓN
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
            fuente: 'Modal Web',
            evidencias: evidenciaUrls // Agregamos el array de URLs
        };

        // 4. GUARDAR EN FIRESTORE
        const docRef = await addDoc(collection(db, 'cotizaciones'), cotizacion);
        console.log(`[CRM] Nueva solicitud registrada: ${docRef.id}`);

        // Ocultar formulario y mostrar éxito
        formContent.classList.add('hidden');
        successMessage.classList.remove('hidden');
        
    } catch (error) {
        console.error('[Firebase Error]', error);
        formError.textContent = `Hubo un error al procesar tu solicitud. Intenta nuevamente.`;
        formError.classList.remove('hidden');
        
        btnSubmit.disabled = false;
        btnSubmit.innerHTML = 'Enviar Solicitud';
    }
}

// ==========================================
// 3. LÓGICA VISUAL Y DOM CONTENT LOADED
// ==========================================
function initUI() {
    // Scroll Reveal Animations
    const reveals = document.querySelectorAll('.reveal');
    const revealOptions = { threshold: 0.1, rootMargin: "0px 0px -50px 0px" };
    
    const revealObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('active');
                observer.unobserve(entry.target);
            }
        });
    }, revealOptions);

    reveals.forEach(reveal => revealObserver.observe(reveal));

    // Navbar Scroll Effect
    const navbar = document.getElementById('navbar');
    if(navbar) {
        window.addEventListener('scroll', () => {
            if (window.scrollY > 20) {
                navbar.classList.add('border-slate-100', 'bg-white/95', 'shadow-sm');
                navbar.classList.remove('border-transparent', 'bg-white/90');
            } else {
                navbar.classList.remove('border-slate-100', 'bg-white/95', 'shadow-sm');
                navbar.classList.add('border-transparent', 'bg-white/90');
            }
        });
    }

    // Menú Móvil
    const btnMenu = document.getElementById('btn-menu');
    const mobileMenu = document.getElementById('mobile-menu');
    
    if (btnMenu && mobileMenu) {
        btnMenu.addEventListener('click', () => mobileMenu.classList.toggle('hidden'));
        mobileMenu.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => mobileMenu.classList.add('hidden'));
        });
    }

    // Vista previa de archivos (Evidencia Cotizador)
    const inputEvidencia = document.getElementById('evidencia');
    const filePreview = document.getElementById('file-preview');
    
    if (inputEvidencia && filePreview) {
        inputEvidencia.addEventListener('change', (e) => {
            const files = e.target.files;
            if (files.length > 0) {
                // Cálculo simple del peso total
                let totalSize = 0;
                for(let i=0; i<files.length; i++) { totalSize += files[i].size; }
                const sizeMB = (totalSize / (1024 * 1024)).toFixed(2);
                
                filePreview.innerHTML = `<i class="fas fa-paperclip mr-1"></i> ${files.length} archivo(s) listos para subir (~${sizeMB} MB).`;
                filePreview.classList.add('text-primary');
            } else {
                filePreview.innerHTML = '';
            }
        });
    }

    // Configurar Formulario Firebase
    const form = document.getElementById('cotizador-form');
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

    // Ocultar mensajes de error al escribir
    if(form) {
        const inputs = form.querySelectorAll('input, textarea, select');
        const formError = document.getElementById('form-error');
        inputs.forEach(input => {
            input.addEventListener('input', () => {
                if (formError && !formError.classList.contains('hidden')) {
                    formError.classList.add('hidden');
                }
            });
        });
    }

    console.log('[Espacio Limpio] Landing iniciada correctamente. Integración con Cloudinary Activa.');
}

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', initUI);