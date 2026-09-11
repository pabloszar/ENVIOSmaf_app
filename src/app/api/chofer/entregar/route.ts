import { db } from '@/lib/db';
import { conManejo } from '@/lib/api';
import { envioDelChofer, exigirChofer } from '@/lib/sesion';

export const dynamic = 'force-dynamic';

/**
 * "Esta ya la entregué".
 *
 * Marca el envío, no la ruta. Y no cierra nada: `rutas.estado = 'entregada'`
 * congela los porcentajes y genera las comisiones, y eso no puede dispararlo
 * un teléfono en la calle. El chofer reporta hechos; los libros los cierra
 * quien los lleva.
 *
 * Lo que sí hace es mover la ruta a `en_curso` en cuanto cae la primera
 * entrega: el viaje evidentemente empezó, y verlo todavía en "agendada"
 * mientras el chofer va de regreso no le sirve a nadie. `en_curso` no toca
 * ninguna cifra.
 *
 * Se puede desmarcar. Se palomea con una mano, en la calle, y equivocarse de
 * renglón es cuestión de tiempo; sin vuelta atrás habría que llamarte por
 * teléfono para arreglar un dedazo.
 */
export async function POST(req: Request) {
  return conManejo(async () => {
    const { contactoId } = await exigirChofer();
    const { envio_id: envioId, entregada = true } = (await req.json()) as {
      envio_id?: string; entregada?: boolean;
    };
    if (!envioId) throw new Error('Falta la misión.');

    const rutaId = await envioDelChofer(envioId, contactoId);
    const sb = db();

    const { data: ruta } = await sb.from('rutas').select('estado').eq('id', rutaId).single();
    if (ruta?.estado === 'entregada') {
      throw new Error('Este viaje ya se cerró. Háblale al administrador si algo quedó mal.');
    }

    const { error } = await sb.from('envios').update({
      entregado_en: entregada ? new Date().toISOString() : null,
      entregado_por: entregada ? contactoId : null,
    }).eq('id', envioId);
    if (error) throw new Error(error.message);

    if (entregada && (ruta?.estado === 'agendada' || ruta?.estado === 'cotizada')) {
      await sb.from('rutas').update({ estado: 'en_curso' }).eq('id', rutaId);
    }

    // Cuántas faltan: es lo único que la pantalla necesita saber después.
    const { data: hermanas } = await sb
      .from('envios').select('id, entregado_en').eq('ruta_id', rutaId);
    const faltan = (hermanas ?? []).filter((e) => !e.entregado_en).length;

    return { envio_id: envioId, entregada, faltan_en_la_ruta: faltan };
  });
}
