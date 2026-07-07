import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import uploadRoutes from "./routes/upload.js";
dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/upload", uploadRoutes);

const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
    res.json({
        status: "OK",
        message: "Servidor de Espacio Limpio funcionando correctamente."
    });
});

app.listen(PORT, () => {
    console.log(`🚀 Servidor iniciado en http://localhost:${PORT}`);
});