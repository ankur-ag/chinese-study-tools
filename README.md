# Chinese Study Tools

A small website of tools my teachers and I use to keep my Chinese studying on
track. Static pages + a few Vercel serverless functions.

## Structure

```
index.html            home page listing the tools
word-review/          Tool: teachers 👍/👎 the words about to enter my rotation
vocab-ingest/         Tool: paste class vocab -> study list -> Anki TODO cards
api/                  Serverless functions (shared): vote.js, state.js, ingest.js, tocfl.js, _redis.js
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

## Vocab ingest → Anki

Paste class words at `/vocab-ingest/`, Save, then with Anki open:

```bash
./ingest_vocab.py --url https://<your-app>.vercel.app
```

Creates TODO cards in `Chinese::Todo` with pinyin + meaning looked up locally,
skipping words already in your collection, and clears the pending list.

## Enable in TOCFL (vocab-ingest → existing cards)

On `/vocab-ingest/`, select words and **Add to TOCFL** — this only *enables*
(unsuspends) cards that already exist; words with no card are reported as
failed. With Anki open:

```bash
./enable_in_tocfl.py --url https://<your-app>.vercel.app
```

It never creates cards. Results flow back to the page, sorting words into
Enabled / Failed piles. Failed (new) words can then be saved to the study list
and turned into TODO cards with ingest_vocab.py.

