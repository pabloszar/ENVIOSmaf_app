import { NextRequest, NextResponse } from 'next/server';
import { COOKIE_OPCIONES, COOKIE_SESION, firmarSesion, passwordCorrecto } from '@/lib/auth';

/** Retraso fijo para que un intento fallido no revele nada por su duración. */
const RETRASO_MS = 400;

export async function POST(req: NextRequest) {
  const secreto = process.env.SESSION_SECRET;
  const esperado = process.env.ADMIN_PASSWORD;

  if (!secreto || !esperado) {
    return NextResponse.json(
      { error: 'Falta configurar ADMIN_PASSWORD y SESSION_SECRET en .env.local' },
      { status: 500 }
    );
  }

  const { password } = await req.json().catch(() => ({ password: '' }));

  await new Promise((r) => setTimeout(r, RETRASO_MS));

  if (!passwordCorrecto(String(password ?? ''), esperado)) {
    return NextResponse.json({ error: 'Contraseña incorrecta' }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_SESION, await firmarSesion({ rol: 'admin' }, secreto), COOKIE_OPCIONES);
  return res;
}
