'use client';

import { useState } from 'react';
import { Input } from '@/components/ui';
import QuienTuvo from '@/components/QuienTuvo';
import { mxn } from '@/lib/pricing';
import {
  METODOS, METODO_INFO, type Metodo, type Desglose,
  desgloseSimple, desgloseVacio, montoDe, sumaDesglose, metodosUsados, restante,
} from '@/lib/cobro';

/**
 * Cómo se pagó una misión.
 *
 * Tiene dos caras a propósito. La de arriba resuelve el 95% de los casos con
 * un clic —se pagó todo de una forma— y la de abajo, que hay que pedir, deja
 * repartir el flete entre varias. Poner los tres campos de monto a la vista
 * desde el principio convertiría una decisión en tres capturas para quien casi
 * siempre cobra completo y en efectivo.
 *
 * Lo que no se asigna a ningún método queda a deber, y eso es lo que vuelve
 * el flete un crédito. No hay un interruptor de "a crédito" separado: sería
 * un segundo lugar donde decir lo mismo, y los dos podrían contradecirse.
 */
export default function ComoSePago({
  precio, valor, onCambio, sugeridos = [], etiqueta = '¿Cómo se pagó?',
}: {
  precio: number;
  valor: Desglose;
  onCambio: (d: Desglose) => void;
  sugeridos?: { id: string; nombre: string }[];
  etiqueta?: string;
}) {
  const usados = metodosUsados(valor);
  const partido = usados.length > 1;
  const [enPartes, setEnPartes] = useState(partido);

  const falta = restante(valor, precio);
  const hayEfectivo = montoDe(valor, 'efectivo') > 0;
  // Una sola forma de pago que cubre todo el flete: el caso simple.
  const unico = usados.length === 1 && falta === 0 ? usados[0] : null;
  const todoACredito = usados.length === 0;

  const setMonto = (m: Metodo, v: string) =>
    onCambio({ ...valor, montos: { ...valor.montos, [m]: v } });

  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-3.5 py-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="etiqueta">{etiqueta}</span>
        <span className="cifra text-xs text-ink-mute">{mxn(precio)}</span>
      </div>

      {!enPartes ? (
        <>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {METODOS.map((m) => (
              <Opcion key={m} activa={unico === m} onClick={() => onCambio(desgloseSimple(m, precio))}>
                {METODO_INFO[m].label}
              </Opcion>
            ))}
            <Opcion activa={todoACredito} onClick={() => onCambio(desgloseVacio())}>
              Queda a deber
            </Opcion>
          </div>

          <p className="mt-2 text-[11px] leading-tight text-ink-mute">
            {unico ? METODO_INFO[unico].donde
              : todoACredito ? 'Nadie ha pagado todavía. Aparece en cuentas por cobrar.'
              : 'Elige cómo entró el dinero.'}
          </p>
        </>
      ) : (
        <div className="mt-2.5 space-y-1.5">
          {METODOS.map((m) => (
            <div key={m} className="flex items-center gap-3">
              <span className="min-w-0 flex-1 truncate text-sm text-ink-soft">
                {METODO_INFO[m].label}
              </span>
              <div className="relative w-32 shrink-0">
                <span aria-hidden
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-ink-mute">$</span>
                <Input className="cifra !py-1.5 !pl-7 text-right" type="number" inputMode="decimal"
                  placeholder="0" value={valor.montos[m]}
                  onChange={(e) => setMonto(m, e.target.value)} />
              </div>
            </div>
          ))}

          <div className="flex items-center gap-3 border-t border-white/[0.06] pt-2">
            <span className="min-w-0 flex-1 text-sm">
              {falta > 0 ? 'Queda a deber' : falta < 0 ? 'Te pasaste por' : 'Cuadra'}
            </span>
            <span className={`cifra w-32 shrink-0 pr-3 text-right text-sm font-medium ${
              falta > 0 ? 'text-warn' : falta < 0 ? 'text-bad' : 'text-good'
            }`}>
              {falta === 0 ? `${mxn(sumaDesglose(valor))} ✓` : mxn(Math.abs(falta))}
            </span>
          </div>
        </div>
      )}

      {/* Quién trae el efectivo. Solo con efectivo de por medio: una
          transferencia cae en el banco y un cobro en tienda ya dice de quién
          es, así que preguntarlo ahí sería una pregunta sin respuesta útil. */}
      {hayEfectivo && (
        <div className="mt-2.5">
          <QuienTuvo valor={valor.custodia} onCambio={(c) => onCambio({ ...valor, custodia: c })}
            etiqueta="Trae el efectivo:" sugeridos={sugeridos} />
        </div>
      )}

      <button type="button" onClick={() => setEnPartes((v) => !v)}
        className="mt-2 text-xs text-brand transition hover:underline">
        {enPartes ? 'Se pagó de una sola forma' : 'Se pagó en partes…'}
      </button>
    </div>
  );
}

function Opcion({ activa, onClick, children }: {
  activa: boolean; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button type="button" onClick={onClick} aria-pressed={activa}
      className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
        activa
          ? 'border-acento/40 bg-acento/15 text-acento'
          : 'border-surface-line bg-surface-raised text-ink-soft hover:border-ink-mute hover:text-ink'
      }`}>
      {children}
    </button>
  );
}

/**
 * El mismo método, para lo que sale: un gasto pagado por transferencia baja
 * el banco, no el efectivo. Sin esto, "dónde está el dinero" solo cuadraría
 * de un lado.
 */
export function SelectorMetodo({ valor, onCambio, etiqueta = '¿Con qué se pagó?' }: {
  valor: Metodo | null;
  onCambio: (m: Metodo | null) => void;
  etiqueta?: string;
}) {
  return (
    <div>
      <span className="etiqueta">{etiqueta}</span>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {METODOS.map((m) => (
          <Opcion key={m} activa={valor === m} onClick={() => onCambio(valor === m ? null : m)}>
            {METODO_INFO[m].label}
          </Opcion>
        ))}
      </div>
    </div>
  );
}
