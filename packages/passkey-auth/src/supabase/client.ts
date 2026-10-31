// supabase-js-Client, der das Passkey-Access-Token als Third-Party-JWT sendet.
import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient, SupabaseClientOptions } from '@supabase/supabase-js';
import type { PasskeyAuthClient } from '../shared/types.ts';

export function createPasskeySupabaseClient(
  auth: Pick<PasskeyAuthClient, 'getAccessToken'>,
  url: string,
  publishableKey: string,
  options?: SupabaseClientOptions<'public'>,
): SupabaseClient {
  // Option akzeptiert () => Promise<string | null>; null = anonym (publishable key)
  return createClient(url, publishableKey, {
    ...options,
    accessToken: async () => (await auth.getAccessToken()) ?? null,
  });
}
