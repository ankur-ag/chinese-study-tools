# Chinese Study Tools

A small website of tools my teachers and I use to keep my Chinese studying on
track. Static pages + a few Vercel serverless functions.

## Structure

```
index.html            home page listing the tools
word-review/          Tool: teachers 👍/👎 the words about to enter my rotation
api/                  Serverless functions (shared): vote.js, state.js, _redis.js
```

Add a new tool as `<tool-name>/index.html` and link it from `index.html`.
Shared backend endpoints live in `api/`.

## Deploy (one time, your account)

1. **vercel.com → Add New → Project → import this repo.** Framework preset
   **Other** (no build step). Deploy.
2. In the project: **Storage → Marketplace → Upstash (Redis) → Add → connect to
   this project** (free tier). It auto-adds `KV_REST_API_URL` /
   `KV_REST_API_TOKEN`.
3. **Redeploy** once so the functions pick up the env vars.
4. Share the URL with your teachers.

## Word review → Anki

From the main Anki repo (`utils/widget/`), with Anki open:

```bash
./apply_downvotes.py --url https://<your-app>.vercel.app
```

Tags downvoted words `tv-skip` and suspends them; the screensaver export
excludes `tag:tv-skip`, so they leave the rotation.
