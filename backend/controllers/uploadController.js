import cloudinary from "../config/cloudinary.js";
import streamifier from "streamifier";

/**
 * Sube una imagen a Cloudinary
 */
const subirImagen = (buffer) => {
    return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
            {
                folder: "espacio-limpio/evidencias"
            },
            (error, result) => {
                if (error) return reject(error);
                resolve(result);
            }
        );

        streamifier.createReadStream(buffer).pipe(stream);
    });
};

export const uploadImages = async (req, res) => {
     console.log("=== PETICIÓN RECIBIDA ===");
    console.log(req.files);
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({
                success: false,
                message: "No se recibieron imágenes."
            });
        }

        const urls = [];

       for (const file of req.files) {

    console.log("Subiendo:", file.originalname);

    const resultado = await subirImagen(file.buffer);

    console.log(resultado);

    urls.push({
        url: resultado.secure_url,
        public_id: resultado.public_id
    });
}

        res.json({
            success: true,
            evidencias: urls
        });

    } catch (error) {
        console.error(error);

        res.status(500).json({
            success: false,
            message: "Error al subir imágenes.",
            error: error.message
        });
    }
};