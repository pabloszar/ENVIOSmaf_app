import { NextRequest, NextResponse } from 'next/server';
import { COOKIE_SESION, verificarSesion } from '@/lib/auth';

/**
 * Nadie entra sin sesión, y cada rol solo a lo suyo.
 *
 * El admin ve todo. El chofer ve `/chofer` y nada más — ni las pantallas de
 * dinero ni los endpoints que las alimentan. Este archivo es la puerta: si un
 * chofer pide `/dinero` o `/api/gastos`, aquí se acaba, antes de que ninguna
 * consulta llegue a tocar la base.
 *
 * Es la mitad del candado, no el candado entero. La otra mitad vive en cada
 * endpoint de `/api/chofer`, que además comprueba que la ruta que se pide sea
 * una de las suyas. Sin eso, un chofer podría leer las misiones de otro con
 * solo cambiar un id en la URL, y esta puerta lo dejaría pasar porque el
 * camino sí es el suyo.
 *
 * Las peticiones a /api sin sesión devuelven 401 en vez de redirigir.
 */

/** Abiertas: son las puertas de entrada, y pedirles sesión sería un círculo. */
const PUBLICAS = ['/login', '/api/auth/login', '/chofer/entrar', '/api/auth/chofer'];

/** Lo único que un chofer puede tocar. Todo lo demás es del admin. */
const DEL_CHOFER = ['/chofer', '/api/chofer', '/api/auth/logout'];

function empieza(pathname: string, prefijos: string[]) {
  return prefijos.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (empieza(pathname, PUBLICAS)) return NextResponse.next();

  const secreto = process.env.SESSION_SECRET;
  if (!secreto) {
    return NextResponse.json(
      { error: 'Falta SESSION_SECRET en el entorno.' },
      { status: 500 }
    );
  }

  const sesion = await verificarSesion(req.cookies.get(COOKIE_SESION)?.value, secreto);

  if (!sesion) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }
    // Cada rol a su propia puerta: mandar a un chofer a la pantalla de
    // contraseña del admin es enseñarle una cerradura que no es la suya.
    const url = req.nextUrl.clone();
    url.pathname = pathname.startsWith('/chofer') ? '/chofer/entrar' : '/login';
    url.searchParams.set('destino', pathname);
    return NextResponse.redirect(url);
  }

  if (sesion.rol === 'chofer' && !empieza(pathname, DEL_CHOFER)) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Esto no es del chofer.' }, { status: 403 });
    }
    return NextResponse.redirect(new URL('/chofer', req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
};
