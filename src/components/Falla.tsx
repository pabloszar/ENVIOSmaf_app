'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Boton } from '@/components/ui';

/**
 * Lo que se ve cuando una pantalla no pudo armarse.
 *
 * Casi siempre es la base: todas las pantallas leen de Supabase en el
 * servidor, y si no contesta la página truena entera. Sin esto, Next pinta su
 * pantalla genérica —o nada— y quien acaba de meter su contraseña no sabe si
 * se equivocó él o se cayó algo.
 *
 * En producción Next borra el mensaje de los errores del servidor y deja solo
 * el `digest`, para no filtrar detalles internos. Por eso el texto no depende
 * del mensaje: dice lo que casi siempre es y enseña el digest, que es lo que
 * se busca en los logs de Vercel.
 */
export default function Falla({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const router = useRouter();
  const [reintentando, setReintentando] = useState(false);
  const esConexion = /fetch failed|ENOTFOUND|ECONNREFUSED|network/i.test(error.message);

  function reintentar() {
    setReintentando(true);
    // `reset` solo vuelve a pintar lo del cliente; lo que falló vive en el
    // servidor, y ese solo se vuelve a pedir con `refresh`.
    router.refresh();
    reset();
    setTimeout(() => setReintentando(false), 1200);
  }

  return (
    <div className="entra mx-auto flex min-h-[60vh] max-w-md flex-col justify-center px-6 py-16">
      <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-bad/10 text-lg font-medium text-bad">!</span>
      <p className="etiqueta mt-6">Sin conexión con la base</p>
      <h1 className="mt-2 text-2xl font-medium tracking-tight">No se pudo cargar esta pantalla</h1>
      <p className="mt-3 text-sm leading-relaxed text-ink-soft">
        {esConexion
          ? 'El servidor no logró comunicarse con la base de datos. Tu sesión está bien; lo que no responde es Supabase.'
          : 'Algo falló al leer la información. Si pasa en todas las pantallas, lo más probable es que la base de datos no esté respondiendo.'}
      </p>
      <p className="mt-2 text-sm leading-relaxed text-ink-mute">
        Revisa en el panel de Supabase que el proyecto esté activo; los gratuitos se pausan tras una semana sin uso.
      </p>
      <div className="mt-7 flex items-center gap-3">
        <Boton onClick={reintentar} disabled={reintentando}>
          {reintentando ? 'Reintentando…' : 'Reintentar'}
        </Boton>
        {error.digest && <span className="cifra text-[11px] text-ink-mute">ref · {error.digest}</span>}
      </div>
    </div>
  );
}
