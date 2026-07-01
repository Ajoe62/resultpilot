import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// Serves the /api/generate-questions serverless route during `vite dev`,
// so local development does not require the Vercel CLI. In production the
// same handler runs as a real serverless function (api/generate-questions.js).
function aiQuestionsDevApi(env) {
  return {
    name: "ai-questions-dev-api",
    configureServer(server) {
      server.middlewares.use("/api/generate-questions", async (req, res) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.setHeader("Allow", "POST");
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: "Method not allowed. Use POST." }));
          return;
        }

        const sendJson = (status, payload) => {
          res.statusCode = status;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(payload));
        };

        try {
          const { generateQuestions, GenerationInputError } = await import(
            "./api/_lib/generateQuestions.js"
          );

          const chunks = [];
          for await (const chunk of req) {
            chunks.push(chunk);
          }
          const raw = Buffer.concat(chunks).toString("utf8") || "{}";

          let body;
          try {
            body = JSON.parse(raw);
          } catch {
            sendJson(400, { error: "Request body must be valid JSON." });
            return;
          }

          try {
            const questions = await generateQuestions(body, {
              apiKey: env.GEMINI_API_KEY,
              model: env.GEMINI_MODEL,
            });
            sendJson(200, { questions });
          } catch (error) {
            if (error instanceof GenerationInputError) {
              sendJson(400, { error: error.message });
              return;
            }
            sendJson(502, {
              error: error?.message || "Failed to generate questions.",
            });
          }
        } catch (error) {
          sendJson(500, { error: error?.message || "Internal dev server error." });
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
  plugins: [react(), aiQuestionsDevApi(env)],
  build: {
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (id.includes("firebase")) {
              return "vendor_firebase";
            }
            if (id.includes("react")) {
              return "vendor_react";
            }
            return "vendor";
          }
        },
      },
    },
  },
  };
});
