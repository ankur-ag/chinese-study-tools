# 選字 · Chinese word review

A tiny voting page for teachers to 👍/👎 the words about to enter the Anki
rotation (the same 50 words shown by the Chromecast screensaver). Downvotes are
pulled back into Anki to tag/suspend words worth skipping.

- **Frontend:** `index.html` (static) — reads the word list from the screensaver
  gist, plays audio from the GitHub Pages copy.
- **API:** `api/vote.js`, `api/state.js` — serverless functions backed by
  Upstash Redis. Each teacher is identified by a cookie so votes are unique and
  changeable.

## Deploy (one time, your account)

1. Push this folder to a GitHub repo (already done if you're reading this in one).
2. In **vercel.com → Add New → Project**, import the repo. Framework preset:
   **Other** (no build step; static + `/api`). Deploy.
3. In the Vercel project: **Storage → Marketplace → Upstash (Redis) → Add**.
   Accept the free plan and **connect it to this project**. This auto-adds the
   `KV_REST_API_URL` / `KV_REST_API_TOKEN` env vars.
4. **Redeploy** once so the functions pick up the env vars.
5. Share the deployment URL with your teachers.

## Pull downvotes into Anki

From the main repo (`utils/widget/`), with Anki open:

```bash
./apply_downvotes.py --url https://<your-vercel-app>.vercel.app
```

This tags downvoted words `tv-skip` and suspends them; the screensaver export
already excludes `tag:tv-skip`, so they leave the rotation.
