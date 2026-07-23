import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Cliente de Supabase con `service_role`. SOLO puede importarse desde código
 * de servidor (API routes, server components, scripts). La key ignora RLS,
 * así que si esto llegara al navegador quedaría expuesta toda la base.
 */

let client: SupabaseClient | null = null;

export function db(): SupabaseClient {
  if (client) return client;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      'Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local. ' +
        'Cópialas del panel de Supabase → Project Settings → API.'
    );
  }

  client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    // Supabase consulta con `fetch`, que Next.js cachea por defecto. Sin esto,
    // tras editar y hacer router.refresh() la página seguiría mostrando los
    // datos viejos (parecería que no se guardó). `no-store` obliga a leer
    // siempre lo último de la base.
    global: {
      fetch: (input: RequestInfo | URL, init?: RequestInit) =>
        fetch(input, { ...init, cache: 'no-store' }),
    },
  });
  return client;
}

/** true si la app tiene credenciales configuradas. */
export function dbConfigurada(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}
