import { redis, cors, hashToObj } from "./_redis.js";

// Pending "class vocab" study list. Stored as a hash: word -> gloss
// (pinyin/meaning captured from the pasted line, may be empty). Ingested into
// Anki by ingest_vocab.py / enable_in_tocfl.py.
//   GET                       -> { words: [...], entries: [{t,g}] }
//   POST { words:[str|{t,g}] }-> add (keeps an existing gloss over an empty one)
//   POST { remove:[...] }     -> remove those words
//   POST { clear:true } / DELETE -> clear the list
const KEY = "ingest:pending";

export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    if (req.method === "GET") {
      let obj = {};
      try {
        obj = hashToObj((await redis(["HGETALL", KEY])) || []);
      } catch (err) {
        // Old format: the key was a set (WRONGTYPE). Drop it and start clean.
        if (String(err).includes("WRONGTYPE")) await redis(["DEL", KEY]);
        else throw err;
      }
      const words = Object.keys(obj);
      const entries = words.map((t) => ({ t, g: obj[t] || "" }));
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).json({ words, entries });
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
      if (Array.isArray(b.remove) && b.remove.length) {
        for (const w of b.remove) await redis(["HDEL", KEY, String(w)]);
        return res.status(200).json({ ok: true, count: await redis(["HLEN", KEY]) });
      }
      const items = Array.isArray(b.words) ? b.words.slice(0, 500) : [];
      if (!items.length) return res.status(400).json({ error: "words[] required" });
      for (const it of items) {
        const t = (typeof it === "string" ? it : it && it.t || "").toString().trim();
        const g = (typeof it === "string" ? "" : (it && it.g) || "").toString().trim().slice(0, 200);
        if (!t) continue;
        // Keep a real gloss; don't let a later bare paste wipe it.
        if (g) await redis(["HSET", KEY, t, g]);
        else await redis(["HSETNX", KEY, t, ""]);
      }
      return res.status(200).json({ ok: true, count: await redis(["HLEN", KEY]) });
    }

    res.status(405).json({ error: "GET, POST or DELETE" });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
}
