import Link from 'next/link';
import Image from 'next/image';
import { db, dbConfigurada } from '@/lib/db';
import { Indicador, Comparativo, Dinero, Porcentaje, Sparkline, tonoMargen } from '@/components/Cifras';
import { mxn } from '@/lib/pricing';
import Tendencia, { PuntoMes, Granularidad } from './Tendencia';
import Reparto, { Tajada } from './Reparto';
import RepartoObjetivo from './RepartoObjetivo';
import FiltroDashboard from './FiltroDashboard';
import { repartoObjetivo } from '@/lib/objetivo';
import { configVigente } from '@/lib/config';
import { fechaCorta } from '@/lib/fechas';
import type { PnlMes, EnvioPnl, RutaPnl, Tripulante, Contacto, Vehiculo } from '@/types';

export const dynamic = 'force-dynamic';

type Periodo = 'mes' | '3m' | 'ano' | 'todo' | 'rango';

export default async function Rentabilidad({
  searchParams,
}: {
  searchParams: { p?: string; d?: string; h?: string };
}) {
  if (!dbConfigurada()) return <SinConfigurar />;

  // Un rango a mano solo vale si trae sus dos puntas; si falta una se cae al
  // periodo por omisión en vez de consultar medio filtro.
  const esRango = searchParams.p === 'rango' && !!searchParams.d && !!searchParams.h;
  const periodo: Periodo = esRango
    ? 'rango'
    : (['mes', '3m', 'ano', 'todo'].includes(searchParams.p ?? '') ? (searchParams.p as Periodo) : '3m');

  const { actual, previa } = ventana(periodo);
  const rango = esRango
    ? { desde: searchParams.d!, hasta: searchParams.h! }
    : { desde: actual ? `${actual[actual.length - 1]}-01` : null, hasta: null as string | null };

  const sb = db();
  const conRango = <T,>(q: T): T => {
    let x = q as never;
    if (rango.desde) x = (x as { gte: (c: string, v: string) => never }).gte('fecha', rango.desde);
    if (rango.hasta) x = (x as { lte: (c: string, v: string) => never }).lte('fecha', rango.hasta);
    return x as T;
  };

  const [meses, rutas, envios, trip, cont, veh, cfg, gastos, cobros] = await Promise.all([
    sb.from('v_pnl_mensual').select('*').limit(36),
    conRango(sb.from('v_ruta_pnl_full').select('*').order('fecha')),
    conRango(sb.from('v_envio_pnl').select('*')),
    sb.from('ruta_tripulacion').select('*').eq('rol', 'chofer'),
    sb.from('contactos').select('id, nombre'),
    sb.from('vehiculos').select('*'),
    configVigente(),
    // Los gastos fijos y las comisiones capturadas como gasto no cuelgan de
    // ninguna ruta, así que se traen por su propia fecha.
    conRango(sb.from('gastos').select('fecha, categoria, tipo, monto, ruta_id')),
    // Vive en fase4.sql: si no se ha corrido, la pantalla sigue abriendo y las
    // cifras de cobro se apagan solas.
    (async () => {
      try {
        const r = await conRango(sb.from('v_envio_cobro').select('fecha, venta, cobrado'));
        return r.error ? null : r.data;
      } catch { return null; }
    })(),
  ]);

  const error = meses.error ?? rutas.error ?? envios.error;
  if (error) return <ErrorBase mensaje={error.message} />;

  const filasMes = (meses.data ?? []) as PnlMes[];
  if (filasMes.length === 0) return <SinDatos />;

  const filasRuta = (rutas.data ?? []) as RutaPnl[];
  const filasEnvio = (envios.data ?? []) as EnvioPnl[];

  const filasGasto = (gastos.data ?? []) as FilaGasto[];
  const vehiculos = (veh.data ?? []) as Vehiculo[];

  // ── Venta contra cobrado ──
  // Vender no es cobrar. Un periodo con mucha venta y poco cobrado no es un
  // buen periodo: es uno con clientes que deben.
  const filasCobro = (cobros ?? []) as { venta: number; cobrado: number }[];
  const cobro = cobros == null ? null : {
    venta: filasCobro.reduce((a, c) => a + Number(c.venta), 0),
    cobrado: filasCobro.reduce((a, c) => a + Number(c.cobrado), 0),
    porCobrar: filasCobro.reduce((a, c) => a + Number(c.venta) - Number(c.cobrado), 0),
  };

  // ── Totales del periodo y del anterior, para el comparativo ──
  // Los atajos caen en meses completos y se suman de v_pnl_mensual. Un rango a
  // mano puede empezar a media quincena, donde el corte mensual ya no sirve:
  // ahí se suma viaje por viaje y gasto por gasto.
  const enVentana = (v: string[] | null) =>
    v == null ? filasMes : filasMes.filter((m) => v.includes(String(m.mes).slice(0, 7)));
  const hoy = periodo === 'rango'
    ? totalesDeRutas(filasRuta, filasGasto)
    : sumar(enVentana(actual));
  const antes = periodo === 'rango' ? null : previa ? sumar(enVentana(previa)) : null;

  // ── Cortes del periodo (se calculan aquí para que respeten el filtro) ──
  const choferPorRuta = new Map<string, string>();
  for (const t of (trip.data ?? []) as Tripulante[]) choferPorRuta.set(t.ruta_id, t.contacto_id);
  const nombrePorId = new Map(
    ((cont.data ?? []) as Pick<Contacto, 'id' | 'nombre'>[]).map((c) => [c.id, c.nombre])
  );

  const porUnidad = cortar(filasRuta, (r) => ({
    clave: r.vehiculo_id ?? 'sin-unidad',
    etiqueta: r.vehiculo ?? 'Sin unidad asignada',
    ingreso: Number(r.ingreso),
    utilidad: Number(r.utilidad),
    fecha: r.fecha,
  }));

  const porChofer = cortar(
    filasRuta.filter((r) => choferPorRuta.has(r.ruta_id)),
    (r) => {
      const id = choferPorRuta.get(r.ruta_id)!;
      return {
        clave: id,
        etiqueta: nombrePorId.get(id) ?? 'Sin nombre',
        ingreso: Number(r.ingreso),
        utilidad: Number(r.utilidad),
        fecha: r.fecha,
      };
    }
  );

  const porDestino = cortar(filasEnvio, (e) => ({
    clave: e.zona, etiqueta: e.zona, ingreso: Number(e.ingreso), utilidad: Number(e.utilidad),
    fecha: e.fecha,
  }));

  const conCliente = filasEnvio.filter((e) => e.cliente_id);
  const porCliente = cortar(conCliente, (e) => ({
    clave: e.cliente_id!, etiqueta: e.cliente ?? 'Sin nombre',
    ingreso: Number(e.ingreso), utilidad: Number(e.utilidad), fecha: e.fecha,
  }));

  const conTamano = filasEnvio.filter((e) => e.tamano_carga);
  const porTamano = cortar(conTamano, (e) => ({
    clave: e.tamano_carga!, etiqueta: e.tamano_carga!,
    ingreso: Number(e.ingreso), utilidad: Number(e.utilidad), fecha: e.fecha,
  }));

  const perdedoras = filasRuta
    .filter((r) => Number(r.utilidad) < 0)
    .sort((a, b) => Number(a.utilidad) - Number(b.utilidad))
    .slice(0, 6);

  const agrupadas = resumenAgrupar(filasRuta.filter((r) => r.num_envios > 1));
  const sencillas = resumenAgrupar(filasRuta.filter((r) => r.num_envios === 1));

  // ── La gráfica sigue al filtro: un mes se lee por día, tres por semana ──
  const granularidad: Granularidad = periodo === 'mes' ? 'dia'
    : periodo === '3m' ? 'semana'
    : periodo === 'rango' ? granularidadDeRango(rango.desde!, rango.hasta!)
    : 'mes';
  const puntos = serieTendencia(filasRuta, granularidad, actual);

  // ── A dónde se va cada peso ──
  // Las comisiones capturadas como gasto ya se cuentan en su propia tajada.
  const otrosViaje = hoy.gastosViaje - hoy.gasolina - hoy.casetas - hoy.comida - hoy.comisionGasto;
  const unidad = hoy.renta + hoy.gastosFijos;
  const tajadas: Tajada[] = [
    { etiqueta: 'Gasolina', monto: hoy.gasolina },
    { etiqueta: 'Casetas', monto: hoy.casetas },
    { etiqueta: 'Comida', monto: hoy.comida },
    { etiqueta: 'Comisiones', monto: hoy.comisiones, desglose: 'chofer, ayudante y vendedor' },
    { etiqueta: 'Unidad', monto: unidad, desglose: 'renta, mantenimiento, seguro' },
    {
      // No es un concepto: es lo que el Excel nunca desglosó. Se muestra como
      // hueco para que se note que falta clasificarlo, no como una categoría más.
      etiqueta: 'Sin desglosar', monto: otrosViaje, esHueco: true,
      desglose: 'el Excel no dice en qué',
      nota: otrosViaje > 0
        ? `${mxn(otrosViaje)} llegaron del Excel sin clasificar. Hasta que se les ponga categoría, ese pedazo del peso es una incógnita.`
        : undefined,
    },
    {
      etiqueta: 'Utilidad', monto: hoy.utilidadNeta, esUtilidad: true,
      nota: hoy.admon > 0 ? `La utilidad incluye ${mxn(hoy.admon)} de administración, que es tuya, no un pago a un tercero.` : undefined,
    },
  ];
  const sinPorcentajes = hoy.ingreso > 0 && hoy.comisiones === 0 && hoy.renta === 0;

  // ── A dónde DEBERÍA ir cada peso ──
  const objetivo = repartoObjetivo(
    filasRuta.map((r) => ({
      ingreso: Number(r.ingreso), km_total: r.km_total == null ? null : Number(r.km_total),
      vehiculo_id: r.vehiculo_id, gasolina: Number(r.gasolina), casetas: Number(r.casetas),
      comida: Number(r.comida), comisiones: Number(r.comisiones),
      renta_unidad: Number(r.renta_unidad), admon: Number(r.admon),
      gastos_directos: Number(r.gastos_directos),
    })),
    vehiculos,
    cfg,
  );

  // ── Huecos de captura que afectan estos números ──
  const huecos = [
    { n: filasEnvio.filter((e) => !e.cliente_id).length, texto: 'envíos sin cliente' },
    { n: filasEnvio.filter((e) => !e.tamano_carga).length, texto: 'envíos sin tamaño de carga' },
    { n: filasRuta.filter((r) => !r.km_total).length, texto: 'rutas sin kilómetros' },
    { n: filasRuta.filter((r) => !r.vehiculo_id).length, texto: 'rutas sin unidad' },
  ].filter((h) => h.n > 0);

  return (
    <div className="space-y-10">
      {/* La textura vive detrás del encabezado, recortada y muy tenue: da
          profundidad sin robarle atención a las cifras. */}
      <div className="relative flex flex-wrap items-end justify-between gap-6
        overflow-hidden rounded-2xl border border-white/[0.06] px-6 py-7">
        <Image src="/img/textura-rentabilidad.png" alt="" fill priority
          aria-hidden className="pointer-events-none object-cover opacity-[0.45]" />
        <div className="pointer-events-none absolute inset-0
          bg-gradient-to-r from-surface-sunk via-surface-sunk/80 to-transparent" />
        <div className="relative">
          <p className="etiqueta">{etiquetaPeriodo(periodo, actual, rango)}</p>
          <h1 className="mt-2 text-4xl font-medium tracking-tight">Rentabilidad</h1>
          <p className="mt-2 text-sm text-ink-mute">
            {hoy.viajes} viajes · {hoy.paradas} paradas entregadas
          </p>
        </div>
        <div className="relative">
          <FiltroDashboard preset={periodo}
            rango={{ desde: esRango ? rango.desde : null, hasta: esRango ? rango.hasta : null }} />
        </div>
      </div>

      {/* Mosaico: una cifra protagonista y cuatro que la explican. */}
      <section className="grid gap-4 lg:grid-cols-3">
        <div className="tarjeta relative flex flex-col justify-between overflow-hidden lg:row-span-3">
          <span aria-hidden className="halo -right-16 -top-20 h-56 w-56"
            style={{ background: 'radial-gradient(circle, rgba(215,240,0,0.16), transparent 70%)' }} />
          <div className="relative">
            <p className="etiqueta">Margen neto</p>
            <p className={`cifra mt-4 text-[4.5rem] font-light leading-[0.9] tracking-tighter ${
              hoy.margenNeto == null ? 'text-ink'
                : hoy.margenNeto < 0 ? 'text-bad'
                : hoy.margenNeto < 15 ? 'text-warn' : 'text-good'}`}>
              {hoy.margenNeto != null ? hoy.margenNeto.toFixed(1) : '—'}
              <span className="text-3xl font-light text-ink-mute">%</span>
            </p>
            <p className="mt-4 text-lg font-light">{veredicto(hoy.margenNeto)}</p>
            <p className="mt-2 text-xs text-ink-mute">{fraseMargen(hoy.margenNeto)}</p>
          </div>

          <div className="relative mt-8">
            <Escala valor={hoy.margenNeto} />
            <p className="mt-3 text-xs">
              <Comparativo actual={hoy.margenNeto ?? 0} anterior={antes?.margenNeto ?? null} puntos />
            </p>
          </div>
        </div>

        <Indicador etiqueta="Venta" valor={mxn(hoy.ingreso)} halo="teal"
          detalle={<Comparativo actual={hoy.ingreso} anterior={antes?.ingreso ?? null} />} />
        <Indicador etiqueta="Cobrado" valor={cobro ? mxn(cobro.cobrado) : '—'}
          tono={cobro && cobro.porCobrar > 0 ? 'aviso' : undefined}
          detalle={cobro
            ? (cobro.porCobrar > 0
                ? `${mxn(cobro.porCobrar)} siguen por cobrar`
                : 'todo lo vendido ya entró')
            : 'falta correr fase4.sql'} />
        <Indicador etiqueta="Utilidad neta" valor={mxn(hoy.utilidadNeta)} halo="naranja"
          tono={tonoMargen(hoy.margenNeto)}
          detalle={<Comparativo actual={hoy.utilidadNeta} anterior={antes?.utilidadNeta ?? null} />} />
        <Indicador etiqueta="Ticket promedio" valor={mxn(hoy.ticket)}
          detalle={<Comparativo actual={hoy.ticket} anterior={antes?.ticket ?? null} />} />
        <Indicador etiqueta="Utilidad por parada"
          valor={mxn(hoy.paradas > 0 ? hoy.utilidadNeta / hoy.paradas : 0)}
          detalle={`${hoy.paradas} paradas en el periodo`} />
      </section>

      <Tarjeta titulo="Tendencia" nota={etiquetaPeriodo(periodo, actual, rango)}>
        <Tendencia datos={puntos} granularidad={granularidad} />
      </Tarjeta>

      <Tarjeta titulo="A dónde va cada peso" nota={`de ${mxn(hoy.ingreso)} que vendiste`}>
        <Reparto tajadas={tajadas} ingreso={hoy.ingreso} />
        {sinPorcentajes && (
          <p className="px-6 pb-6 text-xs text-ink-mute">
            En este periodo no hay comisiones ni renta de unidad porque los viajes se
            registraron sin el modelo de porcentajes. Así fue como ocurrieron: su utilidad
            es ingreso menos gastos reales.
          </p>
        )}
      </Tarjeta>

      <Tarjeta titulo="A dónde debería ir cada peso"
        nota="Según la configuración del negocio">
        <RepartoObjetivo reparto={objetivo} />
      </Tarjeta>

      <div className="grid gap-6 lg:grid-cols-2">
        <Tarjeta titulo="El efecto de agrupar" nota="Por parada entregada">
          {agrupadas && sencillas ? (
            <div className="px-6 pb-6">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs uppercase tracking-wide text-ink-mute">
                    <th className="py-2 text-left"></th>
                    <th className="py-2 text-right">Sencillas</th>
                    <th className="py-2 text-right">Agrupadas</th>
                  </tr>
                </thead>
                <tbody>
                  <FilaAgrupar etiqueta="Viajes" a={sencillas.viajes} b={agrupadas.viajes} tipo="numero" />
                  <FilaAgrupar etiqueta="Paradas" a={sencillas.paradas} b={agrupadas.paradas} tipo="numero" />
                  <FilaAgrupar etiqueta="Ingreso por parada" a={sencillas.ingresoPorParada} b={agrupadas.ingresoPorParada} tipo="dinero" />
                  <FilaAgrupar etiqueta="Gasto de viaje por parada" a={sencillas.gastoPorParada} b={agrupadas.gastoPorParada} tipo="dinero" />
                  <FilaAgrupar etiqueta="Utilidad por parada" a={sencillas.utilidadPorParada} b={agrupadas.utilidadPorParada} tipo="dinero" />
                  <FilaAgrupar etiqueta="Margen" a={sencillas.margen} b={agrupadas.margen} tipo="pct" />
                </tbody>
              </table>
              <p className="mt-4 text-sm text-ink-soft">
                {agrupadas.utilidadPorParada > sencillas.utilidadPorParada ? (
                  <>Agrupar deja <strong>{mxn(agrupadas.utilidadPorParada - sencillas.utilidadPorParada)} más
                  de utilidad por parada</strong>, porque el gasto de viaje por parada baja{' '}
                  {mxn(sencillas.gastoPorParada - agrupadas.gastoPorParada)}.</>
                ) : (
                  <>Con estos datos, agrupar todavía no deja más utilidad por parada. Vale la pena
                  revisar si las rutas agrupadas están cobrando completo cada entrega.</>
                )}
              </p>
            </div>
          ) : (
            <p className="px-6 pb-8 text-sm text-ink-mute">
              Hacen falta viajes de los dos tipos —de una parada y de varias— para poder comparar.
            </p>
          )}
        </Tarjeta>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <TablaCorte titulo="Por unidad" columna="Unidad" filas={porUnidad} unidad="viajes" href="/flotilla" />
        <TablaCorte titulo="Por chofer" columna="Chofer" filas={porChofer} unidad="viajes" href="/contactos" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <TablaCorte titulo="Por destino" columna="Destino" filas={porDestino.slice(0, 10)}
          unidad="envíos" nota={porDestino.length > 10 ? `Los 10 mejores de ${porDestino.length}` : undefined} />

        <Tarjeta titulo="Rutas que perdieron dinero" href="/rutas"
          nota={perdedoras.length > 0 ? `${perdedoras.length} en el periodo` : undefined}>
          {perdedoras.length === 0 ? (
            <p className="px-6 pb-8 text-sm text-ink-mute">
              Ninguna ruta cerró en pérdida en este periodo.
            </p>
          ) : (
            <div className="overflow-x-auto px-6 pb-5">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs uppercase tracking-wide text-ink-mute">
                    <th className="py-2 pr-4 text-left">Ruta</th>
                    <th className="py-2 pr-4 text-left">Fecha</th>
                    <th className="py-2 pr-4 text-right">Ingreso</th>
                    <th className="py-2 pr-4 text-right">Gastos</th>
                    <th className="py-2 text-right">Utilidad</th>
                  </tr>
                </thead>
                <tbody>
                  {perdedoras.map((r) => (
                    <tr key={r.ruta_id} className="fila">
                      <td className="py-2 pr-4">
                        <Link href={`/rutas/${r.ruta_id}`} className="cifra text-brand hover:underline">
                          #{r.folio}
                        </Link>
                        <span className="ml-2 text-xs text-ink-mute">{r.vehiculo ?? 'sin unidad'}</span>
                        {r.num_envios > 1 && (
                          <span className="ml-2 text-xs text-ink-mute">· {r.num_envios} paradas</span>
                        )}
                      </td>
                      <td className="py-2 pr-4 text-ink-soft">{r.fecha}</td>
                      <td className="py-2 pr-4 text-right"><Dinero n={Number(r.ingreso)} /></td>
                      <td className="py-2 pr-4 text-right"><Dinero n={Number(r.gastos_directos)} /></td>
                      <td className="py-2 text-right cifra text-bad">{mxn(Number(r.utilidad))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Tarjeta>
      </div>

      {(porCliente.length > 0 || porTamano.length > 0) && (
        <div className="grid gap-6 lg:grid-cols-2">
          {porCliente.length > 0 && (
            <TablaCorte titulo="Por cliente" columna="Cliente" filas={porCliente.slice(0, 10)}
              unidad="envíos"
              nota={`Solo los ${conCliente.length} envíos con cliente capturado`} />
          )}
          {porTamano.length > 0 && (
            <TablaCorte titulo="Por tamaño de carga" columna="Tamaño" filas={porTamano}
              unidad="envíos"
              nota={`Solo los ${conTamano.length} envíos con tamaño capturado`} />
          )}
        </div>
      )}

      <Tarjeta titulo="Mes a mes" nota="La tabla detrás de la gráfica">
        <div className="overflow-x-auto px-6 pb-5">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-ink-mute">
                <th className="py-2 pr-4 text-left">Mes</th>
                <th className="py-2 pr-4 text-right">Viajes</th>
                <th className="py-2 pr-4 text-right">Ingreso</th>
                <th className="py-2 pr-4 text-right">Gastos de viaje</th>
                <th className="py-2 pr-4 text-right">Comisiones</th>
                <th className="py-2 pr-4 text-right">Gastos fijos</th>
                <th className="py-2 pr-4 text-right">Utilidad neta</th>
                <th className="py-2 text-right">Margen</th>
              </tr>
            </thead>
            <tbody>
              {filasMes.map((m) => {
                const enPeriodo = actual == null || actual.includes(String(m.mes).slice(0, 7));
                return (
                  <tr key={String(m.mes)}
                    className={`border-t border-surface-line ${enPeriodo ? '' : 'text-ink-mute opacity-60'}`}>
                    <td className="py-2 pr-4 font-medium">{nombreMes(String(m.mes))}</td>
                    <td className="py-2 pr-4 text-right cifra">{m.viajes}</td>
                    <td className="py-2 pr-4 text-right"><Dinero n={Number(m.ingreso)} /></td>
                    <td className="py-2 pr-4 text-right"><Dinero n={Number(m.gastos_viaje)} /></td>
                    <td className="py-2 pr-4 text-right"><Dinero n={Number(m.comisiones)} /></td>
                    <td className="py-2 pr-4 text-right"><Dinero n={Number(m.gastos_fijos)} /></td>
                    <td className="py-2 pr-4 text-right"><Dinero n={Number(m.utilidad_neta)} /></td>
                    <td className="py-2 text-right">
                      <Porcentaje n={m.margen_neto_pct != null ? Number(m.margen_neto_pct) : null} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Tarjeta>

      {huecos.length > 0 && (
        <section className="tarjeta">
          <h2 className="text-sm font-semibold">Para afinar estos números</h2>
          <p className="mt-1 text-sm text-ink-soft">
            En el periodo hay {huecos.map((h) => `${h.n} ${h.texto}`).join(', ')}. Cada dato que
            falta es un corte que no se puede hacer: sin cliente no hay rentabilidad por cliente,
            sin kilómetros no hay costo por km.
          </p>
        </section>
      )}
    </div>
  );
}

/* ══════════════════════════ Cálculo ══════════════════════════ */

/**
 * Con qué grano leer un rango a mano: la gráfica se ve bien entre 10 y 30
 * marcas. Menos de mes y medio se lee por día, menos de medio año por semana,
 * y de ahí en adelante por mes.
 */
function granularidadDeRango(desde: string, hasta: string): Granularidad {
  const dias = (Date.parse(hasta) - Date.parse(desde)) / 86400000;
  if (dias <= 45) return 'dia';
  if (dias <= 180) return 'semana';
  return 'mes';
}

/** Los meses del periodo y los mismos de atrás, para comparar contra algo. */
function ventana(periodo: Periodo): { actual: string[] | null; previa: string[] | null } {
  // Un rango a mano no se expresa en meses: el filtro por fecha ya se aplicó
  // en la consulta y aquí no hay ventana mensual que calcular.
  if (periodo === 'todo' || periodo === 'rango') return { actual: null, previa: null };
  const hoy = new Date();
  const clave = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;
  const n = periodo === 'mes' ? 1 : periodo === '3m' ? 3 : hoy.getMonth() + 1;
  return {
    actual: Array.from({ length: n }, (_, i) => restarMeses(clave, i)),
    previa: Array.from({ length: n }, (_, i) => restarMeses(clave, n + i)),
  };
}

function restarMeses(clave: string, n: number): string {
  const [a, m] = clave.split('-').map(Number);
  const d = new Date(a, m - 1 - n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Fila mínima de `gastos` que necesita el tablero. */
interface FilaGasto {
  fecha: string; categoria: string; tipo: string; monto: number; ruta_id: string | null;
}

/**
 * Los mismos totales que `sumar`, pero armados desde los viajes y los gastos
 * en vez del corte mensual. Es lo único que funciona cuando el periodo no
 * empieza el día 1.
 */
function totalesDeRutas(rutas: RutaPnl[], gastos: FilaGasto[]) {
  const s = (f: (r: RutaPnl) => number | null | undefined) =>
    rutas.reduce((a, r) => a + Number(f(r) ?? 0), 0);

  const ingreso = s((r) => r.ingreso);
  const viajes = rutas.length;
  // Comisiones que se capturaron como gasto de viaje en vez de generarse al
  // cerrar: ya están dentro de gastos_directos, pero deben verse como comisión.
  const comisionGasto = gastos
    .filter((g) => g.categoria === 'comision' && g.ruta_id && g.tipo === 'operativo')
    .reduce((a, g) => a + Number(g.monto), 0);
  const gastosFijos = gastos
    .filter((g) => !g.ruta_id && g.tipo === 'operativo')
    .reduce((a, g) => a + Number(g.monto), 0);

  const utilidadOp = s((r) => r.utilidad);
  const utilidadNeta = utilidadOp - gastosFijos;

  return {
    ingreso,
    viajes,
    paradas: s((r) => r.num_envios),
    gasolina: s((r) => r.gasolina),
    casetas: s((r) => r.casetas),
    comida: s((r) => r.comida),
    gastosViaje: s((r) => r.gastos_directos),
    comisiones: s((r) => r.comisiones) + comisionGasto,
    comisionGasto,
    renta: s((r) => r.renta_unidad),
    admon: s((r) => r.admon),
    utilidadOp,
    gastosFijos,
    utilidadNeta,
    margenNeto: ingreso > 0 ? (utilidadNeta / ingreso) * 100 : null,
    ticket: viajes > 0 ? ingreso / viajes : 0,
  };
}

function sumar(filas: PnlMes[]) {
  const s = (f: (m: PnlMes) => number | null) =>
    filas.reduce((a, m) => a + Number(f(m) ?? 0), 0);
  const ingreso = s((m) => m.ingreso);
  const utilidadNeta = s((m) => m.utilidad_neta);
  const viajes = s((m) => m.viajes);
  return {
    ingreso,
    viajes,
    paradas: s((m) => m.paradas),
    gasolina: s((m) => m.gasolina),
    casetas: s((m) => m.casetas),
    comida: s((m) => m.comida),
    gastosViaje: s((m) => m.gastos_viaje),
    comisiones: s((m) => m.comisiones) + s((m) => m.comision_gasto),
    comisionGasto: s((m) => m.comision_gasto),
    renta: s((m) => m.renta_unidad),
    admon: s((m) => m.admon),
    utilidadOp: s((m) => m.utilidad_operativa),
    gastosFijos: s((m) => m.gastos_fijos),
    utilidadNeta,
    margenNeto: ingreso > 0 ? (utilidadNeta / ingreso) * 100 : null,
    ticket: viajes > 0 ? ingreso / viajes : 0,
  };
}

interface Corte {
  clave: string; etiqueta: string; n: number;
  ingreso: number; utilidad: number; margen: number | null;
  /** Utilidad mes a mes, para el sparkline de la fila. */
  serie: number[];
}

/**
 * Agrupa filas por una dimensión y arma de paso la serie mensual de utilidad.
 * Todas las series comparten el mismo eje de meses para que las tendencias de
 * distintas filas se puedan comparar entre sí.
 */
function cortar<T>(
  filas: T[],
  f: (x: T) => { clave: string; etiqueta: string; ingreso: number; utilidad: number; fecha: string }
): Corte[] {
  interface Acc { clave: string; etiqueta: string; n: number; ingreso: number; utilidad: number; meses: Map<string, number> }
  const mapa = new Map<string, Acc>();
  const todosLosMeses = new Set<string>();

  for (const fila of filas) {
    const d = f(fila);
    const mes = d.fecha.slice(0, 7);
    todosLosMeses.add(mes);
    const c = mapa.get(d.clave)
      ?? { clave: d.clave, etiqueta: d.etiqueta, n: 0, ingreso: 0, utilidad: 0, meses: new Map() };
    c.n += 1;
    c.ingreso += d.ingreso;
    c.utilidad += d.utilidad;
    c.meses.set(mes, (c.meses.get(mes) ?? 0) + d.utilidad);
    mapa.set(d.clave, c);
  }

  const eje = [...todosLosMeses].sort();
  return [...mapa.values()]
    .map((c) => ({
      clave: c.clave, etiqueta: c.etiqueta, n: c.n, ingreso: c.ingreso, utilidad: c.utilidad,
      margen: c.ingreso > 0 ? (c.utilidad / c.ingreso) * 100 : null,
      serie: eje.map((m) => c.meses.get(m) ?? 0),
    }))
    .sort((a, b) => b.utilidad - a.utilidad);
}

function resumenAgrupar(filas: RutaPnl[]) {
  if (filas.length === 0) return null;
  const paradas = filas.reduce((s, r) => s + Number(r.num_envios), 0);
  const ingreso = filas.reduce((s, r) => s + Number(r.ingreso), 0);
  const gastos = filas.reduce((s, r) => s + Number(r.gastos_directos), 0);
  const utilidad = filas.reduce((s, r) => s + Number(r.utilidad), 0);
  return {
    viajes: filas.length,
    paradas,
    ingresoPorParada: paradas > 0 ? ingreso / paradas : 0,
    gastoPorParada: paradas > 0 ? gastos / paradas : 0,
    utilidadPorParada: paradas > 0 ? utilidad / paradas : 0,
    margen: ingreso > 0 ? (utilidad / ingreso) * 100 : 0,
  };
}


/* ── Serie de la gráfica ─────────────────────────────────────────────────── */

/**
 * Agrupa los viajes en cubetas de día, semana o mes, generando también las
 * cubetas vacías: un día sin viajes es un cero que hay que ver, no un hueco
 * que la línea salta como si no hubiera pasado.
 */
function serieTendencia(
  filas: RutaPnl[], gran: Granularidad, ventanaActual: string[] | null
): PuntoMes[] {
  const acumulado = new Map<string, { ingreso: number; utilidad: number }>();
  for (const r of filas) {
    const clave = claveDe(r.fecha, gran);
    const a = acumulado.get(clave) ?? { ingreso: 0, utilidad: 0 };
    a.ingreso += Number(r.ingreso);
    a.utilidad += Number(r.utilidad);
    acumulado.set(clave, a);
  }
  if (acumulado.size === 0) return [];

  const claves = [...acumulado.keys()].sort();
  const inicio = fechaDe(claves[0]);
  const fin = ventanaActual ? new Date() : fechaDe(claves[claves.length - 1]);

  const puntos: PuntoMes[] = [];
  const cursor = new Date(inicio);
  // Tope de seguridad: 400 cubetas es más de lo que cabe en cualquier gráfica.
  for (let i = 0; cursor <= fin && i < 400; i++) {
    const clave = claveDe(iso(cursor), gran);
    const a = acumulado.get(clave) ?? { ingreso: 0, utilidad: 0 };
    puntos.push({ clave, etiqueta: etiquetaDe(cursor, gran), detalle: detalleDe(cursor, gran), ...a });
    if (gran === 'dia') cursor.setDate(cursor.getDate() + 1);
    else if (gran === 'semana') cursor.setDate(cursor.getDate() + 7);
    else cursor.setMonth(cursor.getMonth() + 1);
  }
  return puntos;
}

/** La semana se ancla en lunes; el mes, en el día 1. */
function claveDe(fecha: string, gran: Granularidad): string {
  if (gran === 'mes') return fecha.slice(0, 7);
  if (gran === 'dia') return fecha.slice(0, 10);
  const d = fechaDe(fecha);
  const desplazamiento = (d.getDay() + 6) % 7;   // domingo = 6, lunes = 0
  d.setDate(d.getDate() - desplazamiento);
  return iso(d);
}

function fechaDe(clave: string): Date {
  const [a, m, d] = clave.split('-').map(Number);
  return new Date(a, (m ?? 1) - 1, d ?? 1);
}

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

function etiquetaDe(d: Date, gran: Granularidad): string {
  if (gran === 'mes') return `${MESES[d.getMonth()].slice(0, 3)} ${String(d.getFullYear()).slice(2)}`;
  if (gran === 'dia') return String(d.getDate());
  return `${d.getDate()} ${MESES[d.getMonth()].slice(0, 3).toLowerCase()}`;
}

function detalleDe(d: Date, gran: Granularidad): string {
  if (gran === 'mes') return `${MESES[d.getMonth()]} ${d.getFullYear()}`;
  if (gran === 'dia') return `${DIAS[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()].toLowerCase()}`;
  return `semana del ${d.getDate()} de ${MESES[d.getMonth()].toLowerCase()}`;
}


/** El margen traducido a centavos, que es como se siente el dinero. */
/** El margen se mide sobre lo vendido, no sobre lo cobrado: por eso "vendes". */
function fraseMargen(margen: number | null): string {
  if (margen == null) return 'Todavía no hay venta para calcularlo.';
  const centavos = Math.round(Math.abs(margen));
  return margen < 0
    ? `De cada peso que vendes, pones ${centavos} centavos de tu bolsa.`
    : `De cada peso que vendes, te quedan ${centavos} centavos después de todo.`;
}

/** El margen dicho en palabras, que es como se piensa un negocio. */
function veredicto(margen: number | null): string {
  if (margen == null) return 'Sin datos todavía';
  if (margen < 0) return 'Estás perdiendo dinero';
  if (margen < 15) return 'Apretado';
  if (margen < 30) return 'Sano';
  return 'Muy sano';
}

/**
 * Escala nombrada: el número solo no dice si está bien. La marca lima cae
 * donde estás, y los tramos dicen cómo se llama ese lugar.
 */
function Escala({ valor }: { valor: number | null }) {
  const tramos = ['Pérdida', 'Apretado', 'Sano', 'Muy sano'];
  // 0 %, 15 %, 30 % y 45 % reparten la barra en cuatro tramos iguales.
  const pos = valor == null ? null : Math.max(0, Math.min(100, ((valor + 15) / 60) * 100));
  return (
    <div>
      <div className="relative h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
        <div className="absolute inset-y-0 left-0 w-1/4 bg-bad/40" />
        <div className="absolute inset-y-0 left-1/4 w-1/4 bg-warn/40" />
        <div className="absolute inset-y-0 left-2/4 w-2/4 bg-good/40" />
        {pos != null && (
          <span className="absolute -top-0.5 h-2.5 w-2.5 -translate-x-1/2 rounded-full bg-acento
            ring-2 ring-surface" style={{ left: `${pos}%` }} />
        )}
      </div>
      <div className="mt-2 flex justify-between text-[11px] text-ink-mute">
        {tramos.map((t) => <span key={t}>{t}</span>)}
      </div>
    </div>
  );
}

/* ══════════════════════════ Presentación ══════════════════════════ */

function Tarjeta({
  titulo, nota, href, children,
}: { titulo: string; nota?: string; href?: string; children: React.ReactNode }) {
  return (
    <section className="tarjeta-tabla">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-white/[0.06] px-6 py-4">
        <h2 className="text-sm font-medium tracking-tight">{titulo}</h2>
        <div className="flex items-center gap-3">
          {nota && <span className="text-xs text-ink-mute">{nota}</span>}
          {href && (
            <Link href={href} aria-label={`Ver ${titulo}`}
              className="text-ink-mute transition hover:text-acento">↗</Link>
          )}
        </div>
      </div>
      {children}
    </section>
  );
}

function TablaCorte({
  titulo, columna, filas, unidad, nota, href,
}: { titulo: string; columna: string; filas: Corte[]; unidad: string; nota?: string; href?: string }) {
  const total = filas.reduce((s, f) => s + f.utilidad, 0);
  return (
    <Tarjeta titulo={titulo} nota={nota} href={href}>
      {filas.length === 0 ? (
        <p className="px-6 pb-8 text-sm text-ink-mute">Sin datos en el periodo.</p>
      ) : (
        <div className="overflow-x-auto px-6 pb-5">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-ink-mute">
                <th className="py-2 pr-4 text-left">{columna}</th>
                <th className="py-2 pr-4 text-right">{unidad}</th>
                <th className="py-2 pr-4 text-right">Ingreso</th>
                <th className="py-2 pr-4 text-right">Utilidad</th>
                <th className="py-2 pr-4 text-right">Margen</th>
                <th className="py-2 text-right">Tendencia</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.clave} className="fila">
                  <td className="py-2.5 pr-4 font-medium">{f.etiqueta}</td>
                  <td className="py-2.5 pr-4 text-right cifra text-ink-soft">{f.n}</td>
                  <td className="py-2.5 pr-4 text-right"><Dinero n={f.ingreso} /></td>
                  <td className="py-2.5 pr-4 text-right"><Dinero n={f.utilidad} /></td>
                  <td className="py-2.5 pr-4 text-right"><Porcentaje n={f.margen} /></td>
                  <td className="py-2.5 pl-2">
                    <span className="flex justify-end">
                      <Sparkline valores={f.serie}
                        titulo={`Utilidad mes a mes de ${f.etiqueta}`} />
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-surface-line">
                <td className="py-2 pr-4 text-xs uppercase tracking-wide text-ink-mute" colSpan={3}>
                  Total
                </td>
                <td className="py-2 pr-4 text-right cifra font-semibold">{mxn(total)}</td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </Tarjeta>
  );
}

function FilaAgrupar({
  etiqueta, a, b, tipo,
}: { etiqueta: string; a: number; b: number; tipo: 'numero' | 'dinero' | 'pct' }) {
  const fmt = (n: number) =>
    tipo === 'dinero' ? mxn(n) : tipo === 'pct' ? `${n.toFixed(1)}%` : String(n);
  const mejor = b > a;
  return (
    <tr className="border-t border-surface-line">
      <td className="py-2 pr-4 text-ink-soft">{etiqueta}</td>
      <td className="py-2 text-right cifra">{fmt(a)}</td>
      <td className={`py-2 text-right cifra ${tipo !== 'numero' && mejor ? 'font-semibold text-good' : ''}`}>
        {fmt(b)}
      </td>
    </tr>
  );
}

function etiquetaPeriodo(
  p: Periodo, actual: string[] | null, rango?: { desde: string | null; hasta: string | null },
): string {
  if (p === 'rango' && rango?.desde && rango?.hasta) {
    return `${fechaCorta(rango.desde)} – ${fechaCorta(rango.hasta)}`;
  }
  if (p === 'todo' || !actual) return 'Histórico completo';
  if (p === 'mes') return nombreMes(`${actual[0]}-01`);
  const desde = nombreMes(`${actual[actual.length - 1]}-01`);
  const hasta = nombreMes(`${actual[0]}-01`);
  return `${desde} – ${hasta}`;
}

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
               'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

function nombreMes(iso: string): string {
  const [a, m] = iso.split('-');
  return `${MESES[Number(m) - 1]} ${a}`;
}

function mesCorto(iso: string): string {
  const [a, m] = iso.split('-');
  return `${MESES[Number(m) - 1].slice(0, 3)} ${a.slice(2)}`;
}

/* ══════════════════════════ Estados vacíos ══════════════════════════ */

function SinConfigurar() {
  return (
    <div className="tarjeta max-w-xl">
      <h1 className="font-semibold">Falta conectar la base de datos</h1>
      <p className="mt-2 text-sm text-ink-soft">
        Crea el archivo <code className="font-mono text-xs">.env.local</code> con{' '}
        <code className="font-mono text-xs">SUPABASE_URL</code> y{' '}
        <code className="font-mono text-xs">SUPABASE_SERVICE_ROLE_KEY</code>, y ejecuta{' '}
        <code className="font-mono text-xs">supabase/schema.sql</code> en el editor SQL de Supabase.
      </p>
    </div>
  );
}

function SinDatos() {
  return (
    <div className="tarjeta max-w-xl">
      <h1 className="font-semibold">Todavía no hay viajes registrados</h1>
      <p className="mt-2 text-sm text-ink-soft">
        Importa el histórico con <code className="font-mono text-xs">npm run import:historico</code> o
        captura tu primera ruta.
      </p>
    </div>
  );
}

function ErrorBase({ mensaje }: { mensaje: string }) {
  return (
    <div className="tarjeta max-w-xl border-bad/30">
      <h1 className="font-semibold text-bad">No se pudo leer la base</h1>
      <p className="mt-2 text-sm text-ink-soft">{mensaje}</p>
      <p className="mt-2 text-sm text-ink-mute">
        Si dice que no existe la relación, falta correr{' '}
        <code className="font-mono text-xs">supabase/fase3.sql</code> en el editor SQL de Supabase.
      </p>
    </div>
  );
}
