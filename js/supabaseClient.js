// ============================================================
// Fill these in with your own Supabase project's values.
// Dashboard → Project Settings → API
// The "anon public" key is safe to use in client-side code.
// ============================================================
export const SUPABASE_URL = "https://dwjzxyrycfcvjaymgwzx.supabase.co";
export const SUPABASE_ANON_KEY = "sb_publishable_pYkUSmfz5a29xy7gTA6K0w_osSv8Hbh";

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
