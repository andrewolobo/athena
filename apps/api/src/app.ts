import "dotenv/config";
import express from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import logger from "./logger";
import { errorHandler } from "./middleware/errorHandler";
import healthRouter from "./routes/health";
import authRouter from "./routes/auth";
import orgRouter from "./routes/org";
import entitiesRouter from "./routes/entities";
import formsRouter from "./routes/forms";
import ingestionRouter from "./routes/ingestion";
import notificationsRouter from "./routes/notifications";
import quarantineRouter from "./routes/quarantine";
import conflictsRouter from "./routes/conflicts";
import indicatorsRouter from "./routes/indicators";
import reportingRouter from "./routes/reporting";
import devicesRouter from "./routes/devices";

const app = express();

// ── Security headers ─────────────────────────────────────────
app.use(helmet());

// ── CORS — restrict to the web frontend origin ────────────────
app.use(
  cors({
    origin: process.env.APP_BASE_URL ?? "http://localhost:5173",
    credentials: true,
  }),
);

// ── Request logging ───────────────────────────────────────────
app.use(pinoHttp({ logger }));

// ── Body parsers ──────────────────────────────────────────────
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ── Routes ───────────────────────────────────────────────────
app.use("/health", healthRouter);
app.use("/auth", authRouter);
app.use("/org", orgRouter);
app.use("/entities", entitiesRouter);
app.use("/forms", formsRouter);
app.use("/submissions", ingestionRouter);
app.use("/notifications", notificationsRouter);
app.use("/quarantine", quarantineRouter);
app.use("/conflicts", conflictsRouter);
app.use("/indicators", indicatorsRouter);
app.use("/reporting", reportingRouter);
app.use("/org/devices", devicesRouter);

// ── Global error handler (must be last) ──────────────────────
app.use(errorHandler);

export default app;
