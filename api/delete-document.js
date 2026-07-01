// POST /api/delete-document  (admin only)
// Body: { documentId }
// Removes a study document, its embedding shards, and the exam link.

import { requireAdmin, AuthError } from "./_lib/requireAdmin.js";
import { getDb } from "./_lib/firebaseAdmin.js";
import { deleteDocument } from "./_lib/ragStore.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Method not allowed. Use POST." });
    return;
  }

  const body = typeof req.body === "string" ? safeParse(req.body) : req.body || {};

  try {
    await requireAdmin(req);

    const documentId = String(body.documentId ?? "").trim();
    if (!documentId) {
      res.status(400).json({ error: "A documentId is required." });
      return;
    }

    await deleteDocument(getDb(), documentId);
    res.status(200).json({ ok: true });
  } catch (error) {
    if (error instanceof AuthError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    res.status(502).json({ error: error?.message || "Failed to delete document." });
  }
}

function safeParse(raw) {
  try {
    return JSON.parse(raw || "{}");
  } catch {
    return {};
  }
}
