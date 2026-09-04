import { conManejo } from '@/lib/api';
import { calcularTrayecto, type Punto } from '@/lib/geo';

export const dynamic = 'force-dynamic';

/**
 * El recorrido de una lista de paradas: cuántos kilómetros, cuánto tiempo, en
 * qué orden conviene visitarlas y por dónde pasa la línea.
 *
 * Es de lectura: no guarda nada. Sirve para el cotizador, donde el viaje
 * todavía no existe y se está armando en pantalla.
 */
export async function POST(req: Request) {
  return conManejo(async () => {
    const cuerpo = (await req.json()) as { paradas?: Punto[]; roundtrip?: boolean };
    const paradas = (cuerpo.paradas ?? []).filter(
      (p) => Number.isFinite(p?.lat) && Number.isFinite(p?.lng));

    // Doce paradas ya es un viaje irreal, y el servicio público de OSRM cobra
    // el optimizador en tiempo: crece con el cuadrado de los puntos.
    if (paradas.length > 12) throw new Error('Son demasiadas misiones para un solo viaje.');

    return calcularTrayecto(paradas, cuerpo.roundtrip ?? true);
  });
}
