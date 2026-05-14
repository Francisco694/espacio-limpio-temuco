/**
 * js/login.js — Espacio Limpio Ltda.
 * Lógica de Autenticación para el Panel de Administración
 */

// 1. IMPORTACIONES DE FIREBASE (Deben ir siempre en la primera línea)
import './db-config.js'; // Importamos tu archivo de configuración para inicializar la conexión
import { getAuth, signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

// Inicializamos el servicio de Autenticación
const auth = getAuth();

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
        // ¡IMPORTANTE! Agregamos "async" aquí para poder esperar la respuesta de Firebase
        loginForm.addEventListener('submit', async (e) => {
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
            if(btnIcon) btnIcon.classList.add('hidden');
            if(btnSpinner) btnSpinner.classList.remove('hidden');

            //CONEXIÓN REAL CON FIREBASE AUTH 
            try {
                // Firebase valida el correo y la contraseña contra tu proyecto
                await signInWithEmailAndPassword(auth, email, password);
                
                // Si la línea de arriba no falla, significa que el login fue exitoso. Redirigimos:
                window.location.href = 'dashboard.html';

            } catch (error) {
                // Si Firebase rechaza la contraseña o no encuentra el correo, cae aquí:
                console.error("Error de login:", error.code, error.message);
                
                // Mostrar mensaje de error rojo al usuario
                errorBox.querySelector('span').textContent = 'Credenciales incorrectas. Acceso denegado.';
                errorBox.classList.remove('hidden');

                // Restaurar el botón para que pueda intentar de nuevo
                btnLogin.disabled = false;
                btnText.textContent = 'Ingresar al sistema'; // Asegúrate de que este sea el texto original de tu botón
                if(btnIcon) btnIcon.classList.remove('hidden');
                if(btnSpinner) btnSpinner.classList.add('hidden');
            }
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