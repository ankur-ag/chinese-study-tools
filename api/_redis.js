// Minimal Upstash Redis REST helper (no SDK dependency).
// Env vars are injected by the Vercel + Upstash marketplace integration.
const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

function assertEnv() {
  if (!URL_ || !TOKEN)
    throw new Error(
      "Missing Redis env vars (KV_REST_API_URL / KV_REST_API_TOKEN). Add the Upstash integration in Vercel.",
    );
}

export async function redis(command) {
  assertEnv();
  const r = await fetch(URL_, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + TOKEN,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
  });
  const d = await r.json();
  if (d.error) throw new Error(d.error);
  return d.result;
}

export async function pipeline(commands) {
  assertEnv();
  const r = await fetch(URL_ + "/pipeline", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + TOKEN,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(commands),
  });
  const d = await r.json();
  if (d.error) throw new Error(d.error);
  return d.map((x) => {
    if (x.error) throw new Error(x.error);
    return x.result;
  });
}

export function hashToObj(flat) {
  const o = {};
  if (Array.isArray(flat)) for (let i = 0; i < flat.length; i += 2) o[flat[i]] = flat[i + 1];
  return o;
}

export function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}
