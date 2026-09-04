'use client';

import { useEffect, useRef, useState } from 'react';

/* ══════════════════════════════════════════════════════════════════════════
   Paneles de vidrio que flotan sobre el mapa

   Los usan el cotizador y el detalle de una ruta. Las dos pantallas tienen el
   mapa de fondo a pantalla completa y el mismo problema: cabe más información
   de la que cabe en pantalla, y desplazar la página se pelea con desplazar el
   mapa. La salida es que cada panel se encoja a una línea que ya diga algo, y
   crezca solo cuando se le acerca el cursor.
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * El cursor lo abre; el clic lo deja fijo.
 *
 * Lo segundo no es un extra: sin ello el panel sería inalcanzable en una
 * pantalla táctil, donde no existe "pasar por encima".
 */
export function useDesplegable(inicial = false, retardo = 0) {
  const [encima, setEncima] = useState(false);
  const [fijo, setFijo] = useState(inicial);
  const reloj = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sin esto, cruzar la lista con el ratón deja media docena de paneles
  // abiertos a su paso —y en los que traen evidencias, media docena de
  // peticiones—. Con el retardo solo se abre el que de verdad se está mirando.
  useEffect(() => () => { if (reloj.current) clearTimeout(reloj.current); }, []);

  return {
    abierto: encima || fijo,
    fijo,
    props: {
      onMouseEnter: () => {
        if (reloj.current) clearTimeout(reloj.current);
        if (retardo) reloj.current = setTimeout(() => setEncima(true), retardo);
        else setEncima(true);
      },
      onMouseLeave: () => {
        if (reloj.current) clearTimeout(reloj.current);
        setEncima(false);
      },
    },
    alternar: () => setFijo((v) => !v),
  };
}

/**
 * El cuerpo que se despliega.
 *
 * Rejilla de `0fr` a `1fr`: anima la altura sin tener que medir el contenido
 * ni fijarle un alto que se rompa cuando la lista crece.
 */
export function Cuerpo({ abierto, siCabe, children }: {
  abierto: boolean;
  /** Nace abierto cuando la ventana es alta. Ver `screens.alto` en Tailwind. */
  siCabe?: boolean;
  children: React.ReactNode;
}) {
  const cerrado = siCabe
    ? 'grid-rows-[0fr] opacity-0 alto:grid-rows-[1fr] alto:opacity-100'
    : 'grid-rows-[0fr] opacity-0';
  return (
    <div className={`grid transition-all duration-200 ease-out ${
      abierto ? 'grid-rows-[1fr] opacity-100' : cerrado}`}>
      <div className="min-h-0 overflow-hidden">{children}</div>
    </div>
  );
}

/**
 * Un panel con cabecera legible y cuerpo que se despliega.
 *
 * La cabecera tiene que decir algo por sí sola —"Gastos · 7 · −$1,184"— y no
 * solo el nombre de lo que hay dentro: si para saber cuánto se gastó hay que
 * abrirlo, plegarlo no ahorró nada, nada más escondió.
 *
 * Con `siCabe` el cuerpo nace abierto en una ventana alta y solo se recoge
 * cuando no hay alto para él. Esconder por costumbre un dato que sí cabía es
 * hacerle perder un clic a quien viene justo a leerlo.
 */
export function Plegable({
  titulo, icono, resumen, cuenta, total, tono, accion, siCabe, material = 'lamina',
  children, className = '',
}: {
  titulo: string;
  /** Marca de la sección: va del color de su papel en el viaje. */
  icono?: React.ReactNode;
  /** La línea que se lee con el panel plegado. */
  resumen?: React.ReactNode;
  cuenta?: number;
  total?: string;
  tono?: 'bueno' | 'aviso' | 'malo';
  /** Botón a la derecha de la cabecera. */
  accion?: React.ReactNode;
  /** Abierto de entrada si la ventana da el alto. */
  siCabe?: boolean;
  /** Encima del mapa, vidrio; en la columna, lámina; en la banda de abajo, honda. */
  material?: 'vidrio' | 'lamina' | 'lamina-honda';
  children: React.ReactNode;
  className?: string;
}) {
  const { abierto, props, alternar } = useDesplegable();
  const color = tono === 'malo' ? 'text-bad' : tono === 'aviso' ? 'text-warn'
    : tono === 'bueno' ? 'text-good' : 'text-ink-soft';

  return (
    <section {...props}
      className={`${material} flex min-h-0 flex-col overflow-hidden ${className}`}>
      <div className="flex shrink-0 items-center">
        <button type="button" onClick={alternar} aria-expanded={abierto}
          className="flex min-w-0 flex-1 items-center gap-2 px-4 py-3 text-left">
          {icono}
          <span className="shrink-0 text-sm font-medium tracking-tight">{titulo}</span>
          {cuenta != null && cuenta > 0 && (
            <span className="shrink-0 rounded-full bg-white/[0.08] px-1.5 py-0.5 text-[11px] text-ink-mute">
              {cuenta}
            </span>
          )}
          {/* El resumen se come el hueco. Sin él va un espaciador, para que el
              total siga pegado a la derecha. */}
          {resumen
            ? <span className="min-w-0 flex-1 truncate text-xs text-ink-mute">{resumen}</span>
            : <span className="flex-1" />}
          {total && <span className={`cifra shrink-0 text-sm ${color}`}>{total}</span>}
          <span aria-hidden className={`shrink-0 text-[11px] text-ink-mute transition-transform
            ${abierto ? 'rotate-180' : siCabe ? 'alto:rotate-180' : ''}`}>▾</span>
        </button>
        {accion && <span className="shrink-0 pr-3">{accion}</span>}
      </div>

      <Cuerpo abierto={abierto} siCabe={siCabe}>
        <div className="border-t border-white/[0.07]">{children}</div>
      </Cuerpo>
    </section>
  );
}

/**
 * La hoja de abajo, en celular.
 *
 * En una pantalla de teléfono no caben los paneles y el mapa a la vez, así que
 * se recogen todos en una hoja que sube desde abajo. Cerrada deja ver el mapa
 * completo y dice lo único que hay que saber de un vistazo; abierta ocupa dos
 * tercios y trae lo mismo que el escritorio.
 */
export function HojaMovil({
  titulo, detalle, cifra, tono, children,
}: {
  titulo: string;
  detalle: string;
  cifra?: string;
  tono?: 'bueno' | 'malo';
  children: React.ReactNode;
}) {
  const [abierta, setAbierta] = useState(false);

  return (
    <div className="pointer-events-auto mt-auto">
      <div className={`vidrio flex flex-col overflow-hidden transition-[max-height] duration-200
        ${abierta ? 'max-h-[68vh]' : 'max-h-[4.5rem]'}`}>
        <button type="button" onClick={() => setAbierta((v) => !v)} aria-expanded={abierta}
          className="flex shrink-0 items-center gap-3 px-4 py-3 text-left">
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs text-ink-soft">{titulo}</span>
            <span className="mt-0.5 block truncate text-[10px] text-ink-mute">{detalle}</span>
          </span>
          {cifra && (
            <span className={`cifra shrink-0 text-lg font-light leading-none ${
              tono === 'malo' ? 'text-bad' : tono === 'bueno' ? 'text-good' : 'text-ink'}`}>
              {cifra}
            </span>
          )}
          <span aria-hidden className={`shrink-0 text-[10px] text-ink-mute transition-transform
            ${abierta ? 'rotate-180' : ''}`}>▾</span>
        </button>

        {/* Los paneles de dentro traen su propio vidrio; aquí van planos para
            no apilar tres capas de desenfoque una sobre otra. */}
        <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto border-t border-white/[0.07]
          px-3 py-3 [&_.vidrio]:border-white/[0.07] [&_.vidrio]:bg-white/[0.03]
          [&_.vidrio]:shadow-none [&_.vidrio]:backdrop-blur-none">
          {children}
        </div>
      </div>
    </div>
  );
}

/**
 * Las dos sombras de los bordes.
 *
 * El texto claro de los paneles necesita algo oscuro detrás cuando debajo cae
 * una zona clara del mapa.
 *
 * El z-900 no es un número al azar: los planos de Leaflet viven en 400 y sus
 * controles en 1000. Por debajo de 400 esto quedaría enterrado bajo el mapa;
 * por encima de 1000 taparía los botones de zoom.
 */
export function BordesOscuros() {
  return (
    <>
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 z-[900] h-48
        bg-gradient-to-b from-black/55 via-black/20 to-transparent" />
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 z-[900] h-48
        bg-gradient-to-t from-black/60 via-black/25 to-transparent" />
    </>
  );
}
