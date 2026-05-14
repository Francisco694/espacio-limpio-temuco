/**
 * js/login.js — Espacio Limpio Ltda.
 * Lógica de Autenticación para el Panel de Administración
 */

document.addEventListener('DOMContentLoaded', () => {
    // 1. Inicializar iconos de Lucide
    if (window.lucide) {
        lucide.createIcons();
    }

    // 2. Referencias al DOM
    const loginForm = document.getElementById('login-form');
    const btnLogin = document.getElementById('btn-login');
    const btnText = document.getElementById('btn-text');
    const btnIcon = document.getElementById('btn-icon');
    const btnSpinner = document.getElementById('btn-spinner');
    const errorBox = document.getElementById('login-error');
    const inputs = document.querySelectorAll('input');

    // 3. Manejo del envío del formulario
    if (loginForm) {
        loginForm.addEventListener('submit', (e) => {
            e.preventDefault(); // Evitar recarga de la página
            
            const email = document.getElementById('email').value.trim();
            const password = document.getElementById('password').value.trim();

            // Limpiar errores previos
            errorBox.classList.add('hidden');

            // Validar campos vacíos
            if(!email || !password) {
                errorBox.querySelector('span').textContent = 'Por favor, completa todos los campos.';
                errorBox.classList.remove('hidden');
                return;
            }

            // Cambiar interfaz a estado de "Cargando"
            btnLogin.disabled = true;
            btnText.textContent = 'Autenticando...';
            btnIcon.classList.add('hidden');
            btnSpinner.classList.remove('hidden');

            /* * SIMULACIÓN DE LOGIN 
             * Reemplaza este bloque con la lógica real de Firebase Auth:
             * import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
             * signInWithEmailAndPassword(auth, email, password)...
             */
            setTimeout(() => {
                // Simulación exitosa, redirigir al Dashboard
                window.location.href = 'dashboard.html';
            }, 1500);
        });
    }

    // 4. Limpiar error al escribir en cualquier input
    inputs.forEach(input => {
        input.addEventListener('input', () => {
            if (!errorBox.classList.contains('hidden')) {
                errorBox.classList.add('hidden');
            }
        });
    });
});