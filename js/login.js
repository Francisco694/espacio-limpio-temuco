/**
 * js/login.js — Espacio Limpio Ltda.
 * Lógica de Autenticación para el Panel de Administración
 */

// 1. IMPORTACIONES DE FIREBASE (Versión 10.12.0)
import { app, db} from './db-config.js';
import {
    getAuth,
    signInWithEmailAndPassword,
    sendPasswordResetEmail,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
    collection,
    getDocs,
    limit,
    query,
    where
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// Inicializamos Auth pasando la instancia explícita de app
const auth = getAuth(app);
const RESET_SUCCESS_MESSAGE = 'Si existe una cuenta asociada a este correo, recibirá instrucciones para recuperar su contraseña.';

const getPasswordResetActionSettings = () => ({
    url: `${window.location.origin}/reset-password.html`,
    handleCodeInApp: false
});

document.addEventListener('DOMContentLoaded', () => {
    // 1. Inicializar iconos de Lucide
    if (window.lucide) {
        lucide.createIcons();
    }

    // 2. Proteger la vista de Login (Si ya hay sesión, ir a dashboard)
    onAuthStateChanged(auth, (user) => {
        if (user) {
            window.location.replace('dashboard.html');
        }
    });

    // 3. Referencias al DOM (Login)
    const loginForm = document.getElementById('login-form');
    const btnLogin = document.getElementById('btn-login');
    const btnText = document.getElementById('btn-text');
    const btnIcon = document.getElementById('btn-icon');
    const btnSpinner = document.getElementById('btn-spinner');
    const errorBox = document.getElementById('login-error');
    const inputs = document.querySelectorAll('input');

    // 4. Referencias al DOM (Modal Reset)
    const btnForgotPassword = document.getElementById('btn-forgot-password');
    const modalReset = document.getElementById('modal-reset');
    const bgModalReset = document.getElementById('bg-modal-reset');
    const btnCloseReset = document.getElementById('btn-close-reset');
    const resetForm = document.getElementById('reset-form');
    const resetEmailInput = document.getElementById('reset-email');
    const btnSubmitReset = document.getElementById('btn-submit-reset');
    const resetBtnText = document.getElementById('reset-btn-text');
    const resetSpinner = document.getElementById('reset-spinner');
    const resetMsg = document.getElementById('reset-msg');
    const resetMsgText = document.getElementById('reset-msg-text');

    // Diccionario de errores amigables
    const getFriendlyErrorMessage = (errorCode) => {
        switch (errorCode) {
            case 'auth/user-not-found':
                return 'No existe una cuenta con este correo.';
            case 'auth/invalid-email':
                return 'El formato del correo electrónico no es válido.';
            case 'auth/invalid-credential':
            case 'auth/wrong-password':
                return 'Credenciales incorrectas. Verifica tu correo y contraseña.';
            case 'auth/too-many-requests':
                return 'Demasiados intentos fallidos. Intenta más tarde.';
            case 'auth/network-request-failed':
                return 'Error de red. Verifica tu conexión a internet.';
            default:
                return 'Ocurrió un error inesperado. Inténtalo nuevamente.';
        }
    };

    // 5. Manejo del envío del formulario de Login
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const email = document.getElementById('email').value.trim();
            const password = document.getElementById('password').value.trim();

            errorBox.classList.add('hidden');

            if(!email || !password) {
                errorBox.querySelector('span').textContent = 'Por favor, completa todos los campos.';
                errorBox.classList.remove('hidden');
                return;
            }

            btnLogin.disabled = true;
            btnText.textContent = 'Autenticando...';
            if(btnIcon) btnIcon.classList.add('hidden');
            if(btnSpinner) btnSpinner.classList.remove('hidden');

            try {
                await signInWithEmailAndPassword(auth, email, password);
                // El redireccionamiento lo manejará onAuthStateChanged, o lo forzamos:
                window.location.replace('dashboard.html');
            } catch (error) {
                console.error("Error de login:", error.code);
                
                errorBox.querySelector('span').textContent = getFriendlyErrorMessage(error.code);
                errorBox.classList.remove('hidden');

                btnLogin.disabled = false;
                btnText.textContent = 'Ingresar al Sistema'; 
                if(btnIcon) btnIcon.classList.remove('hidden');
                if(btnSpinner) btnSpinner.classList.add('hidden');
            }
        });
    }

    // 6. Limpiar error al escribir
    inputs.forEach(input => {
        input.addEventListener('input', () => {
            if (!errorBox.classList.contains('hidden')) {
                errorBox.classList.add('hidden');
            }
        });
    });

    // 7. Lógica del Modal de Recuperación
    const toggleResetModal = () => {
        modalReset.classList.toggle('hidden');
        if(!modalReset.classList.contains('hidden')) {
            resetForm.reset();
            resetMsg.classList.add('hidden');
        }
    };

    if(btnForgotPassword) btnForgotPassword.addEventListener('click', (e) => {
        e.preventDefault();
        toggleResetModal();
    });
    if(btnCloseReset) btnCloseReset.addEventListener('click', toggleResetModal);
    if(bgModalReset) bgModalReset.addEventListener('click', toggleResetModal);

    // 8. Enviar correo de recuperación
    if(resetForm) {
        resetForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const email = resetEmailInput.value.trim();
            resetMsg.classList.add('hidden');

            // Validar regex correo
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if(!email || !emailRegex.test(email)) {
                mostrarMensajeReset('error', 'Por favor, ingresa un correo electrónico válido.');
                return;
            }

            btnSubmitReset.disabled = true;
            resetBtnText.textContent = 'Procesando...';
            resetSpinner.classList.remove('hidden');

            try {
                const normalizedEmail = email.toLowerCase();
                const usuariosRef = collection(db, 'usuarios');
                const userQuery = query(
                    usuariosRef,
                    where('email', '==', normalizedEmail),
                    where('activo', '==', true),
                    limit(1)
                );
                const userSnapshot = await getDocs(userQuery);

                if (!userSnapshot.empty) {
                    await sendPasswordResetEmail(auth, normalizedEmail, getPasswordResetActionSettings());
                }

                mostrarMensajeReset('success', RESET_SUCCESS_MESSAGE);
                resetEmailInput.value = ''; // Limpiar tras éxito
            } catch (error) {
                console.error("Error reset:", error.code);
                mostrarMensajeReset('success', RESET_SUCCESS_MESSAGE);
            } finally {
                btnSubmitReset.disabled = false;
                resetBtnText.textContent = 'Enviar Enlace';
                resetSpinner.classList.add('hidden');
            }
        });
    }

    // Helpers UI para el Modal
    function mostrarMensajeReset(tipo, mensaje) {
        resetMsgText.textContent = mensaje;
        resetMsg.classList.remove('hidden', 'bg-red-50', 'text-red-600', 'border-red-200', 'bg-green-50', 'text-green-600', 'border-green-200');

        if (tipo === 'error') {
            resetMsg.classList.add('bg-red-50', 'text-red-600', 'border', 'border-red-200');
            resetMsg.querySelector('i').setAttribute('data-lucide', 'alert-triangle');
        } else {
            resetMsg.classList.add('bg-green-50', 'text-green-600', 'border', 'border-green-200');
            resetMsg.querySelector('i').setAttribute('data-lucide', 'check-circle');
        }

        if (window.lucide) {
            lucide.createIcons();
        }
    }
});
