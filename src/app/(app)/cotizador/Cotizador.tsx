'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { api } from '@/lib/cliente';
import { Input, Select, Etiqueta, useAccion } from '@/components/ui';
import { useDesplegable, HojaMovil, BordesOscuros } from '@/components/vidrio';
import { calcPrecio, mxn, tiempoEstimado, ETIQUETAS_BANDA, ORIGEN } from '@/lib/pricing';
import { desglosarFlete, pctRentaDe, rendimientoDe } from '@/lib/negocio';
import type { Lugar, Trayecto } from '@/lib/geo';
import type { ConfigNegocio, Contacto, Vehiculo, TamanoCarga } from '@/types';
import BuscadorLugar from './BuscadorLugar';

// Leaflet toca `window` al importarse: en el servidor no existe.
const Mapa = dynamic(() => import('@/components/Mapa'), {
  ssr: false,
  loading: () => <div className="h-full w-full bg-surface-sunk" />,
});

const TAMANOS: TamanoCarga[] = ['Chico', 'Mediano', 'Grande', 'Extra Grande'];

interface Mision {
  k: number;
  destino: string;
  descripcion: string;
  zona: string;
  lat: number;
  lng: number;
  tamano: TamanoCarga;
  /** Texto, no número: viene de un campo que alguien está tecleando. */
  precio: string;
  /** Falso mientras el precio siga siendo el que sugirió el algoritmo. */
  precioTocado: boolean;
  clienteId: string;
  vendedorId: string;
}
let contador = 0;

/**
 * El cotizador.
 *
 * Cotiza el viaje, no el destino. Es la diferencia que sostiene el negocio: en
 * una ruta de tres misiones cada cliente paga su flete completo y la gasolina se
 * paga una sola vez, así que el margen de las tres juntas no se parece al de
 * ninguna por separado.
 *
 * El mapa ocupa la pantalla entera y todo lo demás flota encima. No es un
 * adorno: aquí el mapa no ilustra la decisión, ES la decisión — dónde queda
 * cada misión y qué tan lejos están entre sí es lo que dice si el viaje
 * conviene. Metido en media columna se vuelve una miniatura donde no se
 * distingue nada.
 *
 * Los paneles se encogen a lo esencial y crecen al acercarse el cursor. Así
 * caben los cuatro sin tapar el mapa ni obligar a desplazar la página, que en
 * una pantalla con un mapa dentro siempre acaba peleándose con el mapa.
 */
export default function Cotizador({
  cfg, vehiculos, clientes, vendedores,
}: {
  cfg: ConfigNegocio;
  vehiculos: Vehiculo[];
  clientes: Contacto[];
  vendedores: Contacto[];
}) {
  const router = useRouter();
  const { cargando, error, correr } = useAccion();

  const [misiones, setMisiones] = useState<Mision[]>([]);
  const [roundtrip, setRoundtrip] = useState(true);
  const [vehiculoId, setVehiculoId] = useState('');
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10));
  const [numAyudantes, setNumAyudantes] = useState(1);

  const [trayecto, setTrayecto] = useState<Trayecto | null>(null);
  const [calculando, setCalculando] = useState(false);
  const [errorRuta, setErrorRuta] = useState<string | null>(null);
  const [ubicandoPin, setUbicandoPin] = useState(false);

  const vehiculo = vehiculos.find((v) => v.id === vehiculoId) ?? null;

  /** El precio que sugiere el algoritmo para una misión y un tamaño. */
  const sugerido = (lat: number, lng: number, t: TamanoCarga) =>
    calcPrecio(lat, lng, t, cfg.params_pricing);

  function agregar(l: Lugar) {
    setErrorRuta(null);
    setMisiones((ps) => {
      // Dos pines en el mismo punto serían dos misiones con el mismo tramo y un
      // recorrido que se dobla sobre sí mismo.
      const repetida = ps.some((p) =>
        Math.abs(p.lat - l.lat) < 1e-5 && Math.abs(p.lng - l.lng) < 1e-5);
      if (repetida) return ps;
      const tamano: TamanoCarga = 'Mediano';
      return [...ps, {
        k: ++contador,
        destino: l.nombre,
        descripcion: l.descripcion,
        zona: l.zona,
        lat: l.lat, lng: l.lng,
        tamano,
        precio: String(sugerido(l.lat, l.lng, tamano).precioFinal),
        precioTocado: false,
        clienteId: '', vendedorId: '',
      }];
    });
  }

  async function agregarDesdeMapa(lat: number, lng: number) {
    setUbicandoPin(true);
    try {
      const res = await fetch(`/api/geo/buscar?lat=${lat}&lng=${lng}`);
      const json = await res.json();
      const lugar = (json.data ?? [])[0] as Lugar | undefined;
      // Si el servicio no sabe qué hay ahí, el pin sirve igual: la coordenada
      // es el dato que importa y el nombre se puede escribir a mano.
      agregar(lugar ?? {
        nombre: 'Punto en el mapa', descripcion: `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
        zona: '', lat, lng,
      });
    } catch {
      agregar({ nombre: 'Punto en el mapa', descripcion: `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
        zona: '', lat, lng });
    } finally {
      setUbicandoPin(false);
    }
  }

  const cambiar = (k: number, campos: Partial<Mision>) =>
    setMisiones((ps) => ps.map((p) => (p.k === k ? { ...p, ...campos } : p)));

  function cambiarTamano(p: Mision, t: TamanoCarga) {
    // El precio sigue al tamaño mientras nadie lo haya escrito a mano: un
    // "Grande" cuesta más que un "Mediano" y dejar el precio viejo sería
    // cotizar el flete anterior.
    cambiar(p.k, {
      tamano: t,
      ...(p.precioTocado ? {} : { precio: String(sugerido(p.lat, p.lng, t).precioFinal) }),
    });
  }

  // ── El recorrido ──
  // Se recalcula cuando cambian las coordenadas o el regreso, con un respiro
  // de por medio: agregar tres misiones seguidas dispararía tres consultas al
  // servicio de rutas y solo importa la última.
  const huella = misiones.map((p) => `${p.lat},${p.lng}`).join('|') + `|${roundtrip}`;

  useEffect(() => {
    if (misiones.length === 0) { setTrayecto(null); setErrorRuta(null); return; }
    let vivo = true;
    const t = setTimeout(async () => {
      setCalculando(true);
      setErrorRuta(null);
      try {
        const r = await api<Trayecto>('/api/geo/trayecto', {
          method: 'POST',
          body: { paradas: misiones.map((p) => ({ lat: p.lat, lng: p.lng })), roundtrip },
        });
        if (!vivo) return;
        setTrayecto(r);
      } catch (e) {
        if (!vivo) return;
        setTrayecto(null);
        setErrorRuta(e instanceof Error ? e.message : 'No se pudo trazar el recorrido.');
      } finally {
        if (vivo) setCalculando(false);
      }
    }, 450);
    return () => { vivo = false; clearTimeout(t); };
    // `huella` resume las coordenadas: cambiar un precio no debe repedir la ruta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [huella]);

  // Las misiones en el orden que propuso el recorrido. Mientras se calcula, en
  // el orden en que se capturaron: sacarlas de la pantalla sería peor.
  const enOrden = useMemo(() => {
    if (!trayecto || trayecto.orden.length !== misiones.length) return misiones;
    return trayecto.orden.map((i) => misiones[i]).filter(Boolean);
  }, [misiones, trayecto]);

  const reordenadas = trayecto != null && enOrden.some((p, i) => p.k !== misiones[i]?.k);

  // ── El viaje ──
  const venta = misiones.reduce((s, p) => s + (Number(p.precio) || 0), 0);
  const km = trayecto?.km ?? 0;

  const viaje = useMemo(() => desglosarFlete({
    precio: venta,
    km,
    numAyudantes,
    pctRenta: pctRentaDe(vehiculo, cfg),
    pctVenta: cfg.pct_venta,
    pctChofer: cfg.pct_chofer,
    pctAyudante: cfg.pct_ayudante,
    pctAdmon: cfg.pct_admon,
    rendimientoKml: rendimientoDe(vehiculo, cfg),
    precioLitro: cfg.precio_litro,
  }), [venta, km, numAyudantes, vehiculo, cfg]);

  async function crearRuta() {
    await correr(async () => {
      if (!trayecto) throw new Error('Espera a que termine de calcularse el recorrido.');
      const r = await api<{ ruta_id: string }>('/api/rutas/desde-cotizacion', {
        method: 'POST',
        body: {
          fecha, vehiculo_id: vehiculoId || null, roundtrip,
          paradas: misiones.map((p) => ({
            destino: p.destino, lat: p.lat, lng: p.lng, zona: p.zona || null,
            precio: Number(p.precio) || 0, tamano_carga: p.tamano,
            cliente_id: p.clienteId || null, vendedor_id: p.vendedorId || null,
            notas: p.descripcion || null,
          })),
        },
      });
      router.push(`/rutas/${r.ruta_id}`);
    });
  }

  const puntos = useMemo(
    () => enOrden.map((p, i) => ({ lat: p.lat, lng: p.lng, etiqueta: i + 1, titulo: p.destino })),
    [enOrden]);

  // Lo que los paneles le tapan al mapa. El encuadre lo respeta para que el
  // recorrido no quede dibujado debajo de una tarjeta.
  const margen = useMemo(
    () => ({ arriba: 40, izquierda: 350, abajo: 60, derecha: 350 }), []);

  // Todo lo que los dos acomodos comparten. Se arma aquí y no dentro de cada
  // uno para que el de escritorio y el de celular no puedan diverger.
  const buscador = <PanelBuscador onElegir={agregar} ocupado={ubicandoPin} />;

  const listaMisiones = (
    <PanelMisiones misiones={misiones} enOrden={enOrden} venta={venta} trayecto={trayecto}
      reordenadas={reordenadas} sugerido={sugerido}
      clientes={clientes} vendedores={vendedores}
      onTamano={cambiarTamano} onCambio={cambiar}
      onQuitar={(k) => setMisiones((ps) => ps.filter((x) => x.k !== k))} />
  );

  const ajustes = (
    <PanelAjustes
      fecha={fecha} onFecha={setFecha}
      vehiculo={vehiculo} vehiculos={vehiculos} onVehiculo={setVehiculoId}
      roundtrip={roundtrip} onRoundtrip={setRoundtrip}
      numAyudantes={numAyudantes} onAyudantes={setNumAyudantes} />
  );

  const resumen = (
    <PanelViaje
      misiones={misiones.length} venta={venta} km={km} viaje={viaje}
      calculando={calculando} listo={trayecto != null} errorRuta={errorRuta}
      error={error} cargando={cargando}
      rendimiento={rendimientoDe(vehiculo, cfg)} pctRenta={pctRentaDe(vehiculo, cfg)}
      pctAdmon={cfg.pct_admon} numAyudantes={numAyudantes}
      onCrear={crearRuta} />
  );

  return (
    <div data-pantalla-completa className="relative h-full w-full overflow-hidden">
      <Mapa paradas={puntos} linea={trayecto?.linea} onClic={agregarDesdeMapa}
        alto="100%" controles="bottomleft" margen={margen} />

      <BordesOscuros />

      {/* ══ Escritorio: dos columnas ancladas a los lados ══
          El contenedor no recibe clics para que arrastrar el mapa siga
          funcionando en todo el hueco entre panel y panel. */}
      <div className="pointer-events-none absolute inset-0 z-[900] hidden gap-4 p-4 md:flex">
        <div className="pointer-events-auto mb-16 flex min-h-0 w-[20rem] shrink-0 flex-col gap-3">
          {buscador}
          {listaMisiones}
        </div>
        <div className="pointer-events-none mb-6 ml-auto flex min-h-0 w-[20rem] shrink-0 flex-col gap-3">
          {ajustes}
          {resumen}
        </div>
      </div>

      {/* ══ Celular: el buscador arriba y una hoja abajo ══
          Apilar los cuatro paneles en una columna angosta dejaba el mapa
          reducido a una franja, y el mapa es la mitad de la decisión. Aquí solo
          hay dos cosas fijas: dónde buscar y qué deja el viaje. */}
      <div className="pointer-events-none absolute inset-0 z-[900] flex flex-col p-3 md:hidden">
        <div className="pointer-events-auto shrink-0">{buscador}</div>
        <HojaMovil
          titulo={misiones.length === 0 ? 'Sin misiones todavía'
            : `${misiones.length} ${misiones.length === 1 ? 'misión' : 'misiones'} · ${mxn(venta)}`}
          detalle={misiones.length === 0 ? 'Busca un destino o toca el mapa'
            : trayecto ? 'Toca para ver el desglose y crear la ruta'
            : 'Trazando el recorrido…'}
          cifra={misiones.length > 0 ? mxn(viaje.utilidad) : undefined}
          tono={viaje.utilidad < 0 ? 'malo' : 'bueno'}>
          {ajustes}
          {listaMisiones}
          {resumen}
        </HojaMovil>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Buscar y listar
   ══════════════════════════════════════════════════════════════════════════ */

function PanelBuscador({ onElegir, ocupado }: {
  onElegir: (l: Lugar) => void; ocupado: boolean;
}) {
  return (
    <section className="vidrio shrink-0 p-3">
      <div className="mb-2.5 flex items-baseline justify-between gap-3">
        <h1 className="text-sm font-medium tracking-tight">Cotizador</h1>
        <span className="truncate text-[11px] text-ink-mute" title={ORIGEN.direccion}>
          Sale de {ORIGEN.nombre}
        </span>
      </div>
      <BuscadorLugar onElegir={onElegir} ocupado={ocupado} />
    </section>
  );
}

function PanelMisiones({
  misiones, enOrden, venta, trayecto, reordenadas, sugerido,
  clientes, vendedores, onTamano, onCambio, onQuitar,
}: {
  misiones: Mision[];
  enOrden: Mision[];
  venta: number;
  trayecto: Trayecto | null;
  reordenadas: boolean;
  sugerido: (lat: number, lng: number, t: TamanoCarga) => ReturnType<typeof calcPrecio>;
  clientes: Contacto[];
  vendedores: Contacto[];
  onTamano: (p: Mision, t: TamanoCarga) => void;
  onCambio: (k: number, c: Partial<Mision>) => void;
  onQuitar: (k: number) => void;
}) {
  return (
    /* Crece con las misiones y se detiene a media pantalla. Estirarlo siempre
       dejaba un rectángulo vacío tapando el mapa. */
    <section className="vidrio flex min-h-0 flex-col overflow-hidden">
      <div className="flex shrink-0 items-center gap-2 border-b border-white/[0.07] px-3.5 py-2.5">
        <h2 className="text-xs font-medium tracking-tight">Misiones</h2>
        {misiones.length > 0 && (
          <span className="rounded-full bg-white/[0.08] px-1.5 py-0.5 text-[10px] text-ink-mute">
            {misiones.length}
          </span>
        )}
        <span className="flex-1" />
        {venta > 0 && <span className="cifra text-xs text-ink-soft">{mxn(venta)}</span>}
      </div>

      {misiones.length === 0 ? (
        <p className="px-3.5 py-4 text-xs leading-relaxed text-ink-mute">
          Busca el primer destino o tócalo en el mapa. Agrega todas las entregas del
          viaje: los gastos se comparten y ahí está la ganancia de agrupar.
        </p>
      ) : (
        <ul className="min-h-0 max-h-[45vh] divide-y divide-white/[0.05] overflow-y-auto">
          {enOrden.map((p, i) => (
            <FilaMision key={p.k} mision={p} numero={i + 1}
              tramo={trayecto?.tramos[i]}
              sugerido={sugerido(p.lat, p.lng, p.tamano)}
              clientes={clientes} vendedores={vendedores}
              onTamano={(t) => onTamano(p, t)}
              onCambio={(c) => onCambio(p.k, c)}
              onQuitar={() => onQuitar(p.k)} />
          ))}
        </ul>
      )}

      {reordenadas && (
        <p className="shrink-0 border-t border-white/[0.07] px-3.5 py-2 text-[11px] leading-tight text-acento">
          Reordenadas: así el recorrido es más corto que como las capturaste.
        </p>
      )}
    </section>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Ajustes del viaje
   ══════════════════════════════════════════════════════════════════════════ */

function PanelAjustes({
  fecha, onFecha, vehiculo, vehiculos, onVehiculo,
  roundtrip, onRoundtrip, numAyudantes, onAyudantes,
}: {
  fecha: string; onFecha: (v: string) => void;
  vehiculo: Vehiculo | null; vehiculos: Vehiculo[]; onVehiculo: (id: string) => void;
  roundtrip: boolean; onRoundtrip: (v: boolean) => void;
  numAyudantes: number; onAyudantes: (n: number) => void;
}) {
  const { abierto, fijo, props, alternar } = useDesplegable();
  const dia = fecha.slice(8, 10).replace(/^0/, '');
  const mes = ['ene', 'feb', 'mar', 'abr', 'may', 'jun',
    'jul', 'ago', 'sep', 'oct', 'nov', 'dic'][Number(fecha.slice(5, 7)) - 1] ?? '';

  return (
    <section {...props}
      className="vidrio pointer-events-auto shrink-0 overflow-hidden transition-all duration-200">
      <button type="button" onClick={alternar} aria-expanded={abierto}
        className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left">
        <span className="min-w-0 flex-1 truncate text-xs text-ink-soft">
          {dia} {mes} · {vehiculo?.nombre ?? 'sin unidad'} · {roundtrip ? 'ida y vuelta' : 'solo ida'}
        </span>
        <span aria-hidden className={`shrink-0 text-[10px] text-ink-mute transition-transform
          ${abierto ? 'rotate-180' : ''}`}>▾</span>
      </button>

      {/* Rejilla de altura cero a auto: anima sin tener que medir el contenido
          ni fijarle un alto que se rompa al crecer la lista de unidades. */}
      <div className={`grid transition-all duration-200 ease-out
        ${abierto ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
        <div className="min-h-0 overflow-hidden">
          <div className="space-y-3 border-t border-white/[0.07] px-3.5 py-3">
            <label className="block">
              <span className="etiqueta text-[10px]">Fecha del viaje</span>
              <Input className="mt-1 !py-1.5 !text-xs" type="date" value={fecha}
                onChange={(e) => onFecha(e.target.value)} />
            </label>

            <label className="block">
              <span className="etiqueta text-[10px]">Unidad</span>
              <Select className="mt-1 !py-1.5 !text-xs" value={vehiculo?.id ?? ''}
                onChange={(e) => onVehiculo(e.target.value)}>
                <option value="">— Sin asignar —</option>
                {vehiculos.map((v) => <option key={v.id} value={v.id}>{v.nombre}</option>)}
              </Select>
              <span className="mt-1 block text-[10px] leading-tight text-ink-mute">
                Define el % de renta y el rendimiento.
              </span>
            </label>

            <button type="button" onClick={() => onRoundtrip(!roundtrip)}
              className="flex w-full items-center justify-between gap-2 rounded-xl border
                border-white/[0.07] bg-white/[0.03] px-3 py-2 text-left transition
                hover:border-white/20">
              <span className="text-xs text-ink-soft">
                Ida y vuelta
                <span className="mt-0.5 block text-[10px] leading-tight text-ink-mute">
                  {roundtrip ? 'Cuenta el regreso a la bodega.' : 'La camioneta se queda fuera.'}
                </span>
              </span>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                roundtrip ? 'bg-acento/15 text-acento' : 'bg-surface-raised text-ink-mute'}`}>
                {roundtrip ? 'Sí' : 'No'}
              </span>
            </button>

            <div>
              <span className="etiqueta text-[10px]">Ayudantes</span>
              <div className="mt-1 flex gap-1.5">
                {[0, 1, 2].map((n) => (
                  <button key={n} type="button" onClick={() => onAyudantes(n)}
                    aria-pressed={numAyudantes === n}
                    className={`flex-1 rounded-lg border py-1 text-xs font-medium transition ${
                      numAyudantes === n
                        ? 'border-acento/40 bg-acento/15 text-acento'
                        : 'border-white/[0.07] bg-white/[0.03] text-ink-mute hover:text-ink'
                    }`}>
                    {n}
                  </button>
                ))}
              </div>
            </div>

            {fijo && (
              <p className="text-[10px] text-ink-mute">Fijo abierto. Toca el título para cerrarlo.</p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   El resultado del viaje
   ══════════════════════════════════════════════════════════════════════════ */

function PanelViaje({
  misiones, venta, km, viaje, calculando, listo, errorRuta, error, cargando,
  rendimiento, pctRenta, pctAdmon, numAyudantes, onCrear,
}: {
  misiones: number;
  venta: number;
  km: number;
  viaje: ReturnType<typeof desglosarFlete>;
  calculando: boolean;
  listo: boolean;
  errorRuta: string | null;
  error: string | null;
  cargando: boolean;
  rendimiento: number;
  pctRenta: number;
  pctAdmon: number;
  numAyudantes: number;
  onCrear: () => void;
}) {
  const { abierto, props, alternar } = useDesplegable();

  if (misiones === 0) {
    return (
      <section className="vidrio pointer-events-auto mt-auto shrink-0 px-3.5 py-3">
        <p className="text-xs leading-relaxed text-ink-mute">
          Aquí va lo que deja el viaje: cuánto cobras, cuánto se va en gasolina y comisiones,
          y qué queda. Agrega la primera misión.
        </p>
      </section>
    );
  }

  return (
    <section {...props}
      className="vidrio pointer-events-auto mt-auto shrink-0 overflow-hidden">
      {/* El desglose, arriba: se despliega hacia abajo empujando la cifra
          grande, que se queda siempre a la vista y siempre en el mismo sitio. */}
      <div className={`grid transition-all duration-200 ease-out
        ${abierto ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
        <div className="min-h-0 overflow-hidden">
          <div className="space-y-1 border-b border-white/[0.07] px-3.5 py-3">
            <Renglon etiqueta="Cobras" valor={mxn(venta)} fuerte />
            <Renglon etiqueta={`Gasolina · ${rendimiento} km/l`} valor={`−${mxn(viaje.gasolina)}`} />
            <Renglon etiqueta={`Renta de la unidad · ${pctRenta}%`} valor={`−${mxn(viaje.renta)}`} />
            <Renglon
              etiqueta={`Comisiones · chofer, ${numAyudantes === 1 ? 'ayudante' : `${numAyudantes} ayudantes`} y venta`}
              valor={`−${mxn(viaje.chofer + viaje.ayudante + viaje.venta)}`} />
            <Renglon etiqueta={`Administración · ${pctAdmon}%`} valor={`−${mxn(viaje.admon)}`} />
            {viaje.precioMinimo != null && (
              <p className="pt-1.5 text-[10px] leading-tight text-ink-mute">
                Punto de equilibrio del viaje: <span className="cifra">{mxn(viaje.precioMinimo)}</span>.
                La administración es tu utilidad, no se le paga a nadie.
              </p>
            )}
          </div>
        </div>
      </div>

      <button type="button" onClick={alternar} aria-expanded={abierto}
        className="w-full px-3.5 pb-2 pt-3 text-left">
        <div className="flex items-baseline justify-between gap-2">
          <span className="etiqueta text-[10px]">Utilidad del viaje</span>
          <span className="text-[10px] text-ink-mute">
            {calculando ? 'trazando…'
              : listo ? `${km.toLocaleString('es-MX')} km · ${tiempoEstimado(km)}`
              : '—'}
          </span>
        </div>
        <div className="mt-1 flex items-end justify-between gap-3">
          <span className={`cifra text-3xl font-light leading-none tracking-tight ${
            viaje.utilidad < 0 ? 'text-bad' : 'text-good'}`}>
            {mxn(viaje.utilidad)}
          </span>
          <span className="flex items-center gap-2">
            <Etiqueta tono={viaje.salud === 'sano' ? 'bueno'
              : viaje.salud === 'apretado' ? 'aviso' : 'malo'}>
              {viaje.margenPct.toFixed(0)}%
            </Etiqueta>
            <span aria-hidden className={`text-[10px] text-ink-mute transition-transform
              ${abierto ? 'rotate-180' : ''}`}>▾</span>
          </span>
        </div>
      </button>

      {(errorRuta || error) && (
        <p className="mx-3.5 mb-2 rounded-lg border border-warn/25 bg-warn/10 px-2.5 py-1.5
          text-[11px] leading-tight text-warn">
          {error ?? errorRuta}
        </p>
      )}

      <div className="px-3.5 pb-3">
        <button type="button" onClick={onCrear} disabled={cargando || calculando || !listo}
          className="boton w-full disabled:cursor-not-allowed disabled:opacity-50">
          {cargando ? 'Creando…'
            : `Crear ruta con ${misiones} ${misiones === 1 ? 'misión' : 'misiones'}`}
        </button>
      </div>
    </section>
  );
}

function Renglon({ etiqueta, valor, fuerte }: {
  etiqueta: string; valor: string; fuerte?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className={`text-[11px] leading-tight ${fuerte ? 'text-ink' : 'text-ink-soft'}`}>
        {etiqueta}
      </span>
      <span className={`cifra shrink-0 text-[11px] ${fuerte ? 'font-medium text-ink' : 'text-ink-soft'}`}>
        {valor}
      </span>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Una misión de la lista
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Cerrada dice lo único que se lee de corrido: a dónde y cuánto. El tamaño y
 * el precio sugerido aparecen al acercarse, y el resto —cliente, vendedor,
 * cómo salió el precio— solo si se pide.
 */
function FilaMision({
  mision, numero, tramo, sugerido, clientes, vendedores, onTamano, onCambio, onQuitar,
}: {
  mision: Mision;
  numero: number;
  tramo?: number;
  sugerido: ReturnType<typeof calcPrecio>;
  clientes: Contacto[];
  vendedores: Contacto[];
  onTamano: (t: TamanoCarga) => void;
  onCambio: (c: Partial<Mision>) => void;
  onQuitar: () => void;
}) {
  const { abierto, props } = useDesplegable();
  const [detalle, setDetalle] = useState(false);
  const precio = Number(mision.precio) || 0;
  const bajoElSugerido = precio > 0 && precio < sugerido.precioFinal;

  return (
    <li {...props} className="px-3 py-2.5 transition-colors hover:bg-white/[0.03]">
      <div className="flex items-start gap-2">
        <span className="cifra mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full
          bg-brand/25 text-[10px] font-medium text-brand">{numero}</span>

        <div className="min-w-0 flex-1">
          {/* El nombre se puede corregir: lo que devuelve el buscador suele ser
              el de la colonia, y en la ruta lo que sirve es cómo lo llaman. */}
          <input value={mision.destino}
            onChange={(e) => onCambio({ destino: e.target.value })}
            className="w-full rounded border border-transparent bg-transparent px-1 py-0.5
              text-xs font-medium text-ink outline-none transition hover:border-white/[0.09]
              focus:border-brand focus:bg-surface-raised" />
          <p className="truncate px-1 text-[10px] leading-tight text-ink-mute">
            {mision.zona || mision.descripcion}
            {tramo != null && ` · ${tramo} km`}
          </p>
        </div>

        <div className="relative w-[5.5rem] shrink-0">
          <span aria-hidden
            className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[11px] text-ink-mute">$</span>
          <Input className="cifra !py-1 !pl-5 !text-xs text-right" type="number" inputMode="decimal"
            value={mision.precio}
            onChange={(e) => onCambio({ precio: e.target.value, precioTocado: true })} />
        </div>

        <button onClick={onQuitar} aria-label="Quitar misión"
          className="shrink-0 rounded-full px-1 text-ink-mute/50 transition hover:text-bad">✕</button>
      </div>

      {/* Tamaño y precio sugerido: se revelan al acercarse. Siempre visibles
          harían de la lista un formulario, y de un viaje de cinco misiones una
          pantalla que ya no cabe. */}
      <div className={`grid transition-all duration-150 ease-out
        ${abierto || detalle ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
        <div className="min-h-0 overflow-hidden">
          <div className="flex flex-wrap items-center gap-1 pl-7 pt-2">
            {TAMANOS.map((t) => (
              <button key={t} type="button" onClick={() => onTamano(t)}
                aria-pressed={mision.tamano === t}
                className={`rounded-full border px-2 py-0.5 text-[10px] font-medium transition ${
                  mision.tamano === t
                    ? 'border-acento/40 bg-acento/15 text-acento'
                    : 'border-white/[0.07] bg-white/[0.03] text-ink-mute hover:text-ink'
                }`}>
                {t === 'Extra Grande' ? 'XG' : t}
              </button>
            ))}
            <button type="button" onClick={() => setDetalle((v) => !v)}
              className="ml-auto text-[10px] text-ink-mute transition hover:text-ink">
              {precio !== sugerido.precioFinal ? `sug. ${mxn(sugerido.precioFinal)}` : 'sug. ✓'}
            </button>
            {bajoElSugerido && <Etiqueta tono="aviso">bajo</Etiqueta>}
          </div>

          {detalle && (
            <div className="mt-2 space-y-2 rounded-xl border border-white/[0.07] bg-black/20 p-2.5">
              <p className="text-[10px] leading-tight text-ink-mute">
                {ETIQUETAS_BANDA[sugerido.banda]} · {sugerido.km} km en carretera ·
                costo estimado {mxn(sugerido.costoTotal)}
              </p>
              <Select className="!py-1 !text-xs" value={mision.clienteId}
                onChange={(e) => onCambio({ clienteId: e.target.value })}>
                <option value="">— Sin cliente —</option>
                {clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </Select>
              <Select className="!py-1 !text-xs" value={mision.vendedorId}
                onChange={(e) => onCambio({ vendedorId: e.target.value })}>
                <option value="">— Sin vendedor —</option>
                {vendedores.map((v) => <option key={v.id} value={v.id}>{v.nombre}</option>)}
              </Select>
            </div>
          )}
        </div>
      </div>
    </li>
  );
}
