-- ═══════════════════════════════════════════════════════════
--  VeriLens — KYC Deepfake / AI-Image Detector
--  Supabase Database Setup
--  Run this in: Supabase Dashboard → SQL Editor → New Query
--
--  Safe to re-run: drops and recreates the kyc_cases table.
--  WARNING: re-running deletes existing cases.
-- ═══════════════════════════════════════════════════════════

-- 0. Retire the old proof-of-capture table (pre-KYC schema)
DROP TABLE IF EXISTS proofs;

-- 1. Create the kyc_cases table
DROP TABLE IF EXISTS kyc_cases;

CREATE TABLE IF NOT EXISTS kyc_cases (
  id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  -- Bumped whenever the row changes, including a reviewer's approve/reject.
  -- Without it the audit trail cannot say when a decision was altered.
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Uploaded ID document
  id_image_sha256 TEXT,
  id_image_url TEXT,
  id_image_attested BOOLEAN DEFAULT FALSE,

  -- Uploaded selfie
  selfie_sha256 TEXT,
  selfie_url TEXT,
  selfie_attested BOOLEAN DEFAULT FALSE,

  -- Per-lane detector output: a JSON ARRAY of lane objects (see LaneOut in
  -- lib/forensics.ts), both images' lanes concatenated:
  -- [{"lane":"B","name":"...","score":0.82,"confidence":0.7,"usable":true,
  --   "reasons":["..."],"box":[x,y,w,h]}, {...}]
  lanes JSONB,

  -- Verdicts
  authenticity TEXT CHECK (authenticity IN ('REAL', 'LIKELY_FAKE', 'INSUFFICIENT_EVIDENCE')),
  identity     TEXT CHECK (identity     IN ('MATCH', 'MISMATCH', 'INDETERMINATE')),
  decision     TEXT CHECK (decision     IN ('ACCEPT', 'REJECT', 'REVIEW')),
  confidence   REAL,
  -- False until a held-out calibration set exists; never render the
  -- confidence as a probability while it is false.
  confidence_is_calibrated BOOLEAN DEFAULT FALSE,

  -- Ordered explanation list. severity is one of 'info' | 'warn' | 'critical'
  -- (see VerdictReason in lib/forensics.ts):
  -- [{"lane":"B","text":"...","severity":"critical"}]
  reasons JSONB,

  -- On-chain anchor
  anchor_tx TEXT,
  anchor_block BIGINT,
  anchor_payload_hash TEXT,

  -- Device Ed25519 proof over the image-pair digest
  signature TEXT,
  public_key TEXT,

  -- Manual review outcome (NULL = never sent to review)
  review_status TEXT CHECK (review_status IN ('pending', 'approved', 'rejected')),

  device_info TEXT
);

-- 2. Enable Row Level Security
ALTER TABLE kyc_cases ENABLE ROW LEVEL SECURITY;

-- 3. Policies
--  DEMO-GRADE: the mobile app talks to Supabase with the anon key, so anyone
--  holding it can read and write every case. Fine for a demo, NOT for
--  production — a real deployment needs auth + per-user policies
--  (e.g. USING (auth.uid() = owner_id)) and a separate reviewer role.
DROP POLICY IF EXISTS "KYC cases are publicly readable" ON kyc_cases;
CREATE POLICY "KYC cases are publicly readable" ON kyc_cases
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Anyone can insert KYC cases" ON kyc_cases;
CREATE POLICY "Anyone can insert KYC cases" ON kyc_cases
  FOR INSERT WITH CHECK (true);

-- 4. Create indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_kyc_cases_decision      ON kyc_cases(decision);
CREATE INDEX IF NOT EXISTS idx_kyc_cases_review_status ON kyc_cases(review_status);
CREATE INDEX IF NOT EXISTS idx_kyc_cases_created_at    ON kyc_cases(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_kyc_cases_anchor_tx     ON kyc_cases(anchor_tx);

-- 5. Create storage bucket for ID images and selfies
--  NOTE: renamed from 'media' → 'kyc-media'. lib/supabase.ts must upload here.
INSERT INTO storage.buckets (id, name, public)
VALUES ('kyc-media', 'kyc-media', true)
ON CONFLICT (id) DO NOTHING;

-- 6. Allow public access to the kyc-media bucket
--  DEMO-GRADE: public bucket means ID photos are readable by URL.
--  Production should use a private bucket + signed URLs.
DROP POLICY IF EXISTS "Public kyc-media access" ON storage.objects;
CREATE POLICY "Public kyc-media access" ON storage.objects
  FOR SELECT USING (bucket_id = 'kyc-media');

DROP POLICY IF EXISTS "Anyone can upload kyc-media" ON storage.objects;
CREATE POLICY "Anyone can upload kyc-media" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'kyc-media');

-- ═══════════════════════════════════════════════════════════
--  Done! Now go to Settings → API and copy into .env (NOT into source):
--  - Project URL  → EXPO_PUBLIC_SUPABASE_URL
--  - anon key     → EXPO_PUBLIC_SUPABASE_ANON_KEY
--  Use the anon key only. The service_role key bypasses every policy above
--  and would ship inside the app bundle.
-- ═══════════════════════════════════════════════════════════
