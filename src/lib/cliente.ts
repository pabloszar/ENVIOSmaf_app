'use client';

/** Llama a una API interna y devuelve `data`, o lanza el mensaje de error. */
export async function api<T = unknown>(
  ruta: string,
  opciones?: { method?: string; body?: unknown }
): Promise<T> {
  const res = await fetch(ruta, {
    method: opciones?.method ?? 'GET',
    headers: opciones?.body ? { 'Content-Type': 'application/json' } : undefined,
    body: opciones?.body ? JSON.stringify(opciones.body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) throw new Error(json.error ?? `Error ${res.status}`);
  return json.data as T;
}
