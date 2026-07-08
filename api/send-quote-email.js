import transporter from "../backend/config/mailer.js";

function readBody(req) {
    if (req.body && typeof req.body === "object") {
        return Promise.resolve(req.body);
    }
    if (typeof req.body === "string" && req.body.length) {
        try {
            return Promise.resolve(JSON.parse(req.body));
        } catch {
            return Promise.resolve({});
        }
    }
    return new Promise((resolve, reject) => {
        let raw = "";
        req.on("data", (chunk) => { raw += chunk; });
        req.on("end", () => {
            try {
                resolve(raw ? JSON.parse(raw) : {});
            } catch (err) {
                reject(err);
            }
        });
        req.on("error", reject);
    });
}

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function construirResumen(cotizacion) {
    return `
        <ul style="padding-left:18px;line-height:1.6;">
            <li><strong>Nombre:</strong> ${escapeHtml(cotizacion.nombre)}</li>
            <li><strong>RUT:</strong> ${escapeHtml(cotizacion.rut)}</li>
            <li><strong>Tipo de solicitante:</strong> ${escapeHtml(cotizacion.tipoCliente)}</li>
            <li><strong>Correo:</strong> ${escapeHtml(cotizacion.correo)}</li>
            <li><strong>Teléfono:</strong> ${escapeHtml(cotizacion.telefono)}</li>
            <li><strong>Dirección:</strong> ${escapeHtml(cotizacion.direccion)}</li>
            <li><strong>Fecha solicitada:</strong> ${escapeHtml(cotizacion.fecha)} ${escapeHtml(cotizacion.hora)}</li>
            <li><strong>Descripción:</strong> ${escapeHtml(cotizacion.descripcion)}</li>
        </ul>
    `;
}

export default async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Método no permitido" });
    }

    try {
        const cotizacion = await readBody(req);

        if (!cotizacion.correo || !cotizacion.nombre) {
            return res.status(400).json({ error: "Datos de cotización incompletos" });
        }

        const resumenHtml = construirResumen(cotizacion);
        const remitente = process.env.MAIL_FROM || process.env.SMTP_USER;
        const correoAdmin = process.env.ADMIN_EMAIL;

        const envios = [
            transporter.sendMail({
                from: remitente,
                to: cotizacion.correo,
                subject: "Confirmación de solicitud de cotización — Espacio Limpio",
                html: `
                    <p>Hola ${escapeHtml(cotizacion.nombre)},</p>
                    <p>Usted realizó una solicitud de cotización con los siguientes datos:</p>
                    ${resumenHtml}
                    <p>Nuestro equipo la revisará y se comunicará a la brevedad para confirmar la visita.</p>
                `
            })
        ];

        if (correoAdmin) {
            envios.push(
                transporter.sendMail({
                    from: remitente,
                    to: correoAdmin,
                    subject: `Nueva solicitud de cotización — ${cotizacion.nombre}`,
                    html: `
                        <p>El usuario <strong>${escapeHtml(cotizacion.nombre)}</strong> le envió una solicitud de cotización:</p>
                        ${resumenHtml}
                    `
                })
            );
        }

        await Promise.all(envios);

        return res.status(200).json({ success: true });
    } catch (err) {
        console.error("[api/send-quote-email]", err);
        return res.status(500).json({ error: err.message });
    }
}
