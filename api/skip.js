import { redis, cors } from "./_redis.js";

// Words the reviewer chose to skip (not enable). Kept separate so they drop out
// of the "next up" list but are never unsuspended. Undecided what to do with
// them long-term — parked here for now.
//   GET                   -> { skipped: [...] }
//   POST { word }         -> skip a word
//   POST { remove:[...] } -> un-skip
//   DELETE                -> clear all
const KEY = "review:skipped";

export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(200).end();
  try {
    if (req.method === "GET") {
      const skipped = (await redis(["SMEMBERS", KEY])) || [];
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).json({ skipped });
    }
    if (req.method === "DELETE") {
      await redis(["DEL", KEY]);
      return res.status(200).json({ ok: true });
    }
    if (req.method === "POST") {
      const b = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
      if (Array.isArray(b.remove) && b.remove.length) {
        for (const w of b.remove) await redis(["SREM", KEY, String(w)]);
        return res.status(200).json({ ok: true });
      }
      const word = (b.word || "").toString().trim();
      if (!word) return res.status(400).json({ error: "word required" });
      await redis(["SADD", KEY, word]);
      return res.status(200).json({ ok: true });
    }
    res.status(405).json({ error: "GET, POST or DELETE" });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
}
