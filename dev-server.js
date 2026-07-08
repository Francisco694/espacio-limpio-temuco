/**
 * dev-server.js — Espacio Limpio Ltda.
 * Servidor local para desarrollo: sirve los archivos estáticos del sitio y
 * expone /api/upload (misma función que usa Vercel en producción), para no
 * depender de `vercel dev` (que requiere iniciar sesión) ni de Live Server
 * (que no puede ejecutar funciones serverless).
 *
 * Uso: npm run dev  →  http://localhost:3000
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import uploadHandler from './api/upload.js';
import sendQuoteEmailHandler from './api/send-quote-email.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
};

// Vercel entrega a los handlers un `res` con .status()/.json(); el
// http.ServerResponse nativo no los trae, así que los agregamos aquí.
function addVercelResponseHelpers(res) {
    res.status = (code) => {
        res.statusCode = code;
        return res;
    };
    res.json = (data) => {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify(data));
        return res;
    };
    return res;
}

function serveStaticFile(req, res) {
    const urlPath = req.url.split('?')[0];
    const relativePath = urlPath === '/' ? '/index.html' : decodeURIComponent(urlPath);
    const filePath = path.join(__dirname, relativePath);

    // Evita salir de la carpeta del proyecto (path traversal)
    if (!filePath.startsWith(__dirname)) {
        res.statusCode = 403;
        res.end('Forbidden');
        return;
    }

    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.statusCode = 404;
            res.end('Not found');
            return;
        }
        res.setHeader('Content-Type', MIME_TYPES[path.extname(filePath)] || 'application/octet-stream');
        res.end(data);
    });
}

const server = http.createServer(async (req, res) => {
    if (req.url.startsWith('/api/upload')) {
        addVercelResponseHelpers(res);
        try {
            await uploadHandler(req, res);
        } catch (err) {
            console.error('[api/upload] Error:', err);
            if (!res.headersSent) {
                res.status(500).json({ error: 'Error interno del servidor' });
            }
        }
        return;
    }

    if (req.url.startsWith('/api/send-quote-email')) {
        addVercelResponseHelpers(res);
        try {
            await sendQuoteEmailHandler(req, res);
        } catch (err) {
            console.error('[api/send-quote-email] Error:', err);
            if (!res.headersSent) {
                res.status(500).json({ error: 'Error interno del servidor' });
            }
        }
        return;
    }

    serveStaticFile(req, res);
});

server.listen(PORT, () => {
    console.log(`[Espacio Limpio] Servidor local listo en http://localhost:${PORT}`);
});
