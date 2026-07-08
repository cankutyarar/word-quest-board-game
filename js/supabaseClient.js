// ============================================================
// Fill these in with your own Supabase project's values.
// Dashboard → Project Settings → API
// The "anon public" key is safe to use in client-side code.
// ============================================================
export const SUPABASE_URL = "https://YOUR-PROJECT-REF.supabase.co";
export const SUPABASE_ANON_KEY = "YOUR-ANON-PUBLIC-KEY";

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
