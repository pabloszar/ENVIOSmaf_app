'use client';

import { useState } from 'react';
import { Input } from '@/components/ui';

/**
 * Quién tuvo el dinero en la mano.
 *
 * Casi siempre es la caja de Envíos MAF, y por eso ese es el estado inicial y
 * el control arranca cerrado: un viaje normal no debe costar ni un clic de
 * más. Solo cuando cobra otro —el chofer, Tiendas MAF en su propia caja,
 * quien sea— se abre y se marca, que es justo la excepción que descuadraba la
 * caja contra el banco.
 *
 * "Tiendas MAF" viene fijo y escrito igual siempre: si cada quien lo teclea a
 * su manera, el saldo se parte en varias personas que son la misma.
 */
export const TIENDAS_MAF = 'Tiendas MAF';

export interface Custodia {
  contactoId: string | null;
  otro: string;
}

export const SIN_CUSTODIA: Custodia = { contactoId: null, otro: '' };

/** ¿Está en la caja propia? Vacío en los dos campos = sí. */
export const esCaja = (c: Custodia) => !c.contactoId && !c.otro.trim();

export default function QuienTuvo({
  valor, onCambio, etiqueta, sugeridos = [],
}: {
  valor: Custodia;
  onCambio: (c: Custodia) => void;
  /** "¿Quién lo cobra?" o "¿Quién lo paga?" */
  etiqueta: string;
  /** Gente del viaje: el chofer y el vendedor, para no buscarlos en una lista. */
  sugeridos: { id: string; nombre: string }[];
}) {
  const caja = esCaja(valor);
  const [abierto, setAbierto] = useState(!caja);
  const [escribiendo, setEscribiendo] = useState(
    !caja && !valor.contactoId && valor.otro !== TIENDAS_MAF
  );

  const nombre = valor.contactoId
    ? (sugeridos.find((s) => s.id === valor.contactoId)?.nombre ?? 'otra persona')
    : valor.otro || 'La caja';

  if (!abierto) {
    return (
      <button type="button" onClick={() => setAbierto(true)}
        className="flex w-full items-center justify-between gap-3 rounded-xl border border-white/[0.07]
          bg-white/[0.02] px-3.5 py-2.5 text-left text-sm transition hover:border-white/20">
        <span className="text-ink-mute">
          {etiqueta} <span className="text-ink-soft">{nombre}</span>
        </span>
        <span className="shrink-0 text-xs text-brand">Cambiar</span>
      </button>
    );
  }

  const opciones: { clave: string; label: string; aplicar: () => void }[] = [
    { clave: 'caja', label: 'La caja', aplicar: () => { setEscribiendo(false); onCambio(SIN_CUSTODIA); } },
    ...sugeridos.map((s) => ({
      clave: s.id,
      label: s.nombre,
      aplicar: () => { setEscribiendo(false); onCambio({ contactoId: s.id, otro: '' }); },
    })),
    {
      clave: 'maf', label: TIENDAS_MAF,
      aplicar: () => { setEscribiendo(false); onCambio({ contactoId: null, otro: TIENDAS_MAF }); },
    },
    {
      clave: 'otro', label: 'Otro…',
      aplicar: () => { setEscribiendo(true); onCambio({ contactoId: null, otro: '' }); },
    },
  ];

  const activa = escribiendo ? 'otro'
    : valor.contactoId ? valor.contactoId
    : valor.otro === TIENDAS_MAF ? 'maf'
    : valor.otro ? 'otro'
    : 'caja';

  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-3.5 py-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="etiqueta">{etiqueta}</span>
        {caja && (
          <button type="button" onClick={() => setAbierto(false)}
            className="text-xs text-ink-mute transition hover:text-ink">Ocultar</button>
        )}
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {opciones.map((o) => (
          <button key={o.clave} type="button" onClick={o.aplicar} aria-pressed={activa === o.clave}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
              activa === o.clave
                ? 'border-acento/40 bg-acento/15 text-acento'
                : 'border-surface-line bg-surface-raised text-ink-soft hover:border-ink-mute hover:text-ink'
            }`}>
            {o.label}
          </button>
        ))}
      </div>

      {escribiendo && (
        <Input className="mt-2.5" autoFocus placeholder="Nombre de quien lo tuvo"
          value={valor.otro} onChange={(e) => onCambio({ contactoId: null, otro: e.target.value })} />
      )}

      <p className="mt-2 text-[11px] leading-tight text-ink-mute">
        {caja
          ? 'El dinero queda en tu caja. Es lo normal.'
          : 'Se le anota a su cuenta hasta que te lo entregue.'}
      </p>
    </div>
  );
}

/** Los campos que espera la API, a partir del control. */
export const custodiaABody = (c: Custodia, campo: 'cobrado_por' | 'pagado_por' | 'recibido_por') => ({
  [campo]: c.contactoId || null,
  [`${campo}_otro`]: c.otro.trim() || null,
});
