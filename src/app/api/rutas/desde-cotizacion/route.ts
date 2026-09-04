import { db } from '@/lib/db';
import { conManejo, faltaColumna } from '@/lib/api';
import { calcularTrayecto } from '@/lib/geo';

export const dynamic = 'force-dynamic';

interface ParadaCotizada {
  destino?: string;
  lat?: number;
  lng?: number;
  zona?: string | null;
  precio?: number | string;
  tamano_carga?: string | null;
  cliente_id?: string | null;
  vendedor_id?: string | null;
  notas?: string | null;
}

/**
 * Convierte una cotización en una ruta agendada.
 *
 * Es un solo endpoint y no "crear ruta + crear cada parada" desde el navegador
 * por dos razones. La primera es que a medio camino quedaría una ruta con
 * paradas incompletas y nadie sabría cuáles faltan. La segunda es el
 * kilometraje: al alta normal de una parada le suma a la ruta los kilómetros
 * que esa parada aporta, y aquí el total ya viene calculado sobre el recorrido
 * real — sumarlo otra vez lo duplicaría.
 *
 * El orden de visita lo decide el recorrido, no el orden en que se capturaron:
 * el cotizador ya muestra ese orden, y guardarlo distinto haría que la ruta
 * abriera diciendo algo diferente de lo que se aprobó.
 */
export async function POST(req: Request) {
  return conManejo(async () => {
    const cuerpo = (await req.json()) as {
      fecha?: string; vehiculo_id?: string | null; roundtrip?: boolean;
      notas?: string | null; paradas?: ParadaCotizada[];
    };

    const paradas = (cuerpo.paradas ?? []).filter(
      (p) => Number.isFinite(p?.lat) && Number.isFinite(p?.lng) && String(p?.destino ?? '').trim());
    if (paradas.length === 0) throw new Error('La cotización no tiene misiones ubicadas.');
    if (paradas.length > 12) throw new Error('Son demasiadas misiones para un solo viaje.');

    const roundtrip = cuerpo.roundtrip ?? true;
    const t = await calcularTrayecto(
      paradas.map((p) => ({ lat: p.lat!, lng: p.lng! })), roundtrip);

    const sb = db();
    const base = {
      fecha: cuerpo.fecha ?? new Date().toISOString().slice(0, 10),
      estado: 'agendada',
      vehiculo_id: cuerpo.vehiculo_id || null,
      km_total: t.km,
      km_osrm: t.km,
      roundtrip,
      orden_optimo: t.orden,
      notas: cuerpo.notas || null,
    };

    // `trayecto` llega con fase7. Sin ella la ruta se crea igual y solo se
    // queda sin el dibujo guardado, que se puede rehacer con Recalcular.
    let creada = await sb.from('rutas')
      .insert({ ...base, trayecto: { linea: t.linea, minutos: t.minutos, roundtrip } })
      .select().single();
    if (creada.error && faltaColumna(creada.error.message)) {
      creada = await sb.from('rutas').insert(base).select().single();
    }
    if (creada.error) throw new Error(creada.error.message);
    const ruta = creada.data;

    // En el orden del recorrido, y cada parada con el tramo que la trajo desde
    // la anterior: así la suma de los tramos sigue siendo el viaje.
    const filas = t.orden.map((indice, i) => {
      const p = paradas[indice];
      return {
        ruta_id: ruta.id,
        secuencia: i + 1,
        destino: String(p.destino).trim(),
        lat: p.lat, lng: p.lng,
        zona: p.zona || null,
        distancia_km: t.tramos[i] ?? null,
        precio: Number(p.precio ?? 0) || 0,
        tamano_carga: p.tamano_carga || null,
        cliente_id: p.cliente_id || null,
        vendedor_id: p.vendedor_id || null,
        uso_cotizador: true,
        notas: p.notas || null,
      };
    });

    const { error: eEnvios } = await sb.from('envios').insert(filas);
    if (eEnvios) {
      // Una ruta vacía no le sirve a nadie y quedaría suelta en la lista
      // pareciendo un viaje real. Mejor deshacerla y devolver el error.
      await sb.from('rutas').delete().eq('id', ruta.id);
      throw new Error(eEnvios.message);
    }

    return {
      ruta_id: ruta.id, folio: ruta.folio,
      paradas: filas.length, km: t.km, minutos: t.minutos,
    };
  });
}
