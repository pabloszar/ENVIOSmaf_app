import { NextRequest, NextResponse } from 'next/server';
import { COOKIE_SESION, verificarSesion } from '@/lib/auth';

/**
 * Nadie entra sin sesión, salvo el login y su endpoint.
 * Las peticiones a /api sin sesión devuelven 401 en vez de redirigir.
 */
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const publica = pathname === '/login' || pathname === '/api/auth/login';
  if (publica) return NextResponse.next();

  const secreto = process.env.SESSION_SECRET;
  if (!secreto) {
    return NextResponse.json(
      { error: 'Falta SESSION_SECRET en el entorno.' },
      { status: 500 }
    );
  }

  const sesion = await verificarSesion(req.cookies.get(COOKIE_SESION)?.value, secreto);
  if (sesion) return NextResponse.next();

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }

  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.searchParams.set('destino', pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
};
