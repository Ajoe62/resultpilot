import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// Serves the /api/* serverless functions during `vite dev` by importing the
// same handler modules Vercel runs in production, so local development needs
// no Vercel CLI. Each handler is written Vercel-style (req.body, res.status().json());
// this adapter provides that shape over Node's raw req/res.
const DEV_API_ROUTES = new Set([
  "generate-questions",
  "generate-from-document",
  "ingest-document",
  "rag-query",
  "delete-document",
  "start-exam-session",
  "submit-exam",
  "mark-theory",
  "finalise-theory",
]);

// Server-only vars the handlers read from process.env. loadEnv reads them from
// .env but does not populate process.env, so we bridge them here (dev only).
function bridgeServerEnv(env) {
  for (const key of [
    "GEMINI_API_KEY",
    "GEMINI_MODEL",
    "GEMINI_EMBED_MODEL",
    "GEMINI_MARK_MODEL",
    "FIREBASE_SERVICE_ACCOUNT",
  ]) {
    if (env[key] && !process.env[key]) {
      process.env[key] = env[key];
    }
  }
}

function serverlessDevApi(env) {
  bridgeServerEnv(env);
  return {
    name: "serverless-dev-api",
    configureServer(server) {
      server.middlewares.use("/api", async (req, res) => {
        const name = (req.url || "").split("?")[0].replace(/^\//, "");
        if (!DEV_API_ROUTES.has(name)) {
          return; // fall through to Vite's own handlers / 404
        }

        // Adapt Node res to the Vercel-style API the handlers expect.
        res.status = (code) => {
          res.statusCode = code;
          return res;
        };
        res.json = (payload) => {
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(payload));
        };

        try {
          const chunks = [];
          for await (const chunk of req) {
            chunks.push(chunk);
          }
          const raw = Buffer.concat(chunks).toString("utf8");
          try {
            req.body = raw ? JSON.parse(raw) : {};
          } catch {
            res.status(400).json({ error: "Request body must be valid JSON." });
            return;
          }

          const module = await import(`./api/${name}.js`);
          await module.default(req, res);
        } catch (error) {
          res.status(500).json({
            error: error?.message || "Internal dev server error.",
          });
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  // Load every env var (not just VITE_*) so the server-side key is available
  // to the dev middleware without exposing it to client bundles.
  const env = loadEnv(mode, process.cwd(), "");

  return {
  plugins: [react(), serverlessDevApi(env)],
  build: {
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            // Heavy, lazily-imported parsers — keep them in their own chunks
            // so they only load when a tutor extracts a document.
            if (id.includes("pdfjs-dist")) {
              return "vendor_pdfjs";
            }
            if (id.includes("mammoth")) {
              return "vendor_mammoth";
            }
            if (id.includes("firebase")) {
              return "vendor_firebase";
            }
            // Charts (recharts + its d3 deps) only load on the tutor analytics
            // route, so keep them out of the shared vendor chunk.
            if (
              id.includes("node_modules/recharts") ||
              id.includes("node_modules/victory-vendor") ||
              id.includes("node_modules/d3-")
            ) {
              return "vendor_recharts";
            }
            // React (+ react-dom, react-router) stays in the main vendor chunk.
            // Isolating it into its own chunk created a circular chunk
            // (vendor <-> vendor_react) that broke the production bundle at load
            // — a blank page on Vercel while `npm run dev` (unchunked) worked.
            return "vendor";
          }
        },
      },
    },
  },
  };
});
