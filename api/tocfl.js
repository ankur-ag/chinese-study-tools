import { redis, cors, hashToObj } from "./_redis.js";

// "Enable in existing TOCFL deck" flow.
//   QUEUE   = words waiting for the local script to try enabling
//   RESULTS = word -> "enabled" | "already-active" | "missing" (from the script)
//
//   GET                       -> { queue: [...], results: {word: status} }
//   POST { words }            -> queue words (page)
//   POST { results: {w:st} }  -> record results + dequeue (enable_in_tocfl.py)
//   DELETE                    -> clear queue + results
const QUEUE = "tocfl:queue";
const RESULTS = "tocfl:results";

export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(200).end();
  try {
    if (req.method === "GET") {
      const queue = (await redis(["SMEMBERS", QUEUE])) || [];
      const results = hashToObj(await redis(["HGETALL", RESULTS]));
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).json({ queue, results });
    }

    if (req.method === "DELETE") {
      await redis(["DEL", QUEUE]);
      await redis(["DEL", RESULTS]);
      return res.status(200).json({ ok: true });
    }

    if (req.method === "POST") {
      const b = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};

      // From the local script: record per-word outcomes and dequeue them.
      if (b.results && typeof b.results === "object") {
        for (const [word, status] of Object.entries(b.results)) {
          await redis(["HSET", RESULTS, word, String(status)]);
          await redis(["SREM", QUEUE, word]);
        }
        return res.status(200).json({ ok: true });
      }

      // From the page: queue words to enable (clear any stale result first).
      const words = Array.isArray(b.words)
        ? b.words.map((w) => String(w).trim()).filter(Boolean).slice(0, 500)
        : [];
      if (!words.length) return res.status(400).json({ error: "words[] required" });
      await redis(["SADD", QUEUE, ...words]);
      for (const w of words) await redis(["HDEL", RESULTS, w]);
      return res.status(200).json({ ok: true, queued: words.length });
    }

    res.status(405).json({ error: "GET, POST or DELETE" });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
}
