'use client';

import { useState } from 'react';
import { mxn } from '@/lib/pricing';
import { sector } from './Reparto';
import type { Reparto } from '@/lib/objetivo';

/**
 * A dónde DEBERÍA ir cada peso.
 *
 * Misma forma que su gemelo —la moneda partida y el tablero de agujas— porque
 * las dos vistas contestan la misma pregunta y deben leerse igual de rápido.
 * Lo que cambia es quién manda: aquí la moneda dibuja el objetivo, el reparto
 * que promete la configuración.
 *
 * Lo real no desaparece, se vuelve referencia: en cada aguja es una marca
 * blanca sobre la pista, como el testigo de un velocímetro. Si la marca cae
 * después del relleno, ese concepto se pasó del presupuesto; si cae antes,
 * costó menos. La diferencia en pesos va debajo, ya con su signo.
 *
 * Casetas y comida no tienen presupuesto en la configuración. Van en gris y
 * con su monto real: inventarles un objetivo sería fabricar un dato.
 */
const RAMPA = ['#8ce9db', '#55cdba', '#22a695', '#12806f', '#0a5c50'];
const NARANJA = '#d95926';
const ROJO = '#f26d6d';
const GRIS = '#4a4a52';

interface Pintada {
  clave: string;
  etiqueta: string;
  regla: string;
  objetivo: number | null;
  real: number;
  color: string;
  pctObj: number;
  pctReal: number;
  /** Positivo = costó más que el presupuesto. */
  dif: number | null;
  bueno: boolean | null;
  partes?: { etiqueta: string; monto: number; nota?: string }[];
}

export default function RepartoObjetivo({ reparto }: { reparto: Reparto }) {
  const [activa, setActiva] = useState<string | null>(null);
  const { venta, conceptos } = reparto;

  if (venta <= 0) {
    return <p className="px-6 py-16 text-center text-sm text-ink-mute">Sin venta en el periodo.</p>;
  }

  // El objetivo de un concepto sin presupuesto es su propio gasto real: así la
  // moneda cierra en 100% sin fingir que esos pesos no salieron.
  let paso = 0;
  const pintadas: Pintada[] = conceptos.map((c) => {
    const objetivo = c.objetivo ?? c.real;
    const color = c.clave === 'utilidad' ? (objetivo < 0 ? ROJO : NARANJA)
      : c.objetivo == null ? GRIS
      : RAMPA[Math.min(paso++, RAMPA.length - 1)];
    const dif = c.objetivo == null ? null : c.real - c.objetivo;
    return {
      clave: c.clave, etiqueta: c.etiqueta, regla: c.regla,
      objetivo: c.objetivo, real: c.real, color,
      pctObj: (objetivo / venta) * 100,
      pctReal: (c.real / venta) * 100,
      dif,
      bueno: dif == null ? null : (c.masEsMejor ? dif >= 0 : dif <= 0),
      partes: c.partes,
    };
  }).filter((p) => Math.abs(p.pctObj) > 0.05 || p.clave === 'utilidad');

  const utilidad = pintadas.find((p) => p.clave === 'utilidad');
  const foco = pintadas.find((p) => p.clave === activa) ?? utilidad;

  const desvio = pintadas
    .filter((p) => p.clave !== 'utilidad' && p.dif != null)
    .reduce((s, p) => s + (p.dif ?? 0), 0);

  return (
    <div className="px-6 pb-7 pt-3">
      <div className="grid gap-8 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] lg:gap-10">
        <MonedaObjetivo tajadas={pintadas} activa={activa} onActivar={setActiva} foco={foco} />

        <div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {pintadas.map((p) => (
              <button key={p.clave} type="button"
                onMouseEnter={() => setActiva(p.clave)}
                onMouseLeave={() => setActiva(null)}
                onFocus={() => setActiva(p.clave)}
                onBlur={() => setActiva(null)}
                className={`rounded-2xl border px-3 py-3.5 text-center transition ${
                  activa === p.clave
                    ? 'border-white/25 bg-white/[0.06]'
                    : activa
                      ? 'border-white/[0.05] bg-white/[0.02] opacity-45'
                      : p.clave === 'utilidad'
                        ? 'border-[#d95926]/30 bg-[#d95926]/[0.07]'
                        : 'border-white/[0.06] bg-white/[0.025]'
                }`}>
                <AgujaObjetivo pctObj={p.pctObj} pctReal={p.pctReal} color={p.color}
                  sinPresupuesto={p.objetivo == null} />
                <p className={`mt-1.5 text-[13px] ${p.clave === 'utilidad' ? 'font-medium text-ink' : 'text-ink-soft'}`}>
                  {p.etiqueta}
                </p>
                <p className="cifra mt-0.5 text-[15px] font-medium">
                  {p.objetivo != null ? mxn(p.objetivo) : mxn(p.real)}
                </p>
                {/* La referencia: lo real y su diferencia, en letra chica. */}
                {p.objetivo != null ? (
                  <p className="mt-1 text-[11px] leading-tight text-ink-mute">
                    real {mxn(p.real)}
                    {p.dif != null && Math.abs(p.dif) >= 1 && (
                      <span className={p.bueno ? ' text-good' : ' text-bad'}>
                        {' '}{p.dif > 0 ? '+' : '−'}{mxn(Math.abs(p.dif))}
                      </span>
                    )}
                  </p>
                ) : (
                  <p className="mt-1 text-[11px] leading-tight text-ink-mute">sin presupuesto</p>
                )}
              </button>
            ))}
          </div>

          {/* Las tres cifras que resumen el periodo. */}
          <div className="mt-6 flex flex-wrap gap-x-10 gap-y-4 border-t border-white/[0.06] pt-5">
            <Resumen etiqueta="Utilidad objetivo" valor={mxn(reparto.utilidadObjetivo)}
              nota="si todo saliera al modelo" />
            <Resumen etiqueta="Utilidad real" valor={mxn(reparto.utilidadReal)}
              tono={reparto.utilidadReal >= reparto.utilidadObjetivo ? 'bueno' : 'aviso'}
              nota={reparto.utilidadReal >= reparto.utilidadObjetivo
                ? `${mxn(reparto.utilidadReal - reparto.utilidadObjetivo)} por encima`
                : `${mxn(reparto.utilidadObjetivo - reparto.utilidadReal)} por debajo`} />
            <Resumen etiqueta="Desvío en costos"
              valor={`${desvio > 0 ? '+' : '−'}${mxn(Math.abs(desvio))}`}
              tono={desvio > 0 ? 'malo' : 'bueno'}
              nota={desvio > 0 ? 'gastaste de más' : 'gastaste de menos'} />
          </div>
        </div>
      </div>

      <NotaFueraDelModelo reparto={reparto} />
      <NotaGasolina reparto={reparto} />
    </div>
  );
}

/* ── La moneda del objetivo ──────────────────────────────────────────────── */

function MonedaObjetivo({
  tajadas, activa, onActivar, foco,
}: {
  tajadas: Pintada[];
  activa: string | null;
  onActivar: (v: string | null) => void;
  foco?: Pintada;
}) {
  const cx = 130, cy = 130;
  const rExt = 112, rInt = 74;
  const separacion = 0.018;

  const total = tajadas.reduce((s, t) => s + Math.abs(t.pctObj), 0) || 100;

  let angulo = -Math.PI / 2;
  const sectores = tajadas.map((t) => {
    const barrido = (Math.abs(t.pctObj) / total) * Math.PI * 2;
    const a0 = angulo + separacion / 2;
    const a1 = angulo + barrido - separacion / 2;
    angulo += barrido;
    return { ...t, a0: Math.min(a0, a1), a1: Math.max(a0, a1) };
  });

  return (
    <div className="flex flex-col items-center justify-center">
      <svg viewBox="0 0 260 260" className="w-full max-w-[17rem]" role="img"
        aria-label="Reparto objetivo del peso, según la configuración">
        {/* Mismo canto que la moneda real: son la misma moneda, vista de dos
            maneras. */}
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

        {sectores.map((s) => {
          const esActiva = activa === s.clave;
          const apagada = activa != null && !esActiva;
          const medio = (s.a0 + s.a1) / 2;
          const desplaza = esActiva ? 7 : 0;
          return (
            <g key={s.clave}
              transform={`translate(${desplaza * Math.cos(medio)} ${desplaza * Math.sin(medio)})`}
              style={{ transition: 'transform 180ms ease', cursor: 'pointer' }}
              onMouseEnter={() => onActivar(s.clave)}
              onMouseLeave={() => onActivar(null)}>
              <path d={sector(cx, cy, rInt, rExt, s.a0, s.a1)} fill={s.color}
                opacity={apagada ? 0.28 : 1}
                style={{ transition: 'opacity 180ms ease' }}>
                <title>
                  {`${s.etiqueta}: objetivo ${s.objetivo != null ? mxn(s.objetivo) : 'sin presupuesto'} · real ${mxn(s.real)}`}
                </title>
              </path>
              {/* El testigo de lo real: un arco fino por fuera de la tajada.
                  Más corto que ella = costó menos; más largo = se pasó. */}
              {s.objetivo != null && (
                <path d={arco(cx, cy, rExt + 4, s.a0, s.a0 + (s.a1 - s.a0) * razon(s))}
                  fill="none" stroke="#f4f4f5" strokeWidth={2.5} strokeLinecap="round"
                  opacity={apagada ? 0.2 : 0.85} />
              )}
            </g>
          );
        })}

        {foco && (
          <g>
            <text x={cx} y={cy - 4} textAnchor="middle" className="cifra"
              fill="#f4f4f5" fontSize="34" fontWeight="300">
              {Math.abs(foco.pctObj).toFixed(1)}%
            </text>
            <text x={cx} y={cy + 18} textAnchor="middle" fill="#8b8b95" fontSize="12">
              {foco.etiqueta}
            </text>
            <text x={cx} y={cy + 36} textAnchor="middle" className="cifra" fill="#a1a1aa" fontSize="13">
              {foco.objetivo != null ? mxn(foco.objetivo) : mxn(foco.real)}
            </text>
          </g>
        )}
      </svg>

      <p className="mt-1 flex items-center justify-center gap-2 text-center text-xs text-ink-mute">
        <span aria-hidden className="inline-block h-0.5 w-4 rounded-full bg-ink" />
        el arco de afuera es lo real
      </p>
    </div>
  );
}

/**
 * Qué tanto del objetivo se consumió, tope 1.6.
 *
 * Sin tope, un concepto que costó diez veces su presupuesto daría la vuelta a
 * la moneda y se confundiría con los vecinos. Recortado, sigue leyéndose como
 * "se pasó" y la cifra exacta está en la tarjeta.
 */
function razon(s: Pintada): number {
  if (!s.objetivo) return 0;
  return Math.max(0, Math.min(1.6, s.real / s.objetivo));
}

/** Un arco simple, sin grosor: el testigo de lo real. */
function arco(cx: number, cy: number, r: number, a0: number, a1: number): string {
  const p = (a: number) => `${(cx + r * Math.cos(a)).toFixed(2)} ${(cy + r * Math.sin(a)).toFixed(2)}`;
  const grande = a1 - a0 > Math.PI ? 1 : 0;
  return `M ${p(a0)} A ${r} ${r} 0 ${grande} 1 ${p(a1)}`;
}

/* ── El tablero de agujas ────────────────────────────────────────────────── */

/**
 * Gauge de 240°, hermano del de la vista real, pero con dos lecturas: el
 * relleno es el objetivo y la aguja es lo real. Puestos en la misma pista, la
 * distancia entre los dos ES la desviación — no hay que restar nada.
 */
function AgujaObjetivo({
  pctObj, pctReal, color, sinPresupuesto,
}: {
  pctObj: number; pctReal: number; color: string; sinPresupuesto?: boolean;
}) {
  const cx = 46, cy = 44, r = 32;
  const obj = Math.max(0, Math.min(Math.abs(pctObj), 100));
  const real = Math.max(0, Math.min(Math.abs(pctReal), 100));
  const gradoInicio = 150, barrido = 240;
  const rad = (g: number) => (g * Math.PI) / 180;
  const largo = r * rad(barrido);
  const anguloReal = rad(gradoInicio + (real / 100) * barrido);

  const d = `M ${(cx + r * Math.cos(rad(gradoInicio))).toFixed(2)} ${(cy + r * Math.sin(rad(gradoInicio))).toFixed(2)}`
    + ` A ${r} ${r} 0 1 1 ${(cx + r * Math.cos(rad(gradoInicio + barrido))).toFixed(2)} ${(cy + r * Math.sin(rad(gradoInicio + barrido))).toFixed(2)}`;

  return (
    <svg viewBox="0 0 92 66" className="mx-auto h-[66px] w-[92px]" role="img"
      aria-label={`objetivo ${pctObj.toFixed(1)} por ciento, real ${pctReal.toFixed(1)} por ciento`}>
      <path d={d} fill="none" stroke="#ffffff" strokeOpacity={0.07} strokeWidth={6} strokeLinecap="round" />
      <path d={d} fill="none" stroke={color} strokeOpacity={sinPresupuesto ? 0.5 : 1} strokeWidth={6}
        strokeLinecap="round" strokeDasharray={largo} strokeDashoffset={largo * (1 - obj / 100)}
        style={{ transition: 'stroke-dashoffset 240ms ease' }} />

      {Array.from({ length: 11 }, (_, i) => {
        const a = rad(gradoInicio + (i / 10) * barrido);
        const r0 = r - 10, r1 = r - 6;
        return (
          <line key={i} stroke="#8b8b95" strokeOpacity={i % 5 === 0 ? 0.55 : 0.25} strokeWidth={1}
            x1={cx + r0 * Math.cos(a)} y1={cy + r0 * Math.sin(a)}
            x2={cx + r1 * Math.cos(a)} y2={cy + r1 * Math.sin(a)} />
        );
      })}

      {/* La aguja marca lo real. Sin presupuesto no hay nada que comparar y
          se omite: una aguja sin referencia solo confundiría. */}
      {!sinPresupuesto && (
        <>
          <line stroke="#f4f4f5" strokeWidth={2} strokeLinecap="round"
            x1={cx} y1={cy} x2={cx + (r - 12) * Math.cos(anguloReal)} y2={cy + (r - 12) * Math.sin(anguloReal)}
            style={{ transition: 'all 240ms ease' }} />
          <circle cx={cx} cy={cy} r={3} fill="#141416" stroke="#f4f4f5" strokeWidth={1.5} />
        </>
      )}

      <text x={cx} y={cy + 19} textAnchor="middle" className="cifra"
        fill="#f4f4f5" fontSize="13" fontWeight="500">
        {Math.abs(pctObj).toFixed(1)}%
      </text>
    </svg>
  );
}

function Resumen({ etiqueta, valor, nota, tono }: {
  etiqueta: string; valor: string; nota: string; tono?: 'bueno' | 'aviso' | 'malo';
}) {
  const color = tono === 'malo' ? 'text-bad' : tono === 'aviso' ? 'text-warn'
    : tono === 'bueno' ? 'text-good' : 'text-ink';
  return (
    <div>
      <p className="etiqueta">{etiqueta}</p>
      <p className={`cifra mt-1.5 text-2xl font-light leading-none tracking-tight ${color}`}>{valor}</p>
      <p className="mt-1.5 text-xs text-ink-mute">{nota}</p>
    </div>
  );
}

/* ── Advertencias ────────────────────────────────────────────────────────── */

/**
 * El histórico del Excel se importó con los porcentajes en cero, porque en ese
 * periodo no se aplicaba el modelo. Medirlo contra la configuración de hoy no
 * encuentra una fuga: encuentra un cambio de reglas. Sin este aviso, el desvío
 * se lee como un ahorro enorme que nunca ocurrió.
 */
function NotaFueraDelModelo({ reparto }: { reparto: Reparto }) {
  const { rutasFueraDelModelo, ventaFueraDelModelo, venta } = reparto;
  if (rutasFueraDelModelo === 0) return null;
  const parte = (ventaFueraDelModelo / venta) * 100;
  return (
    <div className="mt-6 rounded-xl border border-warn/25 bg-warn/[0.07] px-4 py-3 text-xs leading-relaxed text-ink-soft">
      <p>
        <span className="font-medium text-warn">Ojo con esta comparación.</span>{' '}
        {rutasFueraDelModelo} de los viajes del periodo —{mxn(ventaFueraDelModelo)}, el{' '}
        {parte.toFixed(0)}% de la venta— se cerraron sin el modelo de porcentajes: son los que
        vienen del Excel, donde al ayudante se le pagaba fijo y el chofer no cobraba comisión.
      </p>
      <p className="mt-2">
        Para ellos el objetivo dice qué costarían con las reglas de hoy, no qué debieron costar.
        Ese desvío no es una fuga: es el cambio de reglas. Para leer el modelo de verdad, filtra
        a los meses en los que ya se aplica.
      </p>
    </div>
  );
}

/**
 * La gasolina es el único objetivo que depende de un dato capturado a mano, y
 * por eso el único que puede mentir. Si los kilómetros están incompletos el
 * objetivo sale bajísimo y parece un derroche que no existe. Se dice aquí, en
 * vez de dejar que el número acuse solo.
 */
function NotaGasolina({ reparto }: { reparto: Reparto }) {
  const { kmPorLitroReal, rutasSinKm, gasolinaSinKm, km, rutasConKm } = reparto;
  if (rutasConKm === 0) {
    return (
      <p className="mt-4 rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-3 text-xs text-ink-mute">
        Ninguna ruta del periodo trae kilómetros, así que no se puede calcular cuánta gasolina
        debió gastarse. Captura los km del viaje y esta comparación empieza a funcionar sola.
      </p>
    );
  }
  return (
    <div className="mt-4 rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-3 text-xs leading-relaxed text-ink-mute">
      <p>
        La gasolina se compara solo sobre las{' '}
        <span className="text-ink-soft">{rutasConKm} rutas que traen kilómetros</span>
        {' '}({Math.round(km).toLocaleString('es-MX')} km en total).
        {rutasSinKm > 0 && (
          <> Quedan fuera {rutasSinKm} rutas sin km, con {mxn(gasolinaSinKm)} de gasolina que no
          se puede contrastar contra nada.</>
        )}
      </p>
      {kmPorLitroReal != null && (
        <p className="mt-2">
          Con lo capturado, la flotilla estaría rindiendo{' '}
          <span className="cifra text-ink-soft">{kmPorLitroReal.toFixed(1)} km por litro</span>.
          {kmPorLitroReal < 5 && (
            <> Eso es demasiado bajo para una camioneta: lo más probable no es que se gaste de más,
            sino que falten kilómetros por capturar. Vale más revisar los km antes de sacar
            conclusiones del gasto.</>
          )}
        </p>
      )}
    </div>
  );
}
