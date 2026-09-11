import { cookies } from 'next/headers';
import { db } from '@/lib/db';
import { COOKIE_SESION, verificarSesion, type Sesion } from '@/lib/auth';

/**
 * Quién está pidiendo esto, del lado del servidor.
 *
 * El middleware ya dejó pasar solo a quien tiene sesión válida, pero eso lo
 * hace mirando el camino de la URL. Aquí se lee otra vez la cookie porque lo
 * que hace falta es el CONTACTO del chofer, y ese dato no puede venir del
 * cuerpo de la petición: sería pedirle al navegador que diga quién es.
 *
 * Solo servidor: importa `next/headers` y `@/lib/db`.
 */
export async function sesionActual(): Promise<Sesion | null> {
  const secreto = process.env.SESSION_SECRET;
  if (!secreto) return null;
  return verificarSesion(cookies().get(COOKIE_SESION)?.value, secreto);
}

export interface ChoferEnSesion {
  contactoId: string;
  nombre: string;
}

/**
 * El chofer de la sesión, o se acaba aquí.
 *
 * El admin NO pasa, aunque pueda todo lo demás: no tiene misiones propias, y
 * dejarlo entrar obligaría a decidir qué responderle. Responderle las de todos
 * sería justo la fuga que este archivo existe para tapar. Si quieres ver lo
 * que le aparece a alguien que maneja, entra con su PIN.
 *
 * Vuelve a preguntarle a la base si sigue siendo chofer con PIN, y esa consulta
 * de más es el punto. La cookie va firmada y dura sesenta días: sin este paso,
 * quitarle el PIN a alguien que dejó de manejar no lo sacaría hasta que la
 * sesión expirara sola. Cortarla rotando `SESSION_SECRET` sacaría a todos.
 *
 * El middleware no puede hacer esta comprobación —corre en edge y sería una
 * consulta por cada petición, imágenes incluidas—, pero aquí pasan todas las
 * pantallas del chofer y todo lo que escribe, que es donde importa.
 */
export async function exigirChofer(): Promise<ChoferEnSesion> {
  const s = await sesionActual();
  if (s?.rol !== 'chofer') throw new Error('Entra como chofer para ver tus misiones.');

  const { data } = await db()
    .from('contactos').select('nombre, roles, activo, pin_hash').eq('id', s.cid).single();

  if (!data?.activo || !data.roles?.includes('chofer') || !data.pin_hash) {
    throw new Error('Tu acceso ya no está activo. Habla con el administrador.');
  }
  // El nombre sale de la base y no de la cookie: si se corrigió, la pantalla
  // saluda con el bueno sin tener que volver a entrar.
  return { contactoId: s.cid, nombre: data.nombre };
}

/**
 * Las rutas donde ESE chofer va manejando.
 *
 * Es la frontera de todo lo que puede leer y escribir. Cualquier consulta del
 * chofer se filtra contra esta lista; sin ella, cambiar un id en la URL
 * enseñaría el viaje de otro.
 *
 * Se pregunta por `ruta_tripulacion` y con `rol = 'chofer'`: ir de ayudante en
 * un viaje no da derecho a cobrarlo.
 */
export async function rutasDelChofer(contactoId: string): Promise<string[]> {
  const { data, error } = await db()
    .from('ruta_tripulacion')
    .select('ruta_id')
    .eq('contacto_id', contactoId)
    .eq('rol', 'chofer');
  if (error) throw new Error(error.message);
  return (data ?? []).map((t: { ruta_id: string }) => t.ruta_id);
}

/**
 * ¿Ese envío es de un viaje suyo? Devuelve la ruta, o truena.
 *
 * Lo llaman todos los endpoints que ESCRIBEN. Comprobarlo en cada uno es
 * repetitivo a propósito: el día que alguien agregue un endpoint nuevo y se le
 * olvide, es mejor que truene por no compilar que que pase de largo.
 */
export async function envioDelChofer(envioId: string, contactoId: string): Promise<string> {
  const { data, error } = await db()
    .from('envios').select('id, ruta_id').eq('id', envioId).single();
  if (error || !data) throw new Error('Esa misión no existe.');

  const suyas = await rutasDelChofer(contactoId);
  if (!suyas.includes(data.ruta_id)) throw new Error('Esa misión no es de un viaje tuyo.');
  return data.ruta_id;
}
