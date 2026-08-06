'use client';

import { useState } from 'react';
import { mxn } from '@/lib/pricing';

/**
 * A dónde va cada peso que entra.
 *
 * La forma es la idea: el peso es una MONEDA partida en tajadas. Al centro
 * queda lo que sobra, que es la única cifra que de verdad importa. Alrededor,
 * un tablero de agujas —una por concepto— da la cifra exacta.
 *
 * Los dos lados están ligados: al pasar el cursor por una aguja, su tajada de
 * la moneda se separa y las demás se apagan. Señalar con el dedo, sin leer.
 *
 * Color: los costos reales van en una rampa de un solo tono (magnitudes de la
 * misma familia), validada como ordinal sobre el fondo oscuro; la utilidad va
 * en naranja porque no es un costo, es lo que queda; y lo que no sabemos qué es
 * va en gris rayado, porque un hueco de información no merece un color propio.
 * El color sigue al concepto, no a su tamaño.
 */
const RAMPA = ['#8ce9db', '#55cdba', '#22a695', '#12806f', '#0a5c50'];
const NARANJA = '#d95926';
const ROJO = '#f26d6d';
const GRIS = '#4a4a52';

export interface Tajada {
  etiqueta: string;
  monto: number;
  /** Qué contiene, en corto: "casetas y comida". */
  desglose?: string;
  /** La utilidad se pinta distinto: es lo que queda, no lo que sale. */
  esUtilidad?: boolean;
  /** Un monto que no sabemos en qué se fue. Se pinta como hueco, no como dato. */
  esHueco?: boolean;
  nota?: string;
}

export default function Reparto({ tajadas, ingreso }: { tajadas: Tajada[]; ingreso: number }) {
  const [activa, setActiva] = useState<string | null>(null);

  if (ingreso <= 0) {
    return <p className="px-6 py-16 text-center text-sm text-ink-mute">Sin ingresos en el periodo.</p>;
  }

  const visibles = tajadas.filter((t) => t.esUtilidad || Math.abs(t.monto) > 0.005);

  // El índice de rampa solo avanza con los costos reales: el hueco y la
  // utilidad tienen su propio color y no deben consumir un paso.
  let paso = 0;
  const conColor = visibles.map((t) => {
    const color = t.monto < 0 ? ROJO
      : t.esUtilidad ? NARANJA
      : t.esHueco ? GRIS
      : RAMPA[Math.min(paso++, RAMPA.length - 1)];
    return { ...t, color, pct: (t.monto / ingreso) * 100 };
  });

  const utilidad = conColor.find((t) => t.esUtilidad);

  return (
    <div className="grid gap-8 px-6 pb-7 pt-3 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] lg:gap-10">
      <Moneda tajadas={conColor} activa={activa} onActivar={setActiva} utilidad={utilidad} />

      <div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {conColor.map((t) => (
            <button key={t.etiqueta} type="button"
              onMouseEnter={() => setActiva(t.etiqueta)}
              onMouseLeave={() => setActiva(null)}
              onFocus={() => setActiva(t.etiqueta)}
              onBlur={() => setActiva(null)}
              className={`rounded-2xl border px-3 py-3.5 text-center transition ${
                activa === t.etiqueta
                  ? 'border-white/25 bg-white/[0.06]'
                  : activa
                    ? 'border-white/[0.05] bg-white/[0.02] opacity-45'
                    : t.esUtilidad
                      ? 'border-[#d95926]/30 bg-[#d95926]/[0.07]'
                      : 'border-white/[0.06] bg-white/[0.025]'
              }`}>
              <Aguja pct={t.pct} color={t.color} rayado={t.esHueco} />
              <p className={`mt-1.5 text-[13px] ${t.esUtilidad ? 'font-medium text-ink' : 'text-ink-soft'}`}>
                {t.etiqueta}
              </p>
              <p className="cifra mt-0.5 text-[15px] font-medium">{mxn(t.monto)}</p>
              {t.desglose && (
                <p className="mt-1 text-[11px] leading-tight text-ink-mute">{t.desglose}</p>
              )}
            </button>
          ))}
        </div>

        {conColor.some((t) => t.nota) && (
          <p className="mt-5 border-t border-white/[0.06] pt-4 text-xs text-ink-mute">
            {conColor.filter((t) => t.nota).map((t) => t.nota).join(' · ')}
          </p>
        )}
      </div>
    </div>
  );
}

/* ── La moneda ───────────────────────────────────────────────────────────── */

interface TajadaPintada extends Tajada { color: string; pct: number }

function Moneda({
  tajadas, activa, onActivar, utilidad,
}: {
  tajadas: TajadaPintada[];
  activa: string | null;
  onActivar: (v: string | null) => void;
  utilidad?: TajadaPintada;
}) {
  const cx = 130, cy = 130;
  const rExt = 112, rInt = 74;
  const separacion = 0.018;   // el hueco entre tajadas, en radianes

  let angulo = -Math.PI / 2;  // se empieza arriba, como un reloj
  const sectores = tajadas.map((t) => {
    const barrido = (Math.abs(t.pct) / 100) * Math.PI * 2;
    const a0 = angulo + separacion / 2;
    const a1 = angulo + barrido - separacion / 2;
    angulo += barrido;
    return { ...t, a0: Math.min(a0, a1), a1: Math.max(a0, a1) };
  });

  return (
    <div className="flex flex-col items-center justify-center">
      <svg viewBox="0 0 260 260" className="w-full max-w-[17rem]" role="img"
        aria-label="Reparto del ingreso por concepto">
        {/* Canto de la moneda: un anillo de marcas finas, como el filo real. */}
        <g opacity={0.25}>
          {Array.from({ length: 72 }, (_, i) => {
            const a = (i / 72) * Math.PI * 2;
            const r0 = rExt + 7, r1 = rExt + 12;
            return (
              <line key={i} stroke="#8b8b95" strokeWidth={1}
                x1={cx + r0 * Math.cos(a)} y1={cy + r0 * Math.sin(a)}
                x2={cx + r1 * Math.cos(a)} y2={cy + r1 * Math.sin(a)} />
            );
          })}
        </g>

        <defs>
          {/* El hueco se raya: se ve que ocupa lugar, pero no que sea un dato. */}
          <pattern id="rayado" width="6" height="6" patternTransform="rotate(45)"
            patternUnits="userSpaceOnUse">
            <rect width="6" height="6" fill={GRIS} fillOpacity={0.35} />
            <line x1="0" y1="0" x2="0" y2="6" stroke={GRIS} strokeWidth={3} />
          </pattern>
        </defs>

        {sectores.map((s) => {
          const esActiva = activa === s.etiqueta;
          const apagada = activa != null && !esActiva;
          // La tajada activa se separa del centro, como una rebanada servida.
          const medio = (s.a0 + s.a1) / 2;
          const desplaza = esActiva ? 7 : 0;
          return (
            <path key={s.etiqueta}
              d={sector(cx, cy, rInt, rExt, s.a0, s.a1)}
              fill={s.esHueco ? 'url(#rayado)' : s.color}
              opacity={apagada ? 0.28 : 1}
              transform={`translate(${desplaza * Math.cos(medio)} ${desplaza * Math.sin(medio)})`}
              style={{ transition: 'transform 180ms ease, opacity 180ms ease', cursor: 'pointer' }}
              onMouseEnter={() => onActivar(s.etiqueta)}
              onMouseLeave={() => onActivar(null)}>
              <title>{`${s.etiqueta}: ${mxn(s.monto)} · ${s.pct.toFixed(1)}%`}</title>
            </path>
          );
        })}

        {/* Al centro, lo único que de verdad importa. */}
        {(() => {
          const foco = sectores.find((s) => s.etiqueta === activa) ?? utilidad;
          if (!foco) return null;
          return (
            <g>
              <text x={cx} y={cy - 4} textAnchor="middle" className="cifra"
                fill="#f4f4f5" fontSize="34" fontWeight="300">
                {foco.pct.toFixed(1)}%
              </text>
              <text x={cx} y={cy + 18} textAnchor="middle" fill="#8b8b95" fontSize="12">
                {foco.etiqueta}
              </text>
              <text x={cx} y={cy + 36} textAnchor="middle" className="cifra" fill="#a1a1aa" fontSize="13">
                {mxn(foco.monto)}
              </text>
            </g>
          );
        })()}
      </svg>

      <p className="mt-1 text-center text-xs text-ink-mute">
        {activa ? 'Suelta para ver la utilidad' : 'Pasa el cursor por una tajada'}
      </p>
    </div>
  );
}

/** Un sector de dona entre dos radios y dos ángulos. */
export function sector(cx: number, cy: number, rInt: number, rExt: number, a0: number, a1: number): string {
  const p = (r: number, a: number) => `${(cx + r * Math.cos(a)).toFixed(2)} ${(cy + r * Math.sin(a)).toFixed(2)}`;
  const grande = a1 - a0 > Math.PI ? 1 : 0;
  return [
    `M ${p(rExt, a0)}`,
    `A ${rExt} ${rExt} 0 ${grande} 1 ${p(rExt, a1)}`,
    `L ${p(rInt, a1)}`,
    `A ${rInt} ${rInt} 0 ${grande} 0 ${p(rInt, a0)}`,
    'Z',
  ].join(' ');
}

/* ── El tablero de agujas ────────────────────────────────────────────────── */

/**
 * Gauge de aguja de 240°, como el velocímetro de la referencia: pista con
 * marcas cada 10%, aguja apuntando al valor y la cifra debajo del pivote.
 */
function Aguja({ pct, color, rayado }: { pct: number; color: string; rayado?: boolean }) {
  const cx = 46, cy = 44, r = 32;
  const valor = Math.max(0, Math.min(Math.abs(pct), 100));
  const gradoInicio = 150, barrido = 240;
  const rad = (g: number) => (g * Math.PI) / 180;
  const largo = r * rad(barrido);
  const anguloAguja = rad(gradoInicio + (valor / 100) * barrido);

  const d = `M ${(cx + r * Math.cos(rad(gradoInicio))).toFixed(2)} ${(cy + r * Math.sin(rad(gradoInicio))).toFixed(2)}`
    + ` A ${r} ${r} 0 1 1 ${(cx + r * Math.cos(rad(gradoInicio + barrido))).toFixed(2)} ${(cy + r * Math.sin(rad(gradoInicio + barrido))).toFixed(2)}`;

  return (
    <svg viewBox="0 0 92 66" className="mx-auto h-[66px] w-[92px]" role="img"
      aria-label={`${pct.toFixed(1)} por ciento del ingreso`}>
      <path d={d} fill="none" stroke="#ffffff" strokeOpacity={0.07} strokeWidth={6} strokeLinecap="round" />
      <path d={d} fill="none" stroke={color} strokeOpacity={rayado ? 0.55 : 1} strokeWidth={6}
        strokeLinecap="round" strokeDasharray={largo} strokeDashoffset={largo * (1 - valor / 100)}
        style={{ transition: 'stroke-dashoffset 240ms ease' }} />

      {/* Marcas cada 10%: dan escala sin escribir un solo número. */}
      {Array.from({ length: 11 }, (_, i) => {
        const a = rad(gradoInicio + (i / 10) * barrido);
        const r0 = r - 10, r1 = r - 6;
        return (
          <line key={i} stroke="#8b8b95" strokeOpacity={i % 5 === 0 ? 0.55 : 0.25} strokeWidth={1}
            x1={cx + r0 * Math.cos(a)} y1={cy + r0 * Math.sin(a)}
            x2={cx + r1 * Math.cos(a)} y2={cy + r1 * Math.sin(a)} />
        );
      })}

      <line stroke={color} strokeWidth={2} strokeLinecap="round"
        x1={cx} y1={cy} x2={cx + (r - 12) * Math.cos(anguloAguja)} y2={cy + (r - 12) * Math.sin(anguloAguja)}
        style={{ transition: 'all 240ms ease' }} />
      <circle cx={cx} cy={cy} r={3} fill="#141416" stroke={color} strokeWidth={1.5} />

      <text x={cx} y={cy + 19} textAnchor="middle" className="cifra"
        fill="#f4f4f5" fontSize="13" fontWeight="500">
        {pct.toFixed(1)}%
      </text>
    </svg>
  );
}
