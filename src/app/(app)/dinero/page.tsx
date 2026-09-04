import { redirect } from 'next/navigation';

/**
 * Dinero ya no es una pantalla sino tres, así que esta ruta solo encamina.
 *
 * Va a "Entra" porque es donde empieza el dinero y donde está la lista que más
 * se consulta: qué se vendió, qué se cobró y quién debe.
 */
export default function Page() {
  redirect('/dinero/entra');
}
