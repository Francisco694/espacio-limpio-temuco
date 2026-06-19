/**
 * js/reset-password.js — Espacio Limpio Ltda.
 * Cambio seguro de contraseña con Firebase Auth.
 */

import { app } from './db-config.js';
import {
    confirmPasswordReset,
    getAuth,
    verifyPasswordResetCode
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const auth = getAuth(app);

document.addEventListener('DOMContentLoaded', async () => {
    if (window.lucide) {
        lucide.createIcons();
    }

    const statusBox = document.getElementById('status-box');
    const statusText = document.getElementById('status-text');
    const form = document.getElementById('reset-password-form');
    const newPasswordInput = document.getElementById('new-password');
    const confirmPasswordInput = document.getElementById('confirm-password');
    const formMessage = document.getElementById('form-message');
    const formMessageText = document.getElementById('form-message-text');
    const submitButton = document.getElementById('btn-update-password');
    const submitText = document.getElementById('btn-update-text');
    const submitIcon = document.getElementById('btn-update-icon');
    const submitSpinner = document.getElementById('btn-update-spinner');
    const loginLink = document.getElementById('login-link');

    const params = new URLSearchParams(window.location.search);
    const mode = params.get('mode');
    const actionCode = params.get('oobCode');

    if (mode !== 'resetPassword' || !actionCode) {
        showFatalError('El enlace de recuperación no es válido. Solicita uno nuevo desde la pantalla de login.');
        return;
    }

    try {
        await verifyPasswordResetCode(auth, actionCode);
        statusBox.classList.add('hidden');
        form.classList.remove('hidden');
    } catch (error) {
        console.error('Error validando enlace de recuperación:', error.code);
        showFatalError(getFriendlyResetError(error.code));
    }

    form.addEventListener('submit', async (event) => {
        event.preventDefault();

        const newPassword = newPasswordInput.value;
        const confirmPassword = confirmPasswordInput.value;
        const validationError = validatePassword(newPassword, confirmPassword);

        hideFormMessage();

        if (validationError) {
            showFormMessage('error', validationError);
            return;
        }

        setSubmitState(true);

        try {
            await confirmPasswordReset(auth, actionCode, newPassword);
            form.classList.add('hidden');
            showStatus('success', 'Tu contraseña fue actualizada correctamente. Ya puedes iniciar sesión.');
            loginLink.classList.remove('hidden');
            loginLink.classList.add('flex');
            window.history.replaceState({}, document.title, `${window.location.pathname}`);
        } catch (error) {
            console.error('Error confirmando cambio de contraseña:', error.code);
            showFormMessage('error', getFriendlyResetError(error.code));
            setSubmitState(false);
        }
    });

    [newPasswordInput, confirmPasswordInput].forEach((input) => {
        input.addEventListener('input', hideFormMessage);
    });

    function validatePassword(password, confirmation) {
        if (!password || !confirmation) {
            return 'Completa ambos campos para continuar.';
        }

        if (password !== confirmation) {
            return 'Las contraseñas no coinciden.';
        }

        if (password.length < 8) {
            return 'La contraseña debe tener al menos 8 caracteres.';
        }

        if (!/[A-ZÁÉÍÓÚÑ]/.test(password)) {
            return 'La contraseña debe incluir al menos una letra mayúscula.';
        }

        if (!/\d/.test(password)) {
            return 'La contraseña debe incluir al menos un número.';
        }

        return '';
    }

    function setSubmitState(isLoading) {
        submitButton.disabled = isLoading;
        submitText.textContent = isLoading ? 'Actualizando...' : 'Actualizar Contraseña';
        submitIcon.classList.toggle('hidden', isLoading);
        submitSpinner.classList.toggle('hidden', !isLoading);
    }

    function showFatalError(message) {
        form.classList.add('hidden');
        showStatus('error', message);
        loginLink.classList.remove('hidden');
        loginLink.classList.add('flex');
    }

    function showStatus(type, message) {
        statusText.textContent = message;
        statusBox.className = 'text-sm px-4 py-3 rounded-lg flex items-start gap-2';
        statusBox.classList.add(
            type === 'success' ? 'bg-green-50' : 'bg-red-50',
            type === 'success' ? 'border-green-200' : 'border-red-200',
            type === 'success' ? 'text-green-700' : 'text-red-700',
            'border'
        );

        const icon = statusBox.querySelector('i');
        icon.classList.remove('animate-spin');
        icon.setAttribute('data-lucide', type === 'success' ? 'check-circle' : 'alert-triangle');

        if (window.lucide) {
            lucide.createIcons();
        }
    }

    function showFormMessage(type, message) {
        formMessageText.textContent = message;
        formMessage.classList.remove('hidden', 'bg-red-50', 'text-red-600', 'border-red-200', 'bg-green-50', 'text-green-600', 'border-green-200');
        formMessage.classList.add(
            type === 'error' ? 'bg-red-50' : 'bg-green-50',
            type === 'error' ? 'text-red-600' : 'text-green-600',
            type === 'error' ? 'border-red-200' : 'border-green-200',
            'border'
        );

        const icon = formMessage.querySelector('i');
        icon.setAttribute('data-lucide', type === 'error' ? 'alert-triangle' : 'check-circle');

        if (window.lucide) {
            lucide.createIcons();
        }
    }

    function hideFormMessage() {
        formMessage.classList.add('hidden');
    }

    function getFriendlyResetError(errorCode) {
        switch (errorCode) {
            case 'auth/expired-action-code':
                return 'El enlace de recuperación expiró. Solicita uno nuevo desde la pantalla de login.';
            case 'auth/invalid-action-code':
                return 'El enlace de recuperación no es válido o ya fue utilizado. Solicita uno nuevo desde la pantalla de login.';
            case 'auth/weak-password':
                return 'La contraseña no cumple con los requisitos mínimos de seguridad.';
            case 'auth/network-request-failed':
                return 'No pudimos completar la operación. Revisa tu conexión e inténtalo nuevamente.';
            default:
                return 'No pudimos validar este enlace. Solicita uno nuevo desde la pantalla de login.';
        }
    }
});
