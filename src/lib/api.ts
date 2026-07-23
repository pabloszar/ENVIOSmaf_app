import { NextResponse } from 'next/server';

/** Respuesta de error uniforme para las API routes. */
export function errorJson(mensaje: string, status = 400) {
  return NextResponse.json({ error: mensaje }, { status });
}

/** Envuelve un handler y traduce las excepciones a JSON 500. */
export async function conManejo<T>(fn: () => Promise<T>) {
  try {
    return NextResponse.json({ ok: true, data: await fn() });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error inesperado';
    return errorJson(msg, 500);
  }
}

/** Deja solo las claves permitidas de un objeto (lista blanca de columnas). */
export function soloCampos<T extends Record<string, unknown>>(
  obj: T,
  campos: readonly string[]
): Partial<T> {
  const out: Partial<T> = {};
  for (const c of campos) {
    if (c in obj && obj[c] !== undefined) out[c as keyof T] = obj[c] as T[keyof T];
  }
  return out;
}

/** Convierte '' a null y strings numéricas a número, para inputs de formulario. */
export function limpiarNumericos<T extends Record<string, unknown>>(
  obj: T,
  numericos: readonly string[]
): T {
  const out = { ...obj } as Record<string, unknown>;
  for (const k of numericos) {
    if (!(k in out)) continue; // no tocar campos que no vienen en el body
    if (out[k] === '' || out[k] === null) out[k] = null;
    else if (typeof out[k] === 'string') out[k] = Number(out[k]);
  }
  return out as T;
}
