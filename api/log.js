import { redis, cors, hashToObj } from "./_redis.js";

// When a word first becomes studyable — a tocfl card unsuspended, or a Preply
// card created — the sync logs it here so tools can ask "what did I enable in
// the last N days?". Stored as a hash: word -> ISO timestamp of first enable.
//   GET                        -> { log: { word: iso } }
//   POST { words:[...], ts? }  -> record first-enable time (kept, not overwritten)
//   POST { remove:[...] }      -> drop entries
//   DELETE                     -> clear
const KEY = "study:log";

export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(200).end();
  try {
    if (req.method === "GET") {
      const log = hashToObj((await redis(["HGETALL", KEY])) || []);
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).json({ log });
    }
    if (req.method === "DELETE") {
      await redis(["DEL", KEY]);
      return res.status(200).json({ ok: true });
    }
    if (req.method === "POST") {
      const b = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
      if (Array.isArray(b.remove) && b.remove.length) {
        await redis(["HDEL", KEY, ...b.remove.map(String)]);
        return res.status(200).json({ ok: true });
      }
      const words = Array.isArray(b.words) ? b.words.map(String).filter(Boolean) : [];
      if (!words.length) return res.status(400).json({ error: "words[] required" });
      const ts = (b.ts || new Date().toISOString()).toString();
      // HSETNX keeps the first-enable time if the word was already logged.
      for (const w of words) await redis(["HSETNX", KEY, w, ts]);
      return res.status(200).json({ ok: true, count: await redis(["HLEN", KEY]) });
    }
    res.status(405).json({ error: "GET, POST or DELETE" });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
}
