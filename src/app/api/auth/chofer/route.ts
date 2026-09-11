import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { COOKIE_OPCIONES, COOKIE_SESION, firmarSesion, verificarPin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/** Retraso fijo, igual que el del admin: que fallar no se note por el reloj. */
const RETRASO_MS = 400;
const MAX_INTENTOS = 5;
const BLOQUEO_MIN = 15;

/**
 * La lista de quién puede entrar.
 *
 * Es pública a propósito —está antes de la sesión— y por eso solo devuelve
 * nombre e id: quién maneja para MAF no es un secreto, y sin esta lista el
 * chofer tendría que teclear su nombre exacto en un teléfono, de pie junto a
 * la camioneta. Nada de aquí sirve para entrar: sin el PIN no se pasa.
 */
export async function GET() {
  const { data, error } = await db()
    .from('contactos')
    .select('id, nombre')
    .contains('roles', ['chofer'])
    .eq('activo', true)
    .not('pin_hash', 'is', null)
    .order('nombre');

  if (error) {
    // Sin la migración de fase8 la columna no existe. Se dice claro en vez de
    // devolver una lista vacía, que parecería "no hay choferes dados de alta".
    return NextResponse.json(
      { error: 'Falta correr supabase/fase8.sql para que los choferes puedan entrar.' },
      { status: 500 }
    );
  }
  return NextResponse.json({ ok: true, data });
}

/**
 * Entrar con nombre y PIN.
 *
 * El PIN se compara contra su huella PBKDF2; en claro no está guardado en
 * ningún lado, ni siquiera para ti. Si se pierde, se pone uno nuevo — no se
 * consulta el viejo.
 *
 * A los cinco fallos la cuenta se bloquea quince minutos. Seis dígitos son un
 * millón de combinaciones: sin este freno, se prueban todas en una tarde.
 */
export async function POST(req: NextRequest) {
  const secreto = process.env.SESSION_SECRET;
  if (!secreto) {
    return NextResponse.json({ error: 'Falta SESSION_SECRET en el entorno.' }, { status: 500 });
  }

  const { contacto_id: contactoId, pin } = await req.json().catch(() => ({}));
  await new Promise((r) => setTimeout(r, RETRASO_MS));

  const generico = NextResponse.json({ error: 'Nombre o PIN incorrecto' }, { status: 401 });
  if (!contactoId || !pin) return generico;

  const sb = db();
  const { data: c } = await sb
    .from('contactos')
    .select('id, nombre, roles, activo, pin_hash, pin_intentos, pin_bloqueado_hasta')
    .eq('id', contactoId)
    .single();

  if (!c || !c.activo || !c.roles?.includes('chofer')) return generico;

  if (c.pin_bloqueado_hasta && new Date(c.pin_bloqueado_hasta) > new Date()) {
    const faltan = Math.ceil((new Date(c.pin_bloqueado_hasta).getTime() - Date.now()) / 60000);
    return NextResponse.json(
      { error: `Demasiados intentos. Vuelve a probar en ${faltan} min.` },
      { status: 429 }
    );
  }

  if (!(await verificarPin(String(pin), c.pin_hash))) {
    const intentos = (c.pin_intentos ?? 0) + 1;
    await sb.from('contactos').update({
      pin_intentos: intentos,
      pin_bloqueado_hasta: intentos >= MAX_INTENTOS
        ? new Date(Date.now() + BLOQUEO_MIN * 60_000).toISOString()
        : null,
    }).eq('id', c.id);
    return generico;
  }

  // Entró: se limpia la cuenta de fallos. Si no, cinco errores repartidos en
  // un mes acabarían bloqueando a alguien que siempre acierta.
  await sb.from('contactos')
    .update({ pin_intentos: 0, pin_bloqueado_hasta: null })
    .eq('id', c.id);

  const res = NextResponse.json({ ok: true, data: { nombre: c.nombre } });
  res.cookies.set(
    COOKIE_SESION,
    await firmarSesion({ rol: 'chofer', cid: c.id, nom: c.nombre }, secreto),
    COOKIE_OPCIONES
  );
  return res;
}
