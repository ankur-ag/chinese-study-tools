import { redis, cors } from "./_redis.js";

// A short Taiwan-Mandarin reading passage built from recently-enabled words,
// generated on demand (by Claude) and stored here for the /reading page to show.
//   GET                 -> the stored reading object (or {})
//   POST { ...reading }  -> store it (replaces). Shape:
//     { title, generated, words:[{t,py,m}], passages:[{zh, en}] }
//   DELETE              -> clear
const KEY = "reading:current";

export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(200).end();
  try {
    if (req.method === "GET") {
      const raw = await redis(["GET", KEY]);
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).json(raw ? JSON.parse(raw) : {});
    }
    if (req.method === "DELETE") {
      await redis(["DEL", KEY]);
      return res.status(200).json({ ok: true });
    }
    if (req.method === "POST") {
      const b = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
      if (!Array.isArray(b.passages) || !b.passages.length) {
        return res.status(400).json({ error: "passages[] required" });
      }
      const doc = {
        title: (b.title || "").toString().slice(0, 120),
        generated: b.generated || new Date().toISOString(),
        words: Array.isArray(b.words) ? b.words : [],
        passages: b.passages.map((p) => ({ zh: String(p.zh || ""), en: String(p.en || "") })),
      };
      await redis(["SET", KEY, JSON.stringify(doc)]);
      return res.status(200).json({ ok: true });
    }
    res.status(405).json({ error: "GET, POST or DELETE" });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
}
