import { mxn } from '@/lib/pricing';

/**
 * Indicador grande. El tono se usa solo cuando el número tiene un significado
 * de salud (margen, utilidad); para cifras neutras como ingreso, no.
 *
 * `href` convierte la tarjeta en un acceso: la flecha ↗ de la esquina es el
 * gesto que se repite en todas las referencias para "aquí hay más".
 */
/** Los halos usan los colores de dato, no los de estado: son decoración. */
const HALOS = {
  teal: 'rgba(20,160,143,0.30)',
  naranja: 'rgba(217,89,38,0.26)',
  lima: 'rgba(215,240,0,0.16)',
  ninguno: null,
} as const;

export function Indicador({
  etiqueta,
  valor,
  detalle,
  tono = 'neutro',
  destacado = false,
  halo = 'ninguno',
}: {
  etiqueta: string;
  valor: string;
  detalle?: React.ReactNode;
  tono?: 'neutro' | 'bueno' | 'malo' | 'aviso';
  destacado?: boolean;
  halo?: keyof typeof HALOS;
}) {
  const color =
    tono === 'bueno' ? 'text-good'
    : tono === 'malo' ? 'text-bad'
    : tono === 'aviso' ? 'text-warn'
    : 'text-ink';
  const tinte = HALOS[halo];

  return (
    <div className={`tarjeta overflow-hidden ${destacado ? 'border-acento/25' : ''}`}>
      {tinte && (
        <span aria-hidden className="halo"
          style={{ background: `radial-gradient(circle, ${tinte}, transparent 70%)` }} />
      )}
      <div className="relative">
        <p className="etiqueta">{etiqueta}</p>
        <p className={`cifra mt-2.5 text-[1.75rem] font-medium leading-none tracking-tight ${color}`}>
          {valor}
        </p>
        {detalle && <p className="mt-2.5 text-xs text-ink-mute">{detalle}</p>}
      </div>
    </div>
  );
}

export function tonoMargen(pct: number | null): 'bueno' | 'aviso' | 'malo' | 'neutro' {
  if (pct == null) return 'neutro';
  if (pct < 0) return 'malo';
  if (pct < 15) return 'aviso';
  return 'bueno';
}

/**
 * Cambio contra el periodo anterior. `puntos` es para porcentajes: un margen
 * que pasa de 20% a 25% subió 5 puntos, no 25%.
 */
export function Comparativo({
  actual, anterior, puntos = false, nota = 'vs. periodo anterior',
}: {
  actual: number; anterior: number | null; puntos?: boolean; nota?: string;
}) {
  if (anterior == null) return <span className="text-ink-mute">sin periodo previo</span>;
  if (!puntos && anterior === 0) {
    return <span className="text-ink-mute">{nota}: sin datos</span>;
  }

  const cambio = puntos ? actual - anterior : ((actual - anterior) / Math.abs(anterior)) * 100;
  const plano = Math.abs(cambio) < 0.05;
  const color = plano
    ? 'border-surface-line bg-surface-raised text-ink-mute'
    : cambio > 0 ? 'border-good/25 bg-good/10 text-good' : 'border-bad/25 bg-bad/10 text-bad';
  const texto = plano
    ? 'sin cambio'
    : `${cambio > 0 ? '▲' : '▼'} ${Math.abs(cambio).toFixed(1)}${puntos ? ' pts' : '%'}`;

  return (
    <span className="inline-flex items-center gap-2">
      <span className={`rounded-full border px-1.5 py-0.5 text-[11px] font-medium ${color}`}>
        {texto}
      </span>
      <span className="text-ink-mute">{nota}</span>
    </span>
  );
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

/**
 * Tendencia mínima para meter dentro de una fila de tabla: sin ejes, sin
 * etiquetas, solo la forma. El último punto va en lima porque es el dato
 * vigente — es la única marca de la fila que pide la mirada.
 */
export function Sparkline({
  valores, ancho = 72, alto = 22, titulo,
}: { valores: number[]; ancho?: number; alto?: number; titulo?: string }) {
  if (valores.length < 2) return <span className="text-ink-mute">—</span>;

  const min = Math.min(...valores, 0);
  const max = Math.max(...valores, 0);
  const rango = max - min || 1;
  const paso = ancho / (valores.length - 1);
  const y = (v: number) => alto - ((v - min) / rango) * alto;

  const d = valores.map((v, i) => `${i === 0 ? 'M' : 'L'} ${(i * paso).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const ultimo = valores[valores.length - 1];
  const cero = min < 0 && max > 0 ? y(0) : null;

  return (
    <svg width={ancho} height={alto} viewBox={`0 0 ${ancho} ${alto}`}
      className="overflow-visible" role="img"
      aria-label={titulo ?? 'Tendencia de los últimos meses'}>
      {titulo && <title>{titulo}</title>}
      {cero != null && (
        <line x1={0} y1={cero} x2={ancho} y2={cero} stroke="#26262b" strokeWidth={1} />
      )}
      <path d={d} fill="none" stroke="#8b8b95" strokeWidth={1.5}
        strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={ancho} cy={y(ultimo)} r={2.5} fill="#d7f000" />
    </svg>
  );
}
