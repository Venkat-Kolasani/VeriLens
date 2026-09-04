-- ═══════════════════════════════════════════════════════════
--  ProofSnap — Supabase Database Setup
--  Run this in: Supabase Dashboard → SQL Editor → New Query
-- ═══════════════════════════════════════════════════════════

-- 1. Create the proofs table
CREATE TABLE IF NOT EXISTS proofs (
  id TEXT PRIMARY KEY,
  file_hash TEXT NOT NULL,
  signature TEXT NOT NULL,
  public_key TEXT NOT NULL,
  blockchain_tx TEXT,
  block_number BIGINT,
  ai_deepfake_score REAL DEFAULT 0,
  ai_generated_score REAL DEFAULT 0,
  plagiarism_score REAL DEFAULT 0,
  trust_score INTEGER DEFAULT 0,
  trust_grade TEXT DEFAULT 'F',
  file_type TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size BIGINT DEFAULT 0,
  image_url TEXT,
  device_info TEXT,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Enable Row Level Security
ALTER TABLE proofs ENABLE ROW LEVEL SECURITY;

-- 3. Allow anyone to read proofs (for verification)
CREATE POLICY "Proofs are publicly readable" ON proofs
  FOR SELECT USING (true);

-- 4. Allow inserting proofs from anon key
CREATE POLICY "Anyone can insert proofs" ON proofs
  FOR INSERT WITH CHECK (true);

-- 5. Create indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_proofs_file_hash ON proofs(file_hash);
CREATE INDEX IF NOT EXISTS idx_proofs_status ON proofs(status);
CREATE INDEX IF NOT EXISTS idx_proofs_created_at ON proofs(created_at DESC);

-- 6. Create storage bucket for media thumbnails (optional)
INSERT INTO storage.buckets (id, name, public)
VALUES ('media', 'media', true)
ON CONFLICT (id) DO NOTHING;

-- 7. Allow public access to media bucket
CREATE POLICY "Public media access" ON storage.objects
  FOR SELECT USING (bucket_id = 'media');

CREATE POLICY "Anyone can upload media" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'media');

-- ═══════════════════════════════════════════════════════════
--  Done! Now go to Settings → API and copy:
--  - Project URL  → paste in constants/config.ts as SUPABASE_URL
--  - anon key     → paste in constants/config.ts as SUPABASE_ANON_KEY
-- ═══════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════
--  MIGRATION: If the table already exists without image_url, run:
-- ═══════════════════════════════════════════════════════════
-- ALTER TABLE proofs ADD COLUMN IF NOT EXISTS image_url TEXT;
