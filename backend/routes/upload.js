import express from "express";
import multer from "multer";
import { uploadImages } from "../controllers/uploadController.js";

const router = express.Router();

const storage = multer.memoryStorage();

const upload = multer({
    storage,
    limits: {
        fileSize: 10 * 1024 * 1024 // 10 MB
    }
});

router.post(
    "/",
    upload.array("imagenes", 10),
    uploadImages
);

export default router;