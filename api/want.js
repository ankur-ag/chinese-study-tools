import { redis, cors, hashToObj } from "./_redis.js";

// Desired suspend/unsuspend changes requested by tools; applied to Anki by the
// local sync, then cleared. This is the safe "remote -> Anki" channel: tools
// never touch Anki directly.
//   GET                       -> { wants: { word: "suspend"|"unsuspend" } }
//   POST { word, action }     -> request a change (from a tool)
//   POST { clear:[...] }      -> clear applied words (from the local sync)
//   DELETE                    -> clear all
const KEY = "anki:wants";

export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(200).end();
  try {
    if (req.method === "GET") {
      const wants = hashToObj(await redis(["HGETALL", KEY]));
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).json({ wants });
    }
    if (req.method === "DELETE") {
      await redis(["DEL", KEY]);
      return res.status(200).json({ ok: true });
    }
    if (req.method === "POST") {
      const b = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
      if (Array.isArray(b.clear) && b.clear.length) {
        const fields = b.clear.map(String);
        for (let i = 0; i < fields.length; i += 256) {
          await redis(["HDEL", KEY, ...fields.slice(i, i + 256)]);
        }
        return res.status(200).json({ ok: true });
      }
      if (Array.isArray(b.clear)) return res.status(200).json({ ok: true });
      const word = (b.word || "").toString().trim();
      const action = ["suspend", "unsuspend"].includes(b.action) ? b.action : null;
      if (!word || !action) return res.status(400).json({ error: "word + action (suspend|unsuspend) required" });
      await redis(["HSET", KEY, word, action]);
      return res.status(200).json({ ok: true, word, action });
    }
    res.status(405).json({ error: "GET, POST or DELETE" });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
}
