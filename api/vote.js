import { redis, cors } from "./_redis.js";

// POST { tid, word, state:"up"|"down"|"none" }
// Records this teacher's vote, keeping aggregate up/down counts unique per
// teacher (their previous vote is moved, never double-counted).
export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  try {
    const b = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const tid = (b.tid || "").toString().slice(0, 64);
    const word = b.word;
    const state = ["up", "down", "none"].includes(b.state) ? b.state : null;
    if (!tid) return res.status(400).json({ error: "tid required" });
    if (!word || typeof word !== "string") return res.status(400).json({ error: "word required" });
    if (!state) return res.status(400).json({ error: "state must be up|down|none" });

    const prev = await redis(["HGET", "mine:" + tid, word]); // "up" | "down" | null

    if (prev !== state) {
      if (prev === "up") await redis(["HINCRBY", "up", word, -1]);
      if (prev === "down") await redis(["HINCRBY", "down", word, -1]);
      if (state === "up") await redis(["HINCRBY", "up", word, 1]);
      if (state === "down") await redis(["HINCRBY", "down", word, 1]);
      if (state === "none") await redis(["HDEL", "mine:" + tid, word]);
      else await redis(["HSET", "mine:" + tid, word, state]);
    }

    const up = Math.max(0, parseInt((await redis(["HGET", "up", word])) || "0", 10));
    const down = Math.max(0, parseInt((await redis(["HGET", "down", word])) || "0", 10));
    res.status(200).json({ ok: true, word, up, down, state });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
}
