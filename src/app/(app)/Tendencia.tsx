'use client';

import {
  Area, CartesianGrid, ComposedChart, Line, ReferenceDot, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { mxn } from '@/lib/pricing';

/**
 * Ingreso y utilidad a lo largo del periodo elegido.
 *
 * La granularidad la decide el filtro de arriba: un mes se lee por día, tres
 * meses por semana, un año por mes. Así la gráfica siempre trae entre 10 y 30
 * marcas — ni un bosque de barras ni tres puntos sueltos.
 *
 * Las dos series están en pesos y comparten un solo eje: dos escalas distintas
 * harían que cualquier comparación visual mintiera. El ingreso es área (masa,
 * "cuánto entró") y la utilidad es línea (trayectoria, "cómo terminó"), así se
 * distinguen por forma y no solo por color. La paleta está validada para
 * daltonismo sobre el fondo oscuro.
 *
 * La utilidad graficada es la OPERATIVA, la que existe a nivel de viaje. Los
 * gastos fijos son mensuales y no se pueden repartir por día sin inventar, así
 * que viven en el desglose del peso, no aquí.
 */
export const COLOR_INGRESO = '#14a08f';
export const COLOR_UTILIDAD = '#d95926';
const LIMA = '#d7f000';

export type Granularidad = 'dia' | 'semana' | 'mes';

export interface PuntoMes {
  clave: string;
  etiqueta: string;
  /** Texto largo para el globo y las puntas de la escala. */
  detalle: string;
  ingreso: number;
  utilidad: number;
}

const NOMBRE_GRAN: Record<Granularidad, string> = {
  dia: 'por día', semana: 'por semana', mes: 'por mes',
};
const UNIDAD_GRAN: Record<Granularidad, string> = {
  dia: 'día', semana: 'semana', mes: 'mes',
};

export default function Tendencia({
  datos, granularidad,
}: {
  datos: PuntoMes[];
  granularidad: Granularidad;
}) {
  if (datos.length === 0) {
    return <p className="px-6 py-16 text-center text-sm text-ink-mute">Sin movimientos en el periodo.</p>;
  }

  // El punto vigente es el último con movimiento: marcar un cero final —un día
  // en el que todavía no sale nadie— no dice nada y confunde la lectura.
  const ultimo = [...datos].reverse().find((d) => d.ingreso !== 0) ?? datos[datos.length - 1];
  const totalIngreso = datos.reduce((s, d) => s + d.ingreso, 0);
  const totalUtilidad = datos.reduce((s, d) => s + d.utilidad, 0);
  const mejor = datos.reduce((a, b) => (b.utilidad > a.utilidad ? b : a));

  return (
    <div className="relative">
      {/* Cabecera editorial: la cifra manda, la leyenda susurra. */}
      <div className="relative flex flex-wrap items-end justify-between gap-6 px-6 pb-6 pt-1">
        <div>
          <p className="etiqueta">Ingreso del periodo</p>
          <p className="cifra mt-1.5 text-[2.5rem] font-light leading-none tracking-tight">
            {mxn(totalIngreso)}
          </p>
          <p className="mt-2 text-xs text-ink-mute">
            Utilidad de viajes <span className="cifra text-ink-soft">{mxn(totalUtilidad)}</span>
            {' · mejor '}{UNIDAD_GRAN[granularidad]}{' '}
            <span className="text-ink-soft">{mejor.detalle}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-xs text-ink-soft">
          <Llave color={COLOR_INGRESO} forma="area">Ingreso</Llave>
          <Llave color={COLOR_UTILIDAD} forma="linea">Utilidad de viajes</Llave>
          <span className="text-ink-mute">{NOMBRE_GRAN[granularidad]}</span>
        </div>
      </div>

      <div className="h-[19rem] w-full pr-6">
        <ResponsiveContainer>
          <ComposedChart data={datos} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
            <defs>
              {/* El área se desvanece hacia abajo: da volumen sin tapar la línea. */}
              <linearGradient id="degIngreso" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={COLOR_INGRESO} stopOpacity={0.45} />
                <stop offset="55%" stopColor={COLOR_INGRESO} stopOpacity={0.12} />
                <stop offset="100%" stopColor={COLOR_INGRESO} stopOpacity={0} />
              </linearGradient>
            </defs>

            <CartesianGrid vertical={false} stroke="#ffffff" strokeOpacity={0.05} />
            <XAxis dataKey="etiqueta" tickLine={false} axisLine={false} interval="preserveStartEnd"
              minTickGap={18} tick={{ fill: '#8b8b95', fontSize: 11 }} dy={6} />
            <YAxis tickFormatter={compacto} tickLine={false} axisLine={false} width={58}
              tick={{ fill: '#8b8b95', fontSize: 11 }} />
            <ReferenceLine y={0} stroke="#ffffff" strokeOpacity={0.12} />
            <Tooltip content={<Globo />} cursor={{ stroke: LIMA, strokeOpacity: 0.35, strokeWidth: 1 }} />

            <Area dataKey="ingreso" name="Ingreso" stroke={COLOR_INGRESO} strokeWidth={2}
              fill="url(#degIngreso)" dot={false}
              activeDot={{ r: 4, fill: COLOR_INGRESO, stroke: '#141416', strokeWidth: 2 }} />
            <Line dataKey="utilidad" name="Utilidad de viajes" stroke={COLOR_UTILIDAD} strokeWidth={2}
              dot={false}
              activeDot={{ r: 5, fill: COLOR_UTILIDAD, stroke: '#141416', strokeWidth: 2 }} />

            {/* El dato vigente se marca en lima: el único punto que pide la mirada. */}
            <ReferenceDot x={ultimo.etiqueta} y={ultimo.ingreso} r={4}
              fill={LIMA} stroke="#141416" strokeWidth={2} isFront />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Escala nombrada, como en la referencia: el eje dice de dónde a dónde. */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-6 pb-5 pt-3 text-xs text-ink-mute">
        <span>{datos[0].detalle}</span>
        <span className="flex items-center gap-2">
          <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: LIMA }} />
          {ultimo.detalle} · <span className="cifra">{mxn(ultimo.ingreso)}</span>
        </span>
      </div>
    </div>
  );
}

function Llave({ color, forma, children }: { color: string; forma: 'area' | 'linea'; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span aria-hidden className="inline-block"
        style={forma === 'area'
          ? { width: 12, height: 8, background: `linear-gradient(${color}, transparent)`, borderTop: `2px solid ${color}` }
          : { width: 14, height: 2, background: color, borderRadius: 2 }} />
      {children}
    </span>
  );
}

interface PayloadItem { name?: string; dataKey?: string; value?: number; payload?: PuntoMes }

function Globo({ active, payload }: { active?: boolean; payload?: PayloadItem[] }) {
  if (!active || !payload?.length) return null;
  const punto = payload[0]?.payload;
  return (
    <div className="rounded-xl border border-white/[0.1] bg-surface/90 px-3.5 py-2.5 text-xs shadow-panel backdrop-blur-xl">
      <p className="font-medium text-ink">{punto?.detalle}</p>
      {payload.map((p) => (
        <p key={p.dataKey} className="mt-1.5 flex items-center gap-4">
          <span className="text-ink-mute">{p.name}</span>
          <span className="cifra ml-auto font-medium">{mxn(Number(p.value ?? 0))}</span>
        </p>
      ))}
    </div>
  );
}

/** $32,700 → $32.7k, para que el eje no se coma el ancho del gráfico. */
function compacto(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1000) return `$${(n / 1000).toFixed(abs >= 10000 ? 0 : 1)}k`;
  return `$${Math.round(n)}`;
}
