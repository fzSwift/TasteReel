import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey =
  process.env.EXPO_PUBLIC_SUPABASE_KEY ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Set EXPO_PUBLIC_OFFLINE_DEMO=1 in `.env.local` (or EAS preview) to force no Supabase client:
 * mock data, no login gate, role chips on Account — best for a quick Expo Go / tunnel demo.
 */
export const isOfflineDemoForced =
  process.env.EXPO_PUBLIC_OFFLINE_DEMO === "1" || process.env.EXPO_PUBLIC_OFFLINE_DEMO === "true";

export const supabase: SupabaseClient | null =
  isOfflineDemoForced || !supabaseUrl || !supabaseKey
    ? null
    : createClient(supabaseUrl, supabaseKey, {
        auth: {
          storage: AsyncStorage,
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: false,
        },
      });
