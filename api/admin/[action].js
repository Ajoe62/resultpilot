// Single Vercel serverless function serving every /api/admin/* action, so the
// deployment stays under the Hobby-plan 12-function cap. Client paths are
// unchanged (/api/admin/set-claims, /api/admin/invite-tutor, …) — Vercel routes
// them here and provides the segment as req.query.action.

import { setClaims, deactivateTutor, inviteTutor, createSchool } from "../_lib/adminActions.js";

const ACTIONS = {
  "set-claims": setClaims,
  "deactivate-tutor": deactivateTutor,
  "invite-tutor": inviteTutor,
  "create-school": createSchool,
};

export default async function handler(req, res) {
  const action = String(
    (req.query && req.query.action) ||
      (req.url || "").split("?")[0].replace(/\/+$/, "").split("/").pop() ||
      "",
  ).trim();

  const fn = ACTIONS[action];
  if (!fn) {
    res.status(404).json({ error: `Unknown admin action: ${action}` });
    return;
  }
  return fn(req, res);
}
