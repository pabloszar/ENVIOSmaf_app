import { db } from '@/lib/db';
import { errorJson } from '@/lib/api';
import { BUCKET_EVIDENCIAS as BUCKET } from '@/lib/evidencias';

export const dynamic = 'force-dynamic';

/**
 * Sirve la evidencia.
 *
 * Pasa por aquí y no por una URL de Storage para que el middleware la proteja
 * igual que al resto de la app: sin sesión, 401. El archivo se lee con la
 * `service_role` desde el servidor y solo salen los bytes.
 */
export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  const sb = db();
  const { data: fila, error } = await sb
    .from('adjuntos').select('ruta_archivo, nombre, tipo_mime').eq('id', params.id).maybeSingle();
  if (error) return errorJson(error.message, 500);
  if (!fila) return errorJson('Ese adjunto ya no existe.', 404);

  const { data: blob, error: eDown } = await sb.storage.from(BUCKET).download(fila.ruta_archivo);
  if (eDown || !blob) return errorJson('No se pudo leer el archivo.', 502);

  const descargar = new URL(req.url).searchParams.get('descargar') === '1';
  // El nombre va entre comillas y sin comillas dentro: uno con comilla partiría
  // la cabecera y el navegador guardaría el archivo con un nombre truncado.
  const nombre = fila.nombre.replace(/"/g, '');

  return new Response(blob.stream(), {
    headers: {
      'Content-Type': fila.tipo_mime ?? 'application/octet-stream',
      'Content-Disposition': `${descargar ? 'attachment' : 'inline'}; filename="${nombre}"`,
      // Privado: es evidencia con sesión de por medio, no debe quedarse en
      // ninguna caché compartida. Inmutable porque el archivo nunca cambia:
      // editar el comentario no reescribe la foto.
      'Cache-Control': 'private, max-age=31536000, immutable',
    },
  });
}
