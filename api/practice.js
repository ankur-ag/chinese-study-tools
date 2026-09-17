import { cors } from "./_redis.js";

// English -> Chinese translation practice, via OpenRouter. Two modes:
//   POST { mode:"generate", chars, words?, count?, instructions?, avoid? }
//        -> { sentences: [{ english, chinese }] }  (restricted to `chars`)
//   POST { mode:"grade", english, chinese, answer }
//        -> { isCorrect, advice, grammarPoint }
// Needs OPENROUTER_API_KEY in the environment (Vercel project settings).
// Model defaults to a cheap GLM; override with OPENROUTER_MODEL.
const MODEL = process.env.OPENROUTER_MODEL || "z-ai/glm-4.6";

async function chat(system, user, maxTokens) {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("Missing OPENROUTER_API_KEY — add it in the Vercel project settings.");
  const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + key,
      "content-type": "application/json",
      "X-Title": "Chinese Study Tools",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      // GLM etc. are reasoning models; ask OpenRouter to skip thinking so we get
      // clean JSON (ignored by models that don't support it).
      reasoning: { enabled: false },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  const d = await r.json();
  if (d.error) throw new Error((d.error && d.error.message) || JSON.stringify(d.error));
  const text = ((d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content) || "").trim();
  if (!text) throw new Error("Empty response from model");
  return text;
}

function parseJson(text) {
  let s = text.trim();
  const tc = s.lastIndexOf("</think>"); // drop reasoning models' thinking block
  if (tc >= 0) s = s.slice(tc + 8).trim();
  if (s.startsWith("```")) s = s.replace(/^```[a-z]*\n?/i, "").replace(/```\s*$/, "").trim();
  const i = s.indexOf("{"), j = s.lastIndexOf("}");
  if (i >= 0 && j > i) s = s.slice(i, j + 1);
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
      const out = parseJson(await chat(system, user, 1400));
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
      const out = parseJson(await chat(system, user, 700));
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
