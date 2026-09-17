import { cors } from "./_redis.js";

// English -> Chinese translation practice, powered by Claude. Two modes:
//   POST { mode:"generate", chars, words?, count?, instructions?, avoid? }
//        -> { sentences: [{ english, chinese }] }  (restricted to `chars`)
//   POST { mode:"grade", english, chinese, answer }
//        -> { isCorrect, advice, grammarPoint }
// Needs ANTHROPIC_API_KEY in the environment (Vercel project settings).
const MODEL = "claude-haiku-4-5-20251001"; // small + fast + cheap, good limits

async function claude(system, user, maxTokens) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("Missing ANTHROPIC_API_KEY — add it in the Vercel project settings.");
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });
  const d = await r.json();
  if (d.error) throw new Error(d.error.message || JSON.stringify(d.error));
  const text = (d.content || []).map((b) => b.text || "").join("").trim();
  return text;
}

function parseJson(text) {
  let s = text.trim();
  if (s.startsWith("```")) s = s.replace(/^```[a-z]*\n?/i, "").replace(/```$/, "").trim();
  const i = s.indexOf("{"), j = s.lastIndexOf("}");
  if (i > 0 || j < s.length - 1) s = s.slice(i, j + 1);
  return JSON.parse(s);
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  try {
    const b = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};

    if (b.mode === "generate") {
      const chars = String(b.chars || "");
      if (!chars) return res.status(400).json({ error: "chars required (known vocabulary)" });
      const count = Math.min(Math.max(parseInt(b.count) || 8, 1), 12);
      const words = Array.isArray(b.words) ? b.words.slice(0, 60) : [];
      const avoid = Array.isArray(b.avoid) ? b.avoid.slice(0, 40) : [];
      const system =
        "You write natural Traditional Chinese (Taiwan Mandarin) sentences for a learner to translate into, " +
        "and their English translations. Use the way Chinese is actually spoken in Taiwan, never mainland phrasing, " +
        "and only Traditional characters. Output ONLY valid JSON, no markdown.";
      const user =
        `Generate ${count} short, everyday sentences a learner living in Taiwan would find useful.\n\n` +
        `IMPORTANT: the Chinese may ONLY use these characters (plus numbers/punctuation): ${chars}\n` +
        `Do not use any other Chinese character.\n\n` +
        (words.length ? `For inspiration, some words the learner knows:\n${words.join("、")}\n\n` : "") +
        (avoid.length ? `Avoid repeating these recent sentences:\n${avoid.join("\n")}\n\n` : "") +
        (b.instructions ? `Special request: ${String(b.instructions).slice(0, 300)}\n\n` : "") +
        `Return JSON: {"sentences":[{"english":"...","chinese":"..."}]} with exactly ${count} items. ` +
        `Keep each sentence natural and not too long.`;
      const out = parseJson(await claude(system, user, 1400));
      const sentences = (out.sentences || [])
        .map((s) => ({ english: String(s.english || "").trim(), chinese: String(s.chinese || "").trim() }))
        .filter((s) => s.english && s.chinese);
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).json({ sentences });
    }

    if (b.mode === "grade") {
      const english = String(b.english || "").trim();
      const chinese = String(b.chinese || "").trim();
      const answer = String(b.answer || "").trim();
      if (!english || !chinese) return res.status(400).json({ error: "english + chinese required" });
      const system =
        "You are a friendly Traditional Chinese (Taiwan Mandarin) tutor. Evaluate a learner's translation. " +
        "Explain in English, and only use Traditional characters (never simplified) in any Chinese you write. " +
        "Output ONLY valid JSON, no markdown.";
      const user =
        `A learner is translating an English sentence into Chinese.\n` +
        `- English: "${english}"\n` +
        `- A correct Taiwan Chinese answer: "${chinese}"\n` +
        `- The learner wrote: "${answer}"\n\n` +
        `Return JSON: {"isCorrect": true/false, "advice": "...", "grammarPoint": "..."}\n` +
        `- isCorrect: true if the learner's answer is semantically correct (allow minor typos, synonyms, or alternative phrasing).\n` +
        `- advice: friendly, concise note on any mistakes (or praise if correct).\n` +
        `- grammarPoint: one useful grammar or vocabulary tip drawn from the correct sentence.`;
      const out = parseJson(await claude(system, user, 700));
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).json({
        isCorrect: !!out.isCorrect,
        advice: String(out.advice || "").trim(),
        grammarPoint: String(out.grammarPoint || "").trim(),
      });
    }

    return res.status(400).json({ error: "mode must be 'generate' or 'grade'" });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
}
