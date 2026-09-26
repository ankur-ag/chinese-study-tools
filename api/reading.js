import { redis, cors, hashToObj } from "./_redis.js";
import { chat, parseJson } from "./_llm.js";

// Short Taiwan-Mandarin reading passages built from recently-enabled words,
// generated on demand (by Claude). Kept as an archive so past pieces can be
// re-read. Stored as a hash: id (the generated ISO) -> JSON(doc).
//   Doc shape: { title, generated, words:[{t,py,m}], passages:[{zh,py,en}] }
//   GET                 -> latest doc (or {})
//   GET ?list=1         -> { items: [{id,title,generated,passages}] } newest first
//   GET ?id=<id>        -> that doc (or {})
//   POST { ...doc }     -> add to the archive (id = doc.generated or now)
//   DELETE ?id=<id>     -> remove one;  DELETE -> clear all
const KEY = "reading:items";

function allDocs(flat) {
  const obj = hashToObj(flat || []);
  const docs = [];
  for (const id of Object.keys(obj)) {
    try { docs.push({ id, ...JSON.parse(obj[id]) }); } catch {}
  }
  docs.sort((a, b) => String(b.generated || b.id).localeCompare(String(a.generated || a.id)));
  return docs;
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(200).end();
  try {
    if (req.method === "GET") {
      res.setHeader("Cache-Control", "no-store");
      const docs = allDocs(await redis(["HGETALL", KEY]));
      if (req.query && req.query.list) {
        return res.status(200).json({
          items: docs.map((d) => ({ id: d.id, title: d.title || "", generated: d.generated || d.id, passages: (d.passages || []).length })),
        });
      }
      if (req.query && req.query.id) {
        return res.status(200).json(docs.find((d) => d.id === req.query.id) || {});
      }
      return res.status(200).json(docs[0] || {});
    }
    if (req.method === "DELETE") {
      const id = req.query && req.query.id;
      if (id) { await redis(["HDEL", KEY, String(id)]); return res.status(200).json({ ok: true }); }
      await redis(["DEL", KEY]);
      return res.status(200).json({ ok: true });
    }
    if (req.method === "POST") {
      const b = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};

      // make: generate a passage from a word list (via OpenRouter) and append it
      if (b.make && Array.isArray(b.make.words) && b.make.words.length) {
        const mk = b.make;
        const words = mk.words.slice(0, 40)
          .map((w) => ({ t: String(w.t || "").trim(), py: String(w.py || "").trim(), m: String(w.m || "").trim() }))
          .filter((w) => w.t);
        const lines = Math.min(Math.max(parseInt(mk.lines) || 6, 3), 12);
        const wl = words.map((w) => `${w.t}${w.py ? " (" + w.py + ")" : ""}${w.m ? " — " + w.m : ""}`).join("\n");
        const system =
          "You write a short, coherent Traditional Chinese (Taiwan Mandarin) reading passage for a learner, " +
          "plus its English translation and tone-marked pinyin. Taiwan usage, only Traditional characters. " +
          "Output ONLY valid JSON, no markdown.";
        const user =
          `Write ONE coherent, natural paragraph of about ${lines} sentences a learner in Taiwan would find useful, ` +
          `weaving in AS MANY of these words as fit naturally (you need not use all):\n${wl}\n\n` +
          `Return JSON: {"zh":"<the paragraph>","py":"<the same paragraph in tone-marked pinyin, syllable by syllable>",` +
          `"en":"<English translation>","used":["詞", ...]}. "used" = the target words you actually included.`;
        const out = parseJson(await chat(system, user, 1800));
        if (!String(out.zh || "").trim()) return res.status(502).json({ error: "generation returned no passage" });
        const used = new Set((out.used || []).map(String));
        const gloss = words.filter((w) => used.has(w.t));
        const generated = new Date().toISOString();
        const doc = {
          title: (mk.title || "Class reading").toString().slice(0, 120),
          generated,
          words: gloss.length ? gloss : words,
          passages: [{ zh: String(out.zh || ""), py: String(out.py || ""), en: String(out.en || "") }],
        };
        await redis(["HSET", KEY, generated, JSON.stringify(doc)]);
        return res.status(200).json({ ok: true, id: generated, used: [...used] });
      }

      if (!Array.isArray(b.passages) || !b.passages.length) {
        return res.status(400).json({ error: "passages[] required" });
      }
      const generated = (b.generated || new Date().toISOString()).toString();
      const doc = {
        title: (b.title || "").toString().slice(0, 120),
        generated,
        words: Array.isArray(b.words) ? b.words : [],
        passages: b.passages.map((p) => ({ zh: String(p.zh || ""), py: String(p.py || ""), en: String(p.en || "") })),
      };
      await redis(["HSET", KEY, generated, JSON.stringify(doc)]);
      return res.status(200).json({ ok: true, id: generated });
    }
    res.status(405).json({ error: "GET, POST or DELETE" });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
}
