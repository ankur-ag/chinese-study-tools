import { pipeline, cors, hashToObj } from "./_redis.js";

// GET /api/state?tid=<id>
// Returns aggregate up/down counts for every word that has votes, plus this
// teacher's own votes (so the page can move their downvotes to the bottom).
export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const tid = (req.query.tid || "").toString().slice(0, 64);
    const [upFlat, downFlat, mineFlat] = await pipeline([
      ["HGETALL", "up"],
      ["HGETALL", "down"],
      ["HGETALL", tid ? "mine:" + tid : "mine:__none__"],
    ]);

    const toCounts = (o) => {
      const r = {};
      for (const k in o) {
        const n = parseInt(o[k], 10) || 0;
        if (n > 0) r[k] = n;
      }
      return r;
    };

    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({
      up: toCounts(hashToObj(upFlat)),
      down: toCounts(hashToObj(downFlat)),
      mine: hashToObj(mineFlat),
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
}
