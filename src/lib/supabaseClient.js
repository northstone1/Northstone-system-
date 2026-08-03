import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    "Supabase env vars are missing — copy .env.example to .env.local and fill in your project's URL and anon key."
  );
}

export const supabase = createClient(supabaseUrl ?? "", supabaseAnonKey ?? "");
