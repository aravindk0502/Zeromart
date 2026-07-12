import { createClient } from '@supabase/supabase-js';

const normalizeSupabaseUrl = (value = '') => {
  const raw = String(value || '').trim();
  const match = raw.match(/https?:\/\/[^\]\s)]+/i);
  return String(match ? match[0] : raw)
    .replace(/\/rest\/v1\/?$/i, '')
    .replace(/\/+$/, '');
};

const supabaseUrl = normalizeSupabaseUrl(import.meta.env.VITE_SUPABASE_URL);
const supabaseAnonKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();
const hasPublicAnonKey = Boolean(supabaseAnonKey && !supabaseAnonKey.startsWith('sb_secret_'));

export const isSupabaseConfigured = Boolean(supabaseUrl && hasPublicAnonKey);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    realtime: {
      params: { eventsPerSecond: 5 },
    },
  })
  : null;

export const isOnline = () => isSupabaseConfigured;
