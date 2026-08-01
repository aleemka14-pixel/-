import "dotenv/config";
import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { reliabilityManager } from "./backend/services/reliability-manager.js";
import { rateLimiter, webhookRateLimit, depositRateLimit, withdrawRateLimit, adminRateLimit } from "./middleware/rate-limit.js";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Body parsers
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Apply API Rate Limiting Middleware
  app.use("/api/webhook*", webhookRateLimit);
  app.use("/api/payment-webhook*", webhookRateLimit);
  app.use("/api/create-deposit*", depositRateLimit);
  app.use("/api/create-withdraw*", withdrawRateLimit);
  app.use("/api/admin/*", adminRateLimit);

  // Central Gateway router in /api/index.js
  app.all("/api/*", async (req, res) => {
    try {
      const fullPath = path.join(process.cwd(), "api", "index.js");
      const module = await import(`file://${fullPath}`);
      if (module.default && typeof module.default === "function") {
        await module.default(req, res);
      } else {
        res.status(404).json({ success: false, error: `API handler for ${req.path} not found.` });
      }
    } catch (err: any) {
      console.error(`Error in API handler for ${req.path}:`, err);
      res.status(500).json({ success: false, error: err.message || "Internal Server Error" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
    // Start reliability management and background jobs scheduler
    reliabilityManager.start();
  });
}

startServer();
