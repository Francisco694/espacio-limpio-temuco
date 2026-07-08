import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import uploadRoutes from "./routes/upload.js";
dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/upload", uploadRoutes);

app.get("/", (req, res) => {
    res.json({
        status: "OK",
        message: "Servidor de Espacio Limpio funcionando correctamente."
    });
});

export default app;