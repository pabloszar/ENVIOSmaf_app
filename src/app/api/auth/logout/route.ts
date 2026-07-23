import { NextResponse } from 'next/server';
import { COOKIE_SESION } from '@/lib/auth';

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_SESION, '', { path: '/', maxAge: 0 });
  return res;
}
