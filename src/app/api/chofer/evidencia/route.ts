import { db } from '@/lib/db';
import { conManejo } from '@/lib/api';
import { envioDelChofer, exigirChofer } from '@/lib/sesion';
import { BUCKET_EVIDENCIAS as BUCKET } from '@/lib/evidencias';
import { randomUUID } from 'crypto';

export const dynamic = 'force-dynamic';

/** 15 MB, como el de admin. Una foto de celular comprimida pesa ~200 KB. */
const MAX_BYTES = 15 * 1024 * 1024;
const TIPOS_OK = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

/**
 * La foto de la entrega.
 *
 * Endpoint propio en vez de abrirle `/api/adjuntos` al chofer: aquel acepta
 * `gasto_id`, `envio_id` o `ruta_id`, y dejarlo pasar por el middleware sería
 * darle una llave que abre tres puertas cuando solo necesita una. Aquí el
 * dueño no se recibe, se deduce — la misión que se le comprueba.
 *
 * Solo imágenes: los PDFs son para las facturas y los tickets de gasto, que se
 * capturan en el escritorio. Lo que el chofer trae es la foto del mueble en la
 * puerta del cliente.
 */
export async function POST(req: Request) {
  return conManejo(async () => {
    const { contactoId, nombre } = await exigirChofer();

    const form = await req.formData();
    const archivo = form.get('archivo');
    const envioId = String(form.get('envio_id') ?? '');
    if (!envioId) throw new Error('Falta la misión.');
    if (!(archivo instanceof File)) throw new Error('Falta la foto.');
    if (archivo.size === 0) throw new Error('La foto llegó vacía.');
    if (archivo.size > MAX_BYTES) {
      throw new Error(`La foto pesa ${(archivo.size / 1e6).toFixed(1)} MB y el límite son 15 MB.`);
    }

    const tipo = archivo.type || 'application/octet-stream';
    if (!TIPOS_OK.includes(tipo)) throw new Error('Solo fotos.');

    await envioDelChofer(envioId, contactoId);

    // Nombre nuevo y aleatorio: dos fotos de celular se llaman igual.
    const ext = (archivo.name.split('.').pop() ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const ruta = `envio/${envioId}/${randomUUID()}${ext ? `.${ext}` : ''}`;

    const sb = db();
    const { error: eUp } = await sb.storage.from(BUCKET).upload(
      ruta, await archivo.arrayBuffer(), { contentType: tipo, upsert: false });
    if (eUp) throw new Error(`No se pudo subir: ${eUp.message}`);

    const { data, error } = await sb.from('adjuntos').insert({
      envio_id: envioId,
      ruta_archivo: ruta,
      nombre: archivo.name || 'entrega.jpg',
      tipo_mime: tipo,
      bytes: archivo.size,
      comentario: `Entrega · ${nombre}`,
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
