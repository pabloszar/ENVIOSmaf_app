/**
 * Sesión de administrador.
 *
 * Cookie httpOnly firmada con HMAC-SHA256. Usa Web Crypto (no `node:crypto`)
 * para que el mismo código corra en el middleware (runtime edge) y en las
 * API routes.
 *
 * Hoy solo existe el rol `admin`. El payload ya lleva el rol para que agregar
 * chofer o vendedor más adelante no obligue a rediseñar la sesión.
 */

export const COOKIE_SESION = 'maf_sesion';
const DURACION_MS = 1000 * 60 * 60 * 24 * 30; // 30 días

export type Rol = 'admin';
export type Sesion = { rol: Rol; exp: number };

function b64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function desdeB64url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  const bin = atob(pad);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function llave(secreto: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secreto),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

/** Compara dos strings en tiempo constante. */
function igualSeguro(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let dif = 0;
  for (let i = 0; i < a.length; i++) dif |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return dif === 0;
}

export async function firmarSesion(rol: Rol, secreto: string): Promise<string> {
  const payload: Sesion = { rol, exp: Date.now() + DURACION_MS };
  const cuerpo = b64url(new TextEncoder().encode(JSON.stringify(payload)));
  const firma = await crypto.subtle.sign('HMAC', await llave(secreto), new TextEncoder().encode(cuerpo));
  return `${cuerpo}.${b64url(new Uint8Array(firma))}`;
}

/** Devuelve la sesión si el token es válido y no expiró; si no, null. */
export async function verificarSesion(token: string | undefined, secreto: string): Promise<Sesion | null> {
  if (!token) return null;
  const punto = token.lastIndexOf('.');
  if (punto <= 0) return null;

  const cuerpo = token.slice(0, punto);
  const firma = token.slice(punto + 1);

  const esperada = b64url(
    new Uint8Array(
      await crypto.subtle.sign('HMAC', await llave(secreto), new TextEncoder().encode(cuerpo))
    )
  );
  if (!igualSeguro(firma, esperada)) return null;

  try {
    const sesion = JSON.parse(new TextDecoder().decode(desdeB64url(cuerpo))) as Sesion;
    if (typeof sesion.exp !== 'number' || sesion.exp < Date.now()) return null;
    return sesion;
  } catch {
    return null;
  }
}

/** Verifica la contraseña de admin en tiempo constante. */
export function passwordCorrecto(intento: string, real: string | undefined): boolean {
  if (!real) return false;
  return igualSeguro(intento, real);
}

export const COOKIE_OPCIONES = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: DURACION_MS / 1000,
};
