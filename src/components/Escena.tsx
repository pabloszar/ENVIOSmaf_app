'use client';

import { usePathname } from 'next/navigation';

/**
 * Cada pantalla entra, no aparece.
 *
 * Es un envoltorio con `key` en la ruta: al cambiar de sección React desmonta
 * lo anterior y monta lo nuevo, y la animación vuelve a correr. Sin la `key`
 * el DOM se reutiliza, la clase ya está puesta y no se ve nada — que es el
 * error clásico de intentar animar una navegación en el App Router.
 *
 * Dura 320 ms y no más. La ceremonia vive en el umbral, que pasa una vez cada
 * treinta días; aquí se cambia de pantalla cincuenta veces al día, y a la
 * tercera una animación de medio segundo deja de ser elegante y empieza a
 * estorbar. Lo que se busca no es que se note: es que la pantalla se sienta
 * armada en vez de volcada.
 *
 * Se queda con la `key` del `pathname` y no de los parámetros: cambiar el
 * filtro del tablero refresca los datos sin volver a montar la pantalla, y
 * ahí las cifras ya cuentan solas desde su valor anterior.
 */
export default function Escena({ children }: { children: React.ReactNode }) {
  const ruta = usePathname();
  return <div key={ruta} className="escena entra">{children}</div>;
}
