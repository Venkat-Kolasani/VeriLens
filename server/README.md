# ProofSnap API

Backend API server for ProofSnap mobile app — powered by **DataHaven blockchain** and **Supabase cloud**.

## Features
- **AI Deepfake Detection** — Proxies to SightEngine API for deepfake & AI-generated content detection
- **Plagiarism Check** — Simulated reverse image / content similarity check
- **Proof Verification** — Endpoint for proof metadata validation with Supabase lookup
- **Proof Feed** — Cloud-synced proof records via Supabase PostgreSQL
- **DataHaven Integration** — Blockchain references for Chain ID 55931

## Setup

```bash
cd server
npm install
npm run dev
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | No | Server port (default: 3001) |
| `SIGHTENGINE_USER` | No | SightEngine API user ID |
| `SIGHTENGINE_SECRET` | No | SightEngine API secret |
| `SUPABASE_URL` | No | Supabase project URL |
| `SUPABASE_KEY` | No | Supabase service role key |

> Without SightEngine credentials, detection returns simulated (but realistic) results.
> Without Supabase credentials, cloud features are disabled but local verification still works.

## Deploy to Render (Free)

1. Push `server/` to a GitHub repo
2. Go to [render.com](https://render.com) → New Web Service
3. Connect repo, set root directory to `server`
4. Build command: `npm install`
5. Start command: `npm start`
6. Add env vars for SightEngine + Supabase (optional)
7. Update `API_BASE_URL` in `constants/Colors.ts` with your Render URL

## API Endpoints

### `GET /api/health`
Returns service status.

### `POST /api/detect`
Upload media for AI analysis.
- Body: `multipart/form-data` with `media` file
- Returns: deepfake score, AI-generated score, quality score

### `POST /api/plagiarism`
Upload media for plagiarism check.
- Body: `multipart/form-data` with `media` file
- Returns: plagiarism score, matches list

### `POST /api/verify`
Verify a proof.
- Body: `{ fileHash, signature, publicKey }`
- Returns: verification metadata + Supabase record if found

### `GET /api/verify/:hash`
Look up a proof by file hash from Supabase.
- Returns: `{ found: true/false, proof: {...} }`

### `GET /api/proofs`
Get recent proof records from Supabase.
- Query: `?limit=20` (max 100)
- Returns: `{ proofs: [...], count: N }`
