'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import FiltroPeriodo from '@/components/FiltroPeriodo';
import { mxn } from '@/lib/pricing';
import { usePeriodo, conPeriodo } from './periodo';
import { calcularFlujo, calcularSaldos } from './calculos';
import type { DatosDinero } from './datos';

/**
 * La cabecera de las tres páginas de Dinero.
 *
 * Antes esto era una sola pantalla con siete pestañas, y encontrar algo
 * costaba recorrerlas todas. La división en tres sigue la que usan los
 * sistemas contables desde siempre —cobranza, pagos y bancos— porque responde
 * a la pregunta con la que uno llega: ¿quién me debe?, ¿qué tengo que pagar?,
 * ¿cuánto tengo y dónde está?
 *
 * La franja de arriba es la misma en las tres y no cambia al navegar. Es lo
 * que evita perderse: se sabe siempre de qué periodo se está hablando y cómo
 * va, sin importar en qué página se esté.
 */
const PAGINAS = [
  { href: '/dinero/entra', label: 'Entra', hint: 'Ventas, cobros y quién te debe' },
  { href: '/dinero/sale', label: 'Sale', hint: 'Comisiones, renta y gastos' },
  { href: '/dinero/donde', label: 'Dónde está', hint: 'Efectivo, banco, tienda y otras manos' },
];

export default function Marco({
  datos, activa,
}: {
  datos: DatosDinero;
  activa: '/dinero/entra' | '/dinero/sale' | '/dinero/donde';
}) {
  const { preset, rango, activo, etiqueta, hayFiltro, navegar } = usePeriodo();
  const params = useSearchParams();

  const flujo = useMemo(() => calcularFlujo(datos, activo), [datos, activo]);
  const saldos = useMemo(() => calcularSaldos(datos, activo, flujo), [datos, activo, flujo]);

  const porPagar = saldos.comisiones + saldos.fondoRenta;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="etiqueta">Tesorería</p>
          <h1 className="mt-2 text-4xl font-medium tracking-tight">Dinero</h1>
          <p className="mt-2 text-sm text-ink-mute">Cómo va {etiqueta}.</p>
        </div>
        <FiltroPeriodo preset={preset} rango={rango} onCambio={navegar} />
      </div>

      {/* La franja: entró, salió, quedó, y las dos cosas que no son tuyas. */}
      <section className="tarjeta grid grid-cols-2 gap-x-6 gap-y-5 md:grid-cols-3 xl:grid-cols-5">
        <Cifra etiqueta="Entró" valor={mxn(flujo.entro)}
          detalle={`de ${mxn(flujo.vendiste)} vendidos`} />
        <Cifra etiqueta="Salió" valor={flujo.salio ? `−${mxn(flujo.salio)}` : mxn(0)}
          detalle="gastos, comisiones y renta" />
        <Cifra etiqueta="Quedó" valor={mxn(flujo.quedo)} grande
          tono={flujo.quedo < 0 ? 'malo' : 'bueno'}
          detalle={hayFiltro && Math.abs(saldos.fuera.caja) > 0.5
            ? `y ${mxn(saldos.fuera.caja)} de antes`
            : 'en el periodo'} />
        <Cifra etiqueta="Te deben" valor={mxn(saldos.teDeben)}
          tono={saldos.cuentasVencidas > 0 ? 'aviso' : undefined}
          detalle={saldos.cuentasVencidas > 0
            ? `${saldos.cuentasVencidas} vencida${saldos.cuentasVencidas === 1 ? '' : 's'}`
            : hayFiltro && saldos.fuera.teDeben > 0.5
              ? `y ${mxn(saldos.fuera.teDeben)} de antes`
              : `${saldos.cuentasTotales} cuenta${saldos.cuentasTotales === 1 ? '' : 's'}`} />
        <Cifra etiqueta="Debes" valor={mxn(porPagar)}
          detalle={`${mxn(saldos.comisiones)} comisiones · ${mxn(saldos.fondoRenta)} renta`} />
      </section>

      {saldos.enOtrasManos > 0.5 && activa !== '/dinero/donde' && (
        <Link href={conPeriodo('/dinero/donde', params)}
          className="flex flex-wrap items-center gap-2 rounded-xl border border-warn/25 bg-warn/10
            px-3.5 py-2.5 text-sm text-warn transition hover:border-warn/50">
          <span className="font-medium">{mxn(saldos.enOtrasManos)}</span>
          <span>de ese dinero no está en tu caja: lo trae alguien más</span>
          <span className="text-warn/70">
            ({saldos.cuentasAbiertas} cuenta{saldos.cuentasAbiertas === 1 ? '' : 's'}) →
          </span>
        </Link>
      )}

      {!datos.fase6 && (
        <p className="rounded-xl border border-warn/25 bg-warn/10 px-3.5 py-2.5 text-sm text-warn">
          Falta correr <code>supabase/fase6.sql</code>: el desglose por forma de
          pago, las subcategorías y las evidencias todavía no están disponibles.
        </p>
      )}

      {/* Las tres páginas. Cada enlace conserva el periodo elegido. */}
      <nav className="grid gap-2 sm:grid-cols-3">
        {PAGINAS.map((p) => {
          const esta = p.href === activa;
          return (
            <Link key={p.href} href={conPeriodo(p.href, params)}
              aria-current={esta ? 'page' : undefined}
              className={`rounded-xl border px-4 py-3 transition ${
                esta
                  ? 'border-brand bg-brand/[0.08]'
                  : 'border-surface-line bg-surface-raised hover:border-ink-mute'
              }`}>
              <p className={`text-sm font-medium ${esta ? 'text-brand' : 'text-ink'}`}>{p.label}</p>
              <p className="mt-0.5 text-xs text-ink-mute">{p.hint}</p>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

function Cifra({ etiqueta, valor, detalle, tono, grande }: {
  etiqueta: string; valor: string; detalle?: string;
  tono?: 'bueno' | 'aviso' | 'malo'; grande?: boolean;
}) {
  const color = tono === 'malo' ? 'text-bad' : tono === 'aviso' ? 'text-warn'
    : tono === 'bueno' ? 'text-good' : 'text-ink';
  return (
    <div>
      <p className="etiqueta">{etiqueta}</p>
      <p className={`cifra mt-1.5 font-light leading-none tracking-tight ${grande ? 'text-3xl' : 'text-2xl'} ${color}`}>
        {valor}
      </p>
      {detalle && <p className="mt-1.5 text-xs text-ink-mute">{detalle}</p>}
    </div>
  );
}
