import { conManejo } from '@/lib/api';
import { buscarLugar, nombrarPunto } from '@/lib/geo';

export const dynamic = 'force-dynamic';

/**
 * Buscar un destino, o saber qué hay en un punto del mapa.
 *
 * Pasa por aquí y no directo desde el navegador porque Nominatim exige
 * identificar quién llama y admite una consulta por segundo: con cada pestaña
 * pidiendo por su cuenta no habría forma de respetar ninguna de las dos cosas,
 * y el castigo es un bloqueo por IP.
 */
export async function GET(req: Request) {
  return conManejo(async () => {
    const url = new URL(req.url);
    const lat = url.searchParams.get('lat');
    const lng = url.searchParams.get('lng');

    // Con coordenadas la pregunta es la inversa: el pin ya está puesto y lo
    // que falta es cómo se llama ese lugar.
    if (lat && lng) {
      const lugar = await nombrarPunto(Number(lat), Number(lng));
      return lugar ? [lugar] : [];
    }

    return buscarLugar(url.searchParams.get('q') ?? '');
  });
}
