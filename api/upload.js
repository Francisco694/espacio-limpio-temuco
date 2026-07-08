import multer from "multer";
import streamifier from "streamifier";
import cloudinary from "../backend/config/cloudinary.js";

const storage = multer.memoryStorage();

const upload = multer({
    storage,
    limits: {
        fileSize: 10 * 1024 * 1024
    }
});

function runMiddleware(req, res, fn) {
    return new Promise((resolve, reject) => {
        fn(req, res, (result) => {
            if (result instanceof Error) return reject(result);
            resolve(result);
        });
    });
}

function subirImagen(file) {
    return new Promise((resolve, reject) => {

        const stream = cloudinary.uploader.upload_stream(
            {
                folder: "espacio-limpio/evidencias"
            },
            (error, result) => {

                if (error) {
                    reject(error);
                } else {
                    resolve(result.secure_url);
                }

            }
        );

        streamifier.createReadStream(file.buffer).pipe(stream);

    });
}

export default async function handler(req, res) {

    if (req.method !== "POST") {
        return res.status(405).json({
            error: "Método no permitido"
        });
    }

    try {

        await runMiddleware(
            req,
            res,
            upload.array("imagenes", 10)
        );

        if (!req.files || req.files.length === 0) {
            return res.status(400).json({
                error: "No se recibieron imágenes"
            });
        }

        const urls = [];

        for (const file of req.files) {

            const url = await subirImagen(file);

            urls.push(url);

        }

        return res.status(200).json({
        success: true,
        evidencias: urls.map(url => ({
            url
        }))
    });

    } catch (err) {

        console.error(err);

        return res.status(500).json({
            error: err.message
        });

    }

}