import { cors } from "./_redis.js";

// English -> Chinese translation practice, via OpenRouter. Two modes:
//   POST { mode:"generate", chars, words?, lines?, level?, length?, instructions?, avoid? }
//        -> { english, chinese }  one coherent paragraph, restricted to `chars`
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
      const lines = Math.min(Math.max(parseInt(b.lines || b.count) || 8, 1), 15);
      const words = Array.isArray(b.words) ? b.words.slice(0, 60) : [];
      const avoid = Array.isArray(b.avoid) ? b.avoid.slice(0, 20) : [];
      const level = ["beginner", "intermediate", "advanced"].includes(b.level) ? b.level : "intermediate";
      const length = ["short", "medium", "long"].includes(b.length) ? b.length : "medium";
      const LEVEL = {
        beginner: "Difficulty: BEGINNER — very simple, high-frequency words and basic grammar (short statements/questions, present tense). Keep it easy.",
        intermediate: "Difficulty: INTERMEDIATE — natural everyday sentences with common grammar patterns and some compound sentences.",
        advanced: "Difficulty: ADVANCED — richer, more varied sentences with subordinate clauses, connectives, and idiomatic Taiwan usage (still only the allowed characters).",
      };
      const LENGTH = {
        short: "Length: SHORT — each sentence about 4-8 Chinese characters, a single clause.",
        medium: "Length: MEDIUM — each sentence about 8-16 Chinese characters.",
        long: "Length: LONG — each sentence about 16-30 Chinese characters, often two clauses.",
      };
      const system =
        "You write a short, coherent Traditional Chinese (Taiwan Mandarin) paragraph for a learner to translate into, " +
        "plus its English translation. Use the way Chinese is actually spoken in Taiwan, never mainland phrasing, " +
        "and only Traditional characters. Output ONLY valid JSON, no markdown.";
      const user =
        `Write ONE coherent, natural paragraph of about ${lines} sentences — a little everyday scene, story, ` +
        `or message someone in Taiwan might write. The sentences must connect into a single flowing paragraph, not a list.\n` +
        `${LEVEL[level]}\n${LENGTH[length]}\n\n` +
        `IMPORTANT: the Chinese may ONLY use these characters (plus numbers/punctuation): ${chars}\n` +
        `Do not use any other Chinese character.\n\n` +
        (words.length ? `For inspiration, some words the learner knows:\n${words.join("、")}\n\n` : "") +
        (avoid.length ? `Write about something different from these recent paragraphs:\n${avoid.join("\n---\n")}\n\n` : "") +
        (b.instructions ? `Special request: ${String(b.instructions).slice(0, 300)}\n\n` : "") +
        `Return JSON: {"english":"<the whole English paragraph>","chinese":"<the whole Traditional Chinese paragraph>"}. ` +
        `Keep the two versions faithful to each other. Use normal sentence punctuation (。！？).`;
      const out = parseJson(await chat(system, user, 1600));
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).json({
        english: String(out.english || "").trim(),
        chinese: String(out.chinese || "").trim(),
      });
    }

    if (b.mode === "grade") {
      const english = String(b.english || "").trim();
      const chinese = String(b.chinese || "").trim();
      const answer = String(b.answer || "").trim();
      if (!english || !chinese) return res.status(400).json({ error: "english + chinese required" });
      const system =
        "You are a friendly Traditional Chinese (Taiwan Mandarin) tutor for an ENGLISH-SPEAKING learner. " +
        "The 'advice' and 'grammarPoint' fields MUST be written in ENGLISH — explain in English prose. " +
        "You may quote individual Traditional Chinese words inside them (never simplified), but the explanation itself is English. " +
        "Output ONLY valid JSON, no markdown.";
      const user =
        `A learner is translating an English sentence into Chinese.\n` +
        `- English: "${english}"\n` +
        `- A correct Taiwan Chinese answer: "${chinese}"\n` +
        `- The learner wrote: "${answer}"\n\n` +
        `Return JSON: {"isCorrect": true/false, "advice": "...", "grammarPoint": "..."}\n` +
        `- isCorrect: true if the learner's answer is semantically correct (allow minor typos, synonyms, or alternative phrasing).\n` +
        `- advice (WRITE IN ENGLISH): friendly, concise note on any mistakes, or praise if correct.\n` +
        `- grammarPoint (WRITE IN ENGLISH): one useful grammar or vocabulary tip drawn from the correct sentence.\n` +
        `Both advice and grammarPoint must be in English, not Chinese.`;
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
