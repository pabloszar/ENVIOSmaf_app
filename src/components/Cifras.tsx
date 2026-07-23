import { mxn } from '@/lib/pricing';

/**
 * Indicador grande. El tono se usa solo cuando el número tiene un significado
 * de salud (margen, utilidad); para cifras neutras como ingreso, no.
 */
export function Indicador({
  etiqueta,
  valor,
  detalle,
  tono = 'neutro',
}: {
  etiqueta: string;
  valor: string;
  detalle?: string;
  tono?: 'neutro' | 'bueno' | 'malo' | 'aviso';
}) {
  const color =
    tono === 'bueno' ? 'text-good'
    : tono === 'malo' ? 'text-bad'
    : tono === 'aviso' ? 'text-warn'
    : 'text-ink';

  return (
    <div className="tarjeta">
      <p className="etiqueta">{etiqueta}</p>
      <p className={`cifra mt-2 text-2xl font-semibold ${color}`}>{valor}</p>
      {detalle && <p className="mt-1 text-xs text-ink-mute">{detalle}</p>}
    </div>
  );
}

export function tonoMargen(pct: number | null): 'bueno' | 'aviso' | 'malo' | 'neutro' {
  if (pct == null) return 'neutro';
  if (pct < 0) return 'malo';
  if (pct < 15) return 'aviso';
  return 'bueno';
}

export function Dinero({ n }: { n: number | null | undefined }) {
  if (n == null) return <span className="text-ink-mute">—</span>;
  return <span className="cifra">{mxn(n)}</span>;
}

export function Porcentaje({ n }: { n: number | null | undefined }) {
  if (n == null) return <span className="text-ink-mute">—</span>;
  const tono = n < 0 ? 'text-bad' : n < 15 ? 'text-warn' : 'text-good';
  return <span className={`cifra ${tono}`}>{n.toFixed(1)}%</span>;
}
