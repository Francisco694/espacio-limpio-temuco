/**
 * js/db-config.js — Espacio Limpio Ltda.
 * Configuración de Firebase
 */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

// Reemplazar con tus variables de entorno / config reales
const firebaseConfig = {
    apiKey: "AIzaSyC3yY7UJHhzWRQkcaOumR2P0rxEAw8c1PQ",
    authDomain: "espacio-limpio-bd699.firebaseapp.com",
    projectId: "espacio-limpio-bd699",
    storageBucket: "espacio-limpio-bd699.firebasestorage.app",
    messagingSenderId: "474435611276",
    appId: "1:474435611276:web:13d424121cc6ff35bd69a9",
    measurementId: "G-KZTKWHXM6G"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Exportación correcta de app y db
export { app, db };