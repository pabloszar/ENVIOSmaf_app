import { db } from '@/lib/db';
import Contactos from './Contactos';
import type { Contacto } from '@/types';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const { data } = await db()
    .from('contactos').select('*').order('activo', { ascending: false }).order('nombre');
  return <Contactos contactos={(data ?? []) as Contacto[]} />;
}
