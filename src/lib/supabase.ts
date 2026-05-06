import { createBrowserClient } from '@supabase/ssr';

export const createClient = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  
  if (!url || !key) {
    // Return a dummy client or handle the error gracefully during build
    console.warn("Supabase credentials missing. Client might not work correctly.");
  }
  
  return createBrowserClient(url, key);
};

