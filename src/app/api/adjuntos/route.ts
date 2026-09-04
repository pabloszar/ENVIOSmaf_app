import { db } from '@/lib/db';
import { conManejo } from '@/lib/api';
import { BUCKET_EVIDENCIAS as BUCKET } from '@/lib/evidencias';
import { randomUUID } from 'crypto';

export const dynamic = 'force-dynamic';

/** 15 MB. Una foto de celular comprimida pesa ~200 KB; esto deja pasar PDFs. */
const MAX_BYTES = 15 * 1024 * 1024;

const TIPOS_OK = [
  'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf',
];

const DUENOS = ['gasto_id', 'envio_id', 'ruta_id'] as const;
type Dueno = (typeof DUENOS)[number];

/**
 * Evidencias: la foto del ticket, la del mueble entregado, el PDF de la
 * factura.
 *
 * El archivo vive en el bucket privado `evidencias` de Supabase Storage y aquí
 * solo queda su ruta. Nunca se sirve desde Storage al navegador: se lee por
 * `/api/adjuntos/<id>/archivo`, que pasa por el middleware y por lo tanto
 * exige sesión. Una URL firmada sería más barata, pero funciona para
 * cualquiera que la tenga y saldría del control de la app en cuanto se pegara
 * en un chat.
 */
export async function GET(req: Request) {
  return conManejo(async () => {
    const url = new URL(req.url);
    let q = db().from('adjuntos').select('*').order('creado_en', { ascending: false });

    let filtrado = false;
    for (const d of DUENOS) {
      const v = url.searchParams.get(d);
      if (v) { q = q.eq(d, v); filtrado = true; }
    }
    // Sin filtro se devolvería el archivero entero por una pantalla que solo
    // necesita los tres adjuntos de un gasto.
    if (!filtrado) throw new Error('Di de qué son los adjuntos.');

    const { data, error } = await q.limit(200);
    if (error) throw new Error(error.message);
    return data;
  });
}

export async function POST(req: Request) {
  return conManejo(async () => {
    const form = await req.formData();
    const archivo = form.get('archivo');
    if (!(archivo instanceof File)) throw new Error('Falta el archivo.');
    if (archivo.size === 0) throw new Error('El archivo está vacío.');
    if (archivo.size > MAX_BYTES) {
      throw new Error(`El archivo pesa ${(archivo.size / 1e6).toFixed(1)} MB y el límite son 15 MB.`);
    }

    const tipo = archivo.type || 'application/octet-stream';
    if (!TIPOS_OK.includes(tipo)) {
      throw new Error('Solo se pueden subir imágenes y PDF.');
    }

    const dueno = DUENOS.find((d) => form.get(d));
    if (!dueno) throw new Error('Di a qué se le adjunta.');
    const duenoId = String(form.get(dueno));

    // Nombre nuevo y aleatorio: dos fotos de celular se llaman igual, y el
    // original solo se guarda para mostrarlo.
    const ext = (archivo.name.split('.').pop() ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const ruta = `${dueno.replace('_id', '')}/${duenoId}/${randomUUID()}${ext ? `.${ext}` : ''}`;

    const sb = db();
    const { error: eUp } = await sb.storage.from(BUCKET).upload(
      ruta, await archivo.arrayBuffer(), { contentType: tipo, upsert: false });
    if (eUp) throw new Error(`No se pudo subir: ${eUp.message}`);

    const { data, error } = await sb.from('adjuntos').insert({
      [dueno]: duenoId,
      ruta_archivo: ruta,
      nombre: archivo.name || 'evidencia',
      tipo_mime: tipo,
      bytes: archivo.size,
      comentario: String(form.get('comentario') ?? '').trim() || null,
    }).select().single();

    // Si la fila no se pudo guardar, el archivo ya subido no le sirve a nadie
    // y solo ocuparía espacio sin forma de encontrarlo.
    if (error) {
      await sb.storage.from(BUCKET).remove([ruta]);
      throw new Error(error.message);
    }
    return data;
  });
}

export async function PATCH(req: Request) {
  return conManejo(async () => {
    const { id, comentario } = (await req.json()) as { id?: string; comentario?: string };
    if (!id) throw new Error('Falta el id.');
    const { data, error } = await db().from('adjuntos')
      .update({ comentario: (comentario ?? '').trim() || null })
      .eq('id', id).select().single();
    if (error) throw new Error(error.message);
    return data;
  });
}

export async function DELETE(req: Request) {
  return conManejo(async () => {
    const { id } = (await req.json()) as { id?: string };
    if (!id) throw new Error('Falta el id.');

    const sb = db();
    const { data: fila } = await sb.from('adjuntos').select('ruta_archivo').eq('id', id).single();

    const { error } = await sb.from('adjuntos').delete().eq('id', id);
    if (error) throw new Error(error.message);
    // Se borra el archivo después de la fila: si el archivo ya no estaba, la
    // fila igual tenía que irse, y al revés dejaría un renglón que apunta a nada.
    if (fila?.ruta_archivo) await sb.storage.from(BUCKET).remove([fila.ruta_archivo]);

    return { eliminado: id };
  });
}
