/**
 * La sesión, de los dos que entran.
 *
 * Cookie httpOnly firmada con HMAC-SHA256. Usa Web Crypto (no `node:crypto`)
 * para que el mismo código corra en el middleware (runtime edge) y en las
 * API routes.
 *
 * Son dos roles y no dos apps. La cookie ya traía el rol desde el primer día,
 * esperando justo esto. Una app aparte para el chofer habría necesitado la
 * misma `service_role` —la llave que ignora RLS— viviendo en un segundo
 * despliegue, y habría forkeado tipos, modelo y endpoints: dos programas
 * sumando el mismo dinero por su cuenta. La separación que importa es de
 * permiso, y esa se hace aquí.
 *
 * El chofer carga su contacto en la sesión. No es un adorno: es lo único que
 * decide qué rutas puede ver, y por venir firmado no se puede falsear desde
 * el navegador.
 */

export const COOKIE_SESION = 'maf_sesion';
const DURACION_MS = 1000 * 60 * 60 * 24 * 30; // 30 días
/** El chofer trae el teléfono en la calle; que no lo saque la sesión. */
const DURACION_CHOFER_MS = 1000 * 60 * 60 * 24 * 60; // 60 días

export type Rol = 'admin' | 'chofer';

/** Las claves van cortas: esto viaja en una cookie en cada petición. */
export type Sesion =
  | { rol: 'admin'; exp: number }
  | { rol: 'chofer'; cid: string; nom: string; exp: number };

export function esChofer(s: Sesion | null): s is Extract<Sesion, { rol: 'chofer' }> {
  return s?.rol === 'chofer';
}

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

export async function firmarSesion(
  quien: { rol: 'admin' } | { rol: 'chofer'; cid: string; nom: string },
  secreto: string
): Promise<string> {
  const dura = quien.rol === 'chofer' ? DURACION_CHOFER_MS : DURACION_MS;
  const payload = { ...quien, exp: Date.now() + dura } as Sesion;
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
    // Una firma válida con un rol que ya no existe —o un chofer sin contacto—
    // es una cookie vieja de otra versión, no una sesión.
    if (sesion.rol === 'admin') return sesion;
    if (sesion.rol === 'chofer' && typeof sesion.cid === 'string' && sesion.cid) return sesion;
    return null;
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

/* ══════════════════════════════════════════════════════════════════════════
   El PIN del chofer
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * PBKDF2-SHA256, formato `pbkdf2$iteraciones$sal$huella`.
 *
 * Web Crypto y no bcrypt para no arrastrar una dependencia nativa y para que
 * corra igual en edge que en Node, como todo lo de este archivo.
 *
 * Seis dígitos son un millón de combinaciones: para una máquina, nada. Por eso
 * las iteraciones son altas —encarece cada intento— y por eso la cuenta se
 * bloquea a los cinco fallos. El hash solo, sin el bloqueo, no alcanzaría.
 */
const ITERACIONES = 210_000;
export const PIN_MIN = 4;
export const PIN_MAX = 8;

async function derivar(pin: string, sal: Uint8Array, iteraciones: number): Promise<Uint8Array> {
  const base = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: sal as BufferSource, iterations: iteraciones, hash: 'SHA-256' },
    base, 256);
  return new Uint8Array(bits);
}

/** Solo dígitos, y de un largo razonable de teclear con una mano. */
export function pinValido(pin: string): boolean {
  return new RegExp(`^[0-9]{${PIN_MIN},${PIN_MAX}}$`).test(pin);
}

export async function hashearPin(pin: string): Promise<string> {
  const sal = crypto.getRandomValues(new Uint8Array(16));
  const huella = await derivar(pin, sal, ITERACIONES);
  return `pbkdf2$${ITERACIONES}$${b64url(sal)}$${b64url(huella)}`;
}

/**
 * Compara en tiempo constante contra la huella guardada.
 *
 * Lee las iteraciones del propio registro en vez de usar la constante: el día
 * que se suban, los PINes viejos siguen entrando y se pueden rehashear al
 * vuelo, sin obligar a todos a ponerse uno nuevo.
 */
export async function verificarPin(pin: string, guardado: string | null): Promise<boolean> {
  if (!guardado) return false;
  const partes = guardado.split('$');
  if (partes.length !== 4 || partes[0] !== 'pbkdf2') return false;

  const iteraciones = Number(partes[1]);
  if (!Number.isFinite(iteraciones) || iteraciones < 1000) return false;

  try {
    const huella = await derivar(pin, desdeB64url(partes[2]), iteraciones);
    return igualSeguro(b64url(huella), partes[3]);
  } catch {
    return false;
  }
}
