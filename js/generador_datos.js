/**
 * js/generador_datos.js — Espacio Limpio Ltda.
 * SCRIPT TEMPORAL PARA GENERAR DATOS DE PRUEBA (MOCK DATA)
 * ¡ADVERTENCIA! BORRAR O COMENTAR DESPUÉS DE EJECUTAR UNA VEZ.
 */

import { db } from './db-config.js';
import { collection, addDoc, Timestamp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

// --- CONFIGURACIÓN DEL GENERADOR ---
const NUM_CLIENTES = 15; // Promedio por mes (para 7 meses = ~105)
const MESES_ATRAS = 7;

const nombres = ['Juan Pérez', 'María Soto', 'Inmobiliaria Araucanía', 'Carlos Ruiz', 'Empresa Temuco', 'Ana Morales', 'Constructora Sur', 'Pedro Silva', 'Camila Castro', 'Luis Gómez', 'Clínica Alemana', 'Automotora Centro', 'Sociedad de Inversiones', 'Colegio San José', 'Familia González'];
const servicios = ['hogar', 'oficina', 'post', 'electro'];
// Pesos para generar estados más realistas en datos históricos (más aprobadas en el pasado)
const estadosHistoricos = ['Aprobada', 'Aprobada', 'Aprobada', 'Rechazada', 'Pendiente']; 

const generarRut = () => `${Math.floor(Math.random() * 10 + 10)}.${Math.floor(Math.random() * 800 + 100)}.${Math.floor(Math.random() * 800 + 100)}-${Math.floor(Math.random() * 9)}`;
const generarTelefono = () => `+56 9 ${Math.floor(Math.random()*80000000 + 10000000)}`;

export const ejecutarCargaMasiva = async () => {
    console.log("Iniciando carga masiva de datos...");
    let registrosCreados = 0;

    try {
        for (let i = 0; i <= MESES_ATRAS; i++) {
            // Generar ~15 por mes
            const clientesDelMes = Math.floor(Math.random() * 5) + (NUM_CLIENTES - 2); // Entre 13 y 17

            for (let j = 0; j < clientesDelMes; j++) {
                
                // --- 1. Generar Fechas Aleatorias ---
                const fechaCreacion = new Date();
                fechaCreacion.setMonth(fechaCreacion.getMonth() - i);
                fechaCreacion.setDate(Math.floor(Math.random() * 28) + 1); 
                fechaCreacion.setHours(Math.floor(Math.random() * 8) + 9);

                // Fecha agendada (normalmente unos días después de la creación)
                const fechaAgendada = new Date(fechaCreacion);
                fechaAgendada.setDate(fechaAgendada.getDate() + Math.floor(Math.random() * 10) + 1);
                
                const [yyyy, mm, dd] = fechaAgendada.toISOString().split('T')[0].split('-');
                const horaStr = `${Math.floor(Math.random() * 8) + 9}:00`; // Entre 9 y 16 hrs

                // --- 2. Seleccionar Datos ---
                const nombreCliente = nombres[Math.floor(Math.random() * nombres.length)];
                const servicioSelect = servicios[Math.floor(Math.random() * servicios.length)];
                
                // Determinar estado (Si es mes actual, más prob de pendiente. Si es viejo, prob de aprobada/rechazada)
                let estadoActual = 'Pendiente';
                if (i > 0) { // Meses anteriores
                    estadoActual = estadosHistoricos[Math.floor(Math.random() * estadosHistoricos.length)];
                } else { // Mes actual
                    estadoActual = Math.random() > 0.5 ? 'Pendiente' : 'Aprobada';
                }

                // --- 3. Calcular Valores Reales ---
                let m2 = 0;
                let subtotal = 0;
                let personal = 1;

                if (servicioSelect === 'hogar') { m2 = Math.floor(Math.random() * 80 + 40); subtotal = (1200 * m2); }
                else if (servicioSelect === 'oficina') { m2 = Math.floor(Math.random() * 200 + 50); subtotal = (1500 * m2); personal = 2; }
                else if (servicioSelect === 'post') { m2 = Math.floor(Math.random() * 150 + 60); subtotal = (2500 * m2); personal = 3; }
                else if (servicioSelect === 'electro') { subtotal = 35000; }

                const iva = Math.round(subtotal * 0.19);
                const total = subtotal + iva;

                // --- 4. Guardar Cotización ---
                const cotizacionRef = await addDoc(collection(db, 'cotizaciones'), {
                    cliente: nombreCliente,
                    rut: generarRut(),
                    correo: `contacto_${j}@mail.com`,
                    telefono: generarTelefono(),
                    direccion: 'Temuco Centro',
                    tipoCliente: Math.random() > 0.6 ? 'Empresa' : 'Persona Natural',
                    tipoLimpieza: servicioSelect,
                    fechaAgendada: `${yyyy}-${mm}-${dd}`,
                    horaAgendada: horaStr,
                    metros: m2,
                    personal: personal,
                    descuento: 0,
                    prioridad: Math.random() > 0.8 ? 'Alta' : 'Normal',
                    descripcion: 'Generado automáticamente para prueba.',
                    valorSubtotal: subtotal,
                    valorTotal: total,
                    estadoCRM: estadoActual,
                    fuente: Math.random() > 0.4 ? 'Modal Web' : 'CRM Interno',
                    creadoEn: Timestamp.fromDate(fechaCreacion),
                    modificadoEn: Timestamp.fromDate(fechaCreacion)
                });
                registrosCreados++;

                // --- 5. Guardar Cliente (Opcional, si no existe) ---
                // Para simplificar, agregamos algunos a la colección de clientes
                if (Math.random() > 0.7) {
                     await addDoc(collection(db, 'clientes'), {
                        nombre: nombreCliente,
                        rut: generarRut(),
                        correo: `contacto_${j}@mail.com`,
                        telefono: generarTelefono(),
                        direccion: 'Temuco',
                        fechaRegistro: fechaCreacion.toISOString().split('T')[0],
                        creadoEn: Timestamp.fromDate(fechaCreacion)
                    });
                }

                // --- 6. Si es Aprobada, Crear Cita en Agenda ---
                if (estadoActual === 'Aprobada') {
                    await addDoc(collection(db, 'citas'), {
                        cotizacionId: cotizacionRef.id,
                        clienteNombre: nombreCliente,
                        servicio: servicioSelect,
                        fecha: `${yyyy}-${mm}-${dd}`,
                        hora: horaStr,
                        estado: 'Agendada'
                    });
                }
            }
        }
        console.log(`¡Carga finalizada! Se crearon ${registrosCreados} cotizaciones.`);
        alert(`¡Carga masiva completada! ${registrosCreados} registros creados. Por favor, BORRA LA ETIQUETA SCRIPT DEL HTML AHORA.`);
        
    } catch (error) {
        console.error("Error en la carga masiva:", error);
        alert("Ocurrió un error en la carga de datos.");
    }
};

// ============================================================================
// EJECUCIÓN AUTOMÁTICA
// Al importar este archivo en el HTML, esta función se disparará inmediatamente.
// ============================================================================

ejecutarCargaMasiva();