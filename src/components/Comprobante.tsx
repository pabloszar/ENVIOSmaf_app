'use client';

import { mxn } from '@/lib/pricing';
import { fechaCorta } from '@/lib/fechas';
import { Modal, Boton } from '@/components/ui';

export interface LineaComprobante { etiqueta: string; detalle?: string; monto: number }

/**
 * Comprobante de un pago, pensado para capturarse en pantalla y mandarse.
 *
 * Vive en la app y no en un PDF a propósito: lo que se necesita es enseñar que
 * ya se pagó, y una captura llega por WhatsApp en cinco segundos. Por eso
 * carga todo lo que hace falta para que se sostenga solo —quién, cuánto, de
 * qué, cuándo y con qué método— y nada más.
 *
 * El folio se arma de la fecha y el monto: no pretende ser consecutivo fiscal,
 * solo darle un nombre a la captura para poder referirse a ella después.
 */
export default function Comprobante({
  abierto, onCerrar, titulo, para, concepto, monto, fecha, metodo, referencia, lineas, nota,
}: {
  abierto: boolean;
  onCerrar: () => void;
  titulo: string;
  para: string;
  concepto: string;
  monto: number;
  fecha: string;
  metodo?: string | null;
  referencia?: string | null;
  lineas?: LineaComprobante[];
  nota?: string;
}) {
  const folio = folioDe(fecha, monto);

  return (
    <Modal abierto={abierto} onCerrar={onCerrar} titulo={titulo} ancho="chico"
      descripcion="Toma una captura de pantalla para enviarlo.">
      <div className="space-y-4">
        {/* El recibo. Encuadrado y con su propio fondo para que la captura se
            corte sola: lo de afuera se ve claramente como app. */}
        <div className="overflow-hidden rounded-2xl border border-white/[0.1] bg-surface-sunk">
          <div className="flex items-baseline justify-between border-b border-dashed border-white/[0.12] px-5 py-4">
            <div>
              <p className="text-sm font-medium tracking-tight">Envíos MAF</p>
              <p className="mt-0.5 text-[11px] uppercase tracking-[0.1em] text-ink-mute">{concepto}</p>
            </div>
            <p className="cifra text-[11px] text-ink-mute">{folio}</p>
          </div>

          <div className="px-5 py-5">
            <p className="etiqueta">Pagado a</p>
            <p className="mt-1 text-lg font-medium tracking-tight">{para}</p>

            <p className="cifra mt-5 text-4xl font-light leading-none tracking-tight">{mxn(monto)}</p>

            <dl className="mt-5 space-y-1.5 text-xs">
              <Renglon t="Fecha" v={fechaCorta(fecha)} />
              {metodo && <Renglon t="Método" v={metodo} />}
              {referencia && <Renglon t="Referencia" v={referencia} />}
            </dl>
          </div>

          {lineas && lineas.length > 0 && (
            <div className="border-t border-dashed border-white/[0.12] px-5 py-4">
              <p className="etiqueta">Cubre</p>
              <ul className="mt-2 space-y-1.5">
                {lineas.slice(0, 12).map((l, i) => (
                  <li key={i} className="flex items-baseline justify-between gap-3 text-xs">
                    <span className="min-w-0 truncate text-ink-soft">
                      {l.etiqueta}
                      {l.detalle && <span className="text-ink-mute"> · {l.detalle}</span>}
                    </span>
                    <span className="cifra shrink-0">{mxn(l.monto)}</span>
                  </li>
                ))}
                {lineas.length > 12 && (
                  <li className="text-xs text-ink-mute">y {lineas.length - 12} más</li>
                )}
              </ul>
            </div>
          )}

          {nota && (
            <p className="border-t border-dashed border-white/[0.12] px-5 py-3 text-[11px] leading-relaxed text-ink-mute">
              {nota}
            </p>
          )}
        </div>

        <div className="flex justify-end">
          <Boton onClick={onCerrar}>Listo</Boton>
        </div>
      </div>
    </Modal>
  );
}

function Renglon({ t, v }: { t: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-ink-mute">{t}</dt>
      <dd className="text-ink-soft">{v}</dd>
    </div>
  );
}

/** `2026-07-27` + 3273 → `MAF-260727-3273`. Un nombre, no un folio fiscal. */
function folioDe(fecha: string, monto: number): string {
  const f = fecha.slice(2, 10).replace(/-/g, '');
  return `MAF-${f}-${Math.round(monto)}`;
}
