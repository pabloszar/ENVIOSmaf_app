'use client';

import { useState } from 'react';
import { mxn } from '@/lib/pricing';

/**
 * El panorama del dinero, arriba de todo.
 *
 * Todo aquí obedece al filtro, incluida la caja. Es a propósito: la gestión de
 * esta unidad empieza en una fecha concreta y el acumulado desde el primer
 * viaje del Excel no dice nada sobre cómo va la operación de hoy.
 *
 * Eso tiene una consecuencia que hay que sostener con honestidad: un saldo
 * recortado ya no es un saldo, es lo que el periodo generó. Por eso la cifra
 * grande dice "disponible del periodo" y no "en la caja", y por eso cada
 * concepto que deja algo fuera lo declara —"y $X de antes"— en vez de dejar
 * que una deuda vieja desaparezca al mover una fecha.
 *
 * El bloque de abajo no repite al de arriba: es su aritmética. "Quedó" del
 * flujo y "generó el periodo" del encabezado son el mismo número, uno como
 * conclusión y otro como operación.
 */

export interface Saldos {
  /** Entró menos salió, dentro del periodo. */
  generado: number;
  fondoRenta: number;
  comisiones: number;
  teDeben: number;
  cuentasVencidas: number;
  cuentasTotales: number;
  personasConComision: number;
  /** Del dinero que dejó el periodo, cuánto lo trae alguien más. */
  enOtrasManos: number;
  cuentasAbiertas: number;
  /** Lo mismo, pero de antes del periodo: se declara, no se suma. */
  fuera: { fondoRenta: number; comisiones: number; teDeben: number; caja: number };
}

export interface Flujo {
  vendiste: number;
  entro: number;
  salio: number;
  faltaEntrar: number;
}

type Destino = 'cobrar' | 'comisiones' | 'renta' | 'manos' | 'movimientos' | 'gastos' | 'caja';

export default function Panorama({
  saldos, flujo, etiquetaPeriodo, hayFiltro, onIr, seccion,
}: {
  saldos: Saldos;
  flujo: Flujo;
  etiquetaPeriodo: string;
  /** Con "Todo" no hay nada afuera y sobran las aclaraciones. */
  hayFiltro: boolean;
  onIr: (d: Destino) => void;
  seccion: Destino;
}) {
  const [resaltado, setResaltado] = useState<string | null>(null);

  const comprometido = saldos.fondoRenta + saldos.comisiones;
  const disponible = saldos.generado - comprometido;
  const base = Math.max(saldos.generado, comprometido, 1);
  const ancho = (n: number) => `${Math.max(0, (n / base) * 100)}%`;

  const tramos = [
    {
      id: 'libre', etiqueta: 'Tuyo', monto: Math.max(0, disponible),
      color: 'bg-good', texto: 'text-good', destino: 'caja' as Destino,
      explica: 'Lo que el periodo te dejó libre, sin deberle a nadie.',
      fuera: 0,
    },
    {
      id: 'renta', etiqueta: 'Fondo de renta', monto: saldos.fondoRenta,
      color: 'bg-dato', texto: 'text-dato', destino: 'renta' as Destino,
      explica: 'Se le retuvo a los fletes del periodo. Es de Tiendas MAF.',
      fuera: saldos.fuera.fondoRenta,
    },
    {
      id: 'comisiones', etiqueta: 'Comisiones', monto: saldos.comisiones,
      color: 'bg-warn', texto: 'text-warn', destino: 'comisiones' as Destino,
      explica: `Devengadas y sin pagar, de ${saldos.personasConComision} personas.`,
      fuera: saldos.fuera.comisiones,
    },
  ].filter((t) => t.monto > 0);

  // Aparte del reparto por dueño: de lo que es tuyo, cuánto ni siquiera está
  // en tu mano. No es otro dueño, es otro bolsillo — por eso va como nota y no
  // como tramo de la barra.
  const enManos = saldos.enOtrasManos;

  const foco = tramos.find((t) => t.id === resaltado);

  return (
    <div className="space-y-4">
      {/* ══ La conclusión ══ */}
      <section className="tarjeta">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <p className="etiqueta">Cómo vas · {etiquetaPeriodo}</p>
          {hayFiltro && saldos.fuera.caja !== 0 && (
            <p className="text-[11px] text-ink-mute">
              Antes del periodo la operación dejó {mxn(saldos.fuera.caja)}, que no se cuenta aquí.
            </p>
          )}
        </div>

        <div className="mt-5 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
          <div>
            <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
              <div>
                <p className="etiqueta">Tuyo y disponible</p>
                <p className={`cifra mt-1.5 text-5xl font-light leading-none tracking-tight
                  ${disponible < 0 ? 'text-bad' : 'text-good'}`}>
                  {mxn(disponible)}
                </p>
              </div>
              <p className="max-w-xs text-sm leading-relaxed text-ink-mute">
                {comprometido > 0 ? (
                  <>El periodo dejó <span className="cifra text-ink-soft">{mxn(saldos.generado)}</span>,
                  pero <span className="cifra text-ink-soft">{mxn(comprometido)}</span> ya tienen dueño.</>
                ) : (
                  <>Los <span className="cifra text-ink-soft">{mxn(saldos.generado)}</span> que dejó el
                  periodo son tuyos: no debes comisiones ni renta.</>
                )}
              </p>
            </div>

            {/* Lo generado, partido por dueño. Cada tramo lleva a su sección. */}
            <div className="mt-6 flex h-4 gap-1 overflow-hidden rounded-full">
              {tramos.map((t) => (
                <button key={t.id} type="button" style={{ width: ancho(t.monto) }}
                  onMouseEnter={() => setResaltado(t.id)}
                  onMouseLeave={() => setResaltado(null)}
                  onFocus={() => setResaltado(t.id)}
                  onBlur={() => setResaltado(null)}
                  onClick={() => onIr(t.destino)}
                  aria-label={`${t.etiqueta}: ${mxn(t.monto)}`}
                  className={`h-full rounded-full transition ${t.color}
                    ${resaltado && resaltado !== t.id ? 'opacity-30' : 'opacity-100'}`} />
              ))}
            </div>

            <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
              {tramos.map((t) => (
                <button key={t.id} type="button"
                  onMouseEnter={() => setResaltado(t.id)}
                  onMouseLeave={() => setResaltado(null)}
                  onClick={() => onIr(t.destino)}
                  className={`flex items-baseline gap-2 text-left transition
                    ${resaltado && resaltado !== t.id ? 'opacity-40' : ''}`}>
                  <span aria-hidden className={`h-2 w-2 shrink-0 translate-y-[-1px] rounded-full ${t.color}`} />
                  <span className="text-xs text-ink-mute">{t.etiqueta}</span>
                  <span className={`cifra text-sm font-medium ${t.texto}`}>{mxn(t.monto)}</span>
                </button>
              ))}
            </div>

            {/* Una línea que cambia con lo que estés señalando, y que declara
                lo que ese concepto arrastra de antes del periodo. */}
            <p className="mt-3 min-h-[1.25rem] text-xs text-ink-mute">
              {foco ? (
                <>
                  {foco.explica}
                  {hayFiltro && foco.fuera > 0 && (
                    <span className="text-warn"> Además hay {mxn(foco.fuera)} de antes del periodo.</span>
                  )}
                </>
              ) : 'Pasa el cursor por un tramo para ver de quién es.'}
            </p>

            {enManos > 0 && (
              <button type="button" onClick={() => onIr('manos')}
                className="mt-3 flex w-full items-center justify-between gap-3 rounded-xl border
                  border-warn/25 bg-warn/[0.06] px-3.5 py-2.5 text-left transition hover:border-warn/40">
                <span className="text-xs leading-relaxed text-ink-soft">
                  <span className="cifra font-medium text-warn">{mxn(enManos)}</span> de ese dinero
                  no está en tu caja: lo trae alguien más
                  {saldos.cuentasAbiertas > 0 && ` (${saldos.cuentasAbiertas} ${saldos.cuentasAbiertas === 1 ? 'cuenta' : 'cuentas'})`}.
                </span>
                <span className="shrink-0 text-xs text-warn">Ver →</span>
              </button>
            )}
          </div>

          {/* Lo que está por entrar: aparte, porque NO está en la caja. */}
          <button type="button" onClick={() => onIr('cobrar')}
            className={`rounded-2xl border p-5 text-left transition
              ${seccion === 'cobrar' ? 'border-brand/40 bg-brand/[0.06]' : 'border-white/[0.07] bg-white/[0.02] hover:border-white/20'}`}>
            <p className="etiqueta">Te deben</p>
            <p className={`cifra mt-1.5 text-4xl font-light leading-none tracking-tight
              ${saldos.cuentasVencidas > 0 ? 'text-bad' : 'text-ink'}`}>
              {mxn(saldos.teDeben)}
            </p>
            <p className="mt-2.5 text-sm leading-relaxed text-ink-mute">
              {saldos.cuentasTotales === 0
                ? 'Nadie te debe de este periodo: todo se cobró al entregar.'
                : <>Clientes a crédito con saldo{saldos.cuentasVencidas > 0 && (
                    <>, <span className="text-bad">{saldos.cuentasVencidas} ya vencidos</span></>
                  )}. Este dinero <span className="text-ink-soft">no está en la caja</span> todavía.</>}
            </p>
            {hayFiltro && saldos.fuera.teDeben > 0 && (
              <p className="mt-2 text-xs text-warn">
                Y {mxn(saldos.fuera.teDeben)} más de viajes anteriores al periodo.
              </p>
            )}
            <p className="mt-3 text-xs text-brand">Ver quién debe →</p>
          </button>
        </div>
      </section>

      {/* ══ La aritmética ══ */}
      <section className="tarjeta">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <p className="etiqueta">De dónde salió</p>
          <p className="text-[11px] text-ink-mute">Los movimientos del periodo, en orden.</p>
        </div>

        <div className="mt-4 flex flex-wrap items-stretch gap-y-4">
          <Paso etiqueta="Vendiste" monto={flujo.vendiste}
            nota={flujo.faltaEntrar > 0 ? `${mxn(flujo.faltaEntrar)} de esto aún no entra` : 'todo ya entró'} />
          <Flecha />
          <Paso etiqueta="Entró" monto={flujo.entro} tono="bueno"
            nota="ver el detalle renglón por renglón" onIr={() => onIr('movimientos')} />
          <Flecha />
          <Paso etiqueta="Salió" monto={flujo.salio} tono="malo"
            nota="gastos, comisiones y renta pagadas" onIr={() => onIr('movimientos')} />
          <Flecha signo="=" />
          <Paso etiqueta="Dejó el periodo" monto={flujo.entro - flujo.salio}
            tono={flujo.entro - flujo.salio < 0 ? 'malo' : 'bueno'} grande
            nota="antes de apartar lo que no es tuyo" onIr={() => onIr('movimientos')} />
        </div>
      </section>
    </div>
  );
}

function Paso({ etiqueta, monto, nota, tono, grande, onIr }: {
  etiqueta: string; monto: number; nota: string;
  tono?: 'bueno' | 'malo'; grande?: boolean; onIr?: () => void;
}) {
  const color = tono === 'malo' ? 'text-bad' : tono === 'bueno' ? 'text-good' : 'text-ink';
  const contenido = (
    <>
      <p className="etiqueta">{etiqueta}</p>
      <p className={`cifra mt-1.5 font-light leading-none tracking-tight ${grande ? 'text-3xl' : 'text-2xl'} ${color}`}>
        {tono === 'malo' && monto > 0 ? `−${mxn(monto)}` : mxn(monto)}
      </p>
      <p className="mt-1.5 text-[11px] leading-tight text-ink-mute">{nota}</p>
    </>
  );
  return onIr
    ? <button type="button" onClick={onIr}
        className="min-w-[9rem] flex-1 rounded-xl px-2 py-1 text-left transition hover:bg-white/[0.03]">
        {contenido}
      </button>
    : <div className="min-w-[9rem] flex-1 px-2 py-1">{contenido}</div>;
}

function Flecha({ signo = '→' }: { signo?: string }) {
  return (
    <span aria-hidden className="flex shrink-0 items-center px-1 text-lg font-light text-ink-mute/50">
      {signo}
    </span>
  );
}
