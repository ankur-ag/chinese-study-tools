import { redis, cors } from "./_redis.js";

// Snapshot of the Anki TOCFL deck, pushed by sync_anki_upstash.py and read by
// any tool. Stored as one JSON blob so it's one command to read/write.
//   GET            -> { generated, count, cards: { word: {deck,py,m,s} } }
//   POST { cards } -> replace the snapshot (from the local sync)
const KEY = "anki:cards";

export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(200).end();
  try {
    if (req.method === "GET") {
      const s = await redis(["GET", KEY]);
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).json(s ? JSON.parse(s) : { generated: null, count: 0, cards: {} });
    }
    if (req.method === "POST") {
      const b = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
      if (!b.cards || typeof b.cards !== "object") return res.status(400).json({ error: "cards object required" });
      const payload = {
        generated: b.generated || new Date().toISOString(),
        count: Object.keys(b.cards).length,
        cards: b.cards,
      };
      await redis(["SET", KEY, JSON.stringify(payload)]);
      return res.status(200).json({ ok: true, count: payload.count });
    }
    res.status(405).json({ error: "GET or POST" });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
}
