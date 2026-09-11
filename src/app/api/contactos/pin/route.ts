import { db } from '@/lib/db';
import { conManejo } from '@/lib/api';
import { hashearPin, pinValido, PIN_MAX, PIN_MIN } from '@/lib/auth';
import { sesionActual } from '@/lib/sesion';

export const dynamic = 'force-dynamic';

/**
 * El PIN con el que un chofer entra a `/chofer`.
 *
 * Solo el admin lo pone. El middleware ya no deja pasar aquí a un chofer, pero
 * se vuelve a comprobar: si mañana alguien mueve ese archivo y afloja una
 * regla, la puerta que abre esto no puede quedar dependiendo de eso — un
 * chofer que se pusiera PIN a sí mismo entraría como cualquier otro.
 *
 * Se guarda la huella, nunca el PIN. Eso significa que un PIN olvidado no se
 * consulta: se pone uno nuevo. Es la mitad incómoda de que ni tú puedas leerlo.
 */
async function soloAdmin() {
  const s = await sesionActual();
  if (s?.rol !== 'admin') throw new Error('Solo el administrador pone los PIN.');
}

export async function PUT(req: Request) {
  return conManejo(async () => {
    await soloAdmin();
    const { id, pin } = (await req.json()) as { id?: string; pin?: string };
    if (!id) throw new Error('Falta el contacto.');
    if (!pinValido(String(pin ?? ''))) {
      throw new Error(`El PIN son entre ${PIN_MIN} y ${PIN_MAX} dígitos, sin letras.`);
    }

    const sb = db();
    const { data: c } = await sb.from('contactos').select('roles').eq('id', id).single();
    if (!c) throw new Error('Ese contacto no existe.');
    if (!c.roles?.includes('chofer')) {
      throw new Error('Solo quien tiene el rol de chofer puede entrar a la app de choferes.');
    }

    const { error } = await sb.from('contactos').update({
      pin_hash: await hashearPin(String(pin)),
      // El PIN nuevo estrena cuenta de intentos: si no, alguien bloqueado
      // seguiría bloqueado justo después de que le cambiaste el PIN.
      pin_intentos: 0,
      pin_bloqueado_hasta: null,
    }).eq('id', id);
    if (error) throw new Error(error.message);

    return { id, tiene_pin: true };
  });
}

/** Quitarle el acceso. Es lo que se hace cuando alguien deja de manejar. */
export async function DELETE(req: Request) {
  return conManejo(async () => {
    await soloAdmin();
    const { id } = (await req.json()) as { id?: string };
    if (!id) throw new Error('Falta el contacto.');

    const { error } = await db().from('contactos').update({
      pin_hash: null, pin_intentos: 0, pin_bloqueado_hasta: null,
    }).eq('id', id);
    if (error) throw new Error(error.message);

    // Sale de inmediato, también del teléfono que ya tenía sesión abierta:
    // `exigirChofer` comprueba contra la base en cada pantalla y en cada
    // guardado, y sin `pin_hash` deja de pasar. La cookie sigue firmada pero ya
    // no abre nada.
    return { id, tiene_pin: false };
  });
}
