/**
 * js/landing.js — Espacio Limpio Ltda.
 * Lógica exclusivamente visual y UI de la Landing Page.
 * (Completamente desacoplada de la base de datos).
 */

document.addEventListener('DOMContentLoaded', () => {
    // 1. Scroll Reveal Animations
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

    // 2. Navbar Scroll Effect
    const navbar = document.getElementById('navbar');
    const toggleNavbarScroll = () => {
        if (window.scrollY > 20) {
            navbar.classList.add('border-slate-100', 'bg-white/95', 'shadow-sm', 'scrolled');
            navbar.classList.remove('border-transparent', 'bg-white/90');
        } else {
            navbar.classList.remove('border-slate-100', 'bg-white/95', 'shadow-sm', 'scrolled');
            navbar.classList.add('border-transparent', 'bg-white/90');
        }
    };
    
    window.addEventListener('scroll', toggleNavbarScroll, { passive: true });
    toggleNavbarScroll(); 

    // 3. Mobile Menu Toggle
    const btnMenu = document.getElementById('btn-menu');
    const mobileMenu = document.getElementById('mobile-menu');
    
    if (btnMenu && mobileMenu) {
        btnMenu.addEventListener('click', () => {
            mobileMenu.classList.toggle('hidden');
        });
        
        mobileMenu.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => {
                mobileMenu.classList.add('hidden');
            });
        });
    }

    // 4. Previsualización Visual de Archivos (Evidencia)
    const inputEvidencia = document.getElementById('evidencia');
    const filePreview = document.getElementById('file-preview');
    
    if (inputEvidencia && filePreview) {
        inputEvidencia.addEventListener('change', (e) => {
            const files = e.target.files;
            if (files.length > 0) {
                filePreview.innerHTML = `<i class="fas fa-paperclip mr-1"></i> ${files.length} archivo(s) seleccionado(s).`;
                filePreview.classList.add('text-primary');
            } else {
                filePreview.innerHTML = '';
            }
        });
    }
});

// 5. Exposición Global Segura para la apertura del Modal
window.toggleModal = function() {
    const modal = document.getElementById('modalCotizar');
    if (!modal) return;
    
    modal.classList.toggle('hidden');
    
    // Si se está cerrando, restaurar estado UI a cero luego de la transición
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