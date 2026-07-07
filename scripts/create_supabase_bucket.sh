#!/usr/bin/env bash
set -euo pipefail

# Create a public Supabase Storage bucket for product images.
# Requires the supabase CLI to be installed and logged in:
#   npm install -g supabase
#   supabase login

BUCKET=${SUPABASE_STORAGE_BUCKET:-product-images}

if ! command -v supabase >/dev/null 2>&1; then
  echo "supabase CLI not found. Install with: npm install -g supabase"
  exit 1
fi

echo "Creating Supabase storage bucket: $BUCKET"
supabase storage create "$BUCKET"

echo "Setting bucket to public"
supabase storage set-public "$BUCKET"

echo "Done. Bucket '$BUCKET' created and set public."

echo "If you use service role keys for uploads, set SUPABASE_URL and SUPABASE_SERVICE_ROLE in your Vercel project."
