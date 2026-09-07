# Chinese Study Tools

A small website of tools to keep my Chinese studying on track. Static pages +
Vercel serverless functions, backed by Upstash Redis, mirroring my Anki deck.

## Structure

```
index.html            home — tool list + Anki mirror "last synced" indicator
word-review/          next words in deck order → Add (enable on sync) or Skip
vocab-ingest/         paste class vocab → TODO list, split in-Anki / not-in-Anki
fast-lookup/          search the deck, one-tap enable
api/                  cards.js · want.js · ingest.js · skip.js · _redis.js
```

Add a tool as `<tool-name>/index.html` and link it from `index.html`.

## How it fits together

- **Anki is the source of truth.** `sync_anki_upstash.py` (local, needs Anki
  open) pushes a snapshot of the TOCFL deck to `GET /api/cards` — every word
  with `deck / pinyin / meaning / suspended / order`.
- **Tools read `/api/cards`** to show status; they never touch Anki directly.
- **To enable a word**, a tool writes a *want* (`POST /api/want {word,
  action:"unsuspend"}`). The next sync applies it in Anki and clears it.
- **Skips** (`/api/skip`) are parked separately and never unsuspended.
- **`ingest_vocab.py`** turns "not in Anki" ingest words into TODO cards.

## Deploy (one time, your account)

1. vercel.com → Add New → Project → import this repo. Preset **Other**. Deploy.
2. Storage → Marketplace → **Upstash for Redis** → add → connect to the project
   (adds `KV_REST_API_URL` / `KV_REST_API_TOKEN`). **Redeploy** once.

## Sync (Anki must be open)

```bash
./sync_anki_upstash.py --url https://<your-app>.vercel.app   # 2-way: apply wants, push snapshot
./ingest_vocab.py       --url https://<your-app>.vercel.app   # make TODO cards for new words
```
