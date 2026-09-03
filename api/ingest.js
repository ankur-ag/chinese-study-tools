import { redis, cors } from "./_redis.js";

// Pending "class vocab" study list, ingested into Anki by ingest_vocab.py.
//   GET               -> { words: [...] }
//   POST { words }    -> add words (deduped), returns { count }
//   POST { clear:true }-> clear the list
//   DELETE            -> clear the list
const KEY = "ingest:pending";

export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    if (req.method === "GET") {
      const words = (await redis(["SMEMBERS", KEY])) || [];
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).json({ words });
    }

    if (req.method === "DELETE") {
      await redis(["DEL", KEY]);
      return res.status(200).json({ ok: true, count: 0 });
    }

    if (req.method === "POST") {
      const b = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
      if (b.clear) {
        await redis(["DEL", KEY]);
        return res.status(200).json({ ok: true, count: 0 });
      }
      const words = Array.isArray(b.words)
        ? b.words.map((w) => String(w).trim()).filter(Boolean).slice(0, 500)
        : [];
      if (!words.length) return res.status(400).json({ error: "words[] required" });
      await redis(["SADD", KEY, ...words]);
      const count = await redis(["SCARD", KEY]);
      return res.status(200).json({ ok: true, added: words.length, count });
    }

    res.status(405).json({ error: "GET, POST or DELETE" });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
}
