import { db } from '@/lib/db';
import { conManejo, faltaColumna } from '@/lib/api';
import { calcularTrayecto } from '@/lib/geo';

export const dynamic = 'force-dynamic';

/**
 * Recalcula el recorrido de una ruta que ya existe y lo guarda.
 *
 * Solo cuentan las paradas ubicadas. Una ruta a medio ubicar daría un
 * kilometraje que parece completo y no lo es, así que se responde cuántas
 * quedaron fuera para poder decirlo en pantalla.
 *
 * `km_manual` protege lo escrito a mano: si alguien corrigió el kilometraje,
 * ese número gana. El calculado se guarda igual en `km_osrm`, para poder
 * comparar sin destruir el dato bueno.
 */
export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  return conManejo(async () => {
    const { forzar } = await req.json().catch(() => ({ forzar: false })) as { forzar?: boolean };
    const sb = db();

    // `km_manual` llega con fase7; sin ella se pide solo lo que ya existe.
    let cab = await sb.from('rutas').select('id, roundtrip, km_manual').eq('id', params.id).single();
    if (cab.error && faltaColumna(cab.error.message)) {
      cab = await sb.from('rutas').select('id, roundtrip').eq('id', params.id).single();
    }
    const ruta = cab.data as { roundtrip: boolean | null; km_manual?: boolean } | null;
    if (!ruta) throw new Error('Esa ruta ya no existe.');

    const { data: envios } = await sb
      .from('envios').select('id, secuencia, lat, lng').eq('ruta_id', params.id).order('secuencia');

    const todas = envios ?? [];
    const ubicadas = todas.filter((e) => e.lat != null && e.lng != null);
    if (ubicadas.length === 0) {
      throw new Error('Ninguna misión tiene ubicación todavía.');
    }

    const t = await calcularTrayecto(
      ubicadas.map((e) => ({ lat: Number(e.lat), lng: Number(e.lng) })),
      ruta.roundtrip ?? true
    );

    // Cada parada se queda con el tramo que la trajo desde la anterior. Así la
    // suma de los tramos sigue siendo el viaje, que es lo que la app ya
    // suponía cuando los kilómetros se escribían parada por parada.
    const enOrden = t.orden.map((i) => ubicadas[i]);
    await Promise.all(enOrden.map((e, i) =>
      sb.from('envios').update({
        secuencia: i + 1,
        distancia_km: t.tramos[i] ?? null,
      }).eq('id', e.id)));

    // Las que no tienen ubicación van al final, para no dejar huecos ni dos
    // paradas con el mismo número.
    const sinUbicar = todas.filter((e) => e.lat == null || e.lng == null);
    await Promise.all(sinUbicar.map((e, i) =>
      sb.from('envios').update({ secuencia: enOrden.length + i + 1 }).eq('id', e.id)));

    const respetarManual = Boolean(ruta.km_manual) && !forzar;
    const cambios: Record<string, unknown> = {
      km_osrm: t.km,
      orden_optimo: enOrden.map((e) => e.id),
    };
    if (!respetarManual) cambios.km_total = t.km;

    // Los campos de fase7 van en un segundo intento: sin la migración, el
    // recorrido igual se traza y los kilómetros igual se guardan.
    let r = await sb.from('rutas').update({
      ...cambios,
      trayecto: { linea: t.linea, minutos: t.minutos, roundtrip: t.roundtrip },
      ...(respetarManual ? {} : { km_manual: false }),
    }).eq('id', params.id);
    if (r.error && faltaColumna(r.error.message)) {
      r = await sb.from('rutas').update(cambios).eq('id', params.id);
    }
    if (r.error) throw new Error(r.error.message);

    return {
      km: t.km,
      minutos: t.minutos,
      roundtrip: t.roundtrip,
      paradas_ubicadas: ubicadas.length,
      paradas_sin_ubicar: sinUbicar.length,
      km_conservado: respetarManual,
    };
  });
}
