// Shared OpenRouter (OpenAI-compatible) chat helper. Model defaults to a cheap
// GLM; override with OPENROUTER_MODEL. Needs OPENROUTER_API_KEY in the env.
const MODEL = process.env.OPENROUTER_MODEL || "z-ai/glm-4.6";

export async function chat(system, user, maxTokens) {
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

export function parseJson(text) {
  let s = text.trim();
  const tc = s.lastIndexOf("</think>"); // drop reasoning models' thinking block
  if (tc >= 0) s = s.slice(tc + 8).trim();
  if (s.startsWith("```")) s = s.replace(/^```[a-z]*\n?/i, "").replace(/```\s*$/, "").trim();
  const i = s.indexOf("{"), j = s.lastIndexOf("}");
  if (i >= 0 && j > i) s = s.slice(i, j + 1);
  return JSON.parse(s);
}
