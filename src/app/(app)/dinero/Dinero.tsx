'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/cliente';
import { Input, Select, Boton, BotonMini, Aviso, Panel, Chip, Etiqueta, useAccion } from '@/components/ui';
import Comprobante, { type LineaComprobante } from '@/components/Comprobante';
import FiltroPeriodo, { rangoDe, dentro, type Preset, type Rango } from '@/components/FiltroPeriodo';
import Panorama, { type Saldos, type Flujo } from './Panorama';
import Movimientos, { type Movimiento } from './Movimientos';
import EnManosDe, { type SaldoCustodia, type Entrega } from './EnManosDe';
import FondoRenta, { type Fondo, type FondoUnidad, type RentaRuta, type PagoRenta } from './FondoRenta';
import { mxn } from '@/lib/pricing';
import { fechaCorta } from '@/lib/fechas';
import type { Vehiculo, Gasto, CategoriaGasto, TipoGasto, RolComision } from '@/types';

export interface CxC {
  envio_id: string; ruta_id: string | null; folio: number; fecha: string; destino: string;
  cliente: string | null; dias_credito: number | null; precio: number;
  cobrado: number; saldo: number; dias_transcurridos: number; vencido: boolean;
}
export interface ComPorPagar {
  contacto_id: string; nombre: string; num_comisiones: number; total_devengado: number; desde: string;
}
/** Una comisión devengada, ya resuelta con el folio y la fecha de su ruta. */
export interface ComDetalle {
  id: string; contacto_id: string; ruta_id: string; rol: RolComision;
  monto: number; folio: number | null; fecha: string | null;
}
export interface CajaMes {
  mes: string; entradas: number; entradas_contado: number; entradas_credito: number;
  salidas: number; salidas_operativas: number; salidas_inversion: number;
  salidas_retiro: number; salidas_comisiones: number; flujo_neto: number;
}

/** Movimientos crudos con fecha, para poder cortar el flujo por día. */
export interface MovVenta {
  envio_id: string; ruta_id: string; fecha: string; estado: string; destino: string;
  cliente_id: string | null; a_credito: boolean; venta: number;
  cobros_registrados: number; cobrado: number;
  // Fase 5. Ausentes mientras no se corra la migración: se leen como undefined.
  cobrado_por?: string | null; cobrado_por_otro?: string | null;
}
export interface MovGasto {
  id: string; fecha: string; tipo: string; monto: number;
  categoria: string; descripcion: string | null; ruta_id: string | null;
  pagado_por?: string | null; pagado_por_otro?: string | null;
}
export interface MovSimple {
  id: string; envio_id: string; fecha: string; monto: number; metodo: string | null;
  recibido_por?: string | null; recibido_por_otro?: string | null;
}
export interface MovComision {
  id: string; contacto_id: string; rol: string; ruta_id: string;
  fecha_pago: string | null; monto: number;
}

type Seccion = 'cobrar' | 'comisiones' | 'renta' | 'manos' | 'movimientos' | 'gastos' | 'caja';

const CAT_FIJAS: { v: CategoriaGasto; label: string }[] = [
  { v: 'mantenimiento', label: 'Mantenimiento' }, { v: 'seguro', label: 'Seguro' },
  { v: 'tenencia', label: 'Tenencia' }, { v: 'sueldo', label: 'Sueldo base' },
  { v: 'administrativo', label: 'Administrativo' }, { v: 'otro', label: 'Otro' },
];
const CAT_LABEL: Record<string, string> = Object.fromEntries(CAT_FIJAS.map((c) => [c.v, c.label]));

const TIPOS: { v: TipoGasto; label: string; hint: string }[] = [
  { v: 'operativo', label: 'Gasto fijo', hint: 'Sale del negocio y sí baja el margen.' },
  { v: 'inversion', label: 'Inversión', hint: 'Compra de activos. Afecta la caja, no el margen.' },
  { v: 'retiro', label: 'Retiro', hint: 'Dinero que sacas para ti. Afecta la caja, no el margen.' },
];

const METODOS = ['efectivo', 'transferencia', 'tarjeta'] as const;

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

export default function Dinero({
  cxc, comisiones, comisionesDetalle, gastosFijos, caja, vehiculos, nombrePorId, folioPorRuta,
  fondo, fondoUnidad, rentas, pagosRenta,
  enviosCobro, gastosTodos, cobrosTodos, comisionesPagadas,
  custodia, entregas, contactos, fase5,
}: {
  cxc: CxC[];
  comisiones: ComPorPagar[];
  comisionesDetalle: ComDetalle[];
  gastosFijos: Gasto[];
  caja: CajaMes[];
  vehiculos: Vehiculo[];
  nombrePorId: Record<string, string>;
  folioPorRuta: Record<string, number>;
  fondo: Fondo | null;
  fondoUnidad: FondoUnidad[];
  rentas: RentaRuta[];
  pagosRenta: PagoRenta[];
  enviosCobro: MovVenta[];
  gastosTodos: MovGasto[];
  cobrosTodos: MovSimple[];
  comisionesPagadas: MovComision[];
  custodia: SaldoCustodia[];
  entregas: Entrega[];
  contactos: { id: string; nombre: string }[];
  fase5: boolean;
}) {
  const router = useRouter();
  const { cargando, error, correr, setError } = useAccion();
  const [seccion, setSeccion] = useState<Seccion>('cobrar');

  // El filtro solo gobierna el flujo. Los saldos —caja, deudas, fondo— son de
  // hoy y no tienen periodo: recortarlos escondería dinero que sí se debe.
  const [preset, setPreset] = useState<Preset>('mes');
  const [rangoManual, setRangoManual] = useState<Rango>({ desde: null, hasta: null });
  const rango = useMemo(() => rangoDe(preset, rangoManual), [preset, rangoManual]);

  const saldoFondo = Number(fondo?.saldo ?? 0);
  // Dinero del negocio que no está en tu caja: lo trae alguien más. Solo las
  // cuentas con saldo a tu favor; las que están a mano no son "otras manos".
  const enOtrasManos = custodia
    .filter((c) => c.custodio !== 'caja' && c.saldo > 0.5)
    .reduce((a, c) => a + c.saldo, 0);
  const totalCxC = cxc.reduce((s, c) => s + Number(c.saldo), 0);
  const vencidas = cxc.filter((c) => c.vencido);
  const totalComs = comisiones.reduce((s, c) => s + Number(c.total_devengado), 0);
  const mesActual = new Date().toISOString().slice(0, 7);

  const flujo: Flujo = useMemo(() => {
    const enRango = (f: string | null) => !!f && dentro(f, rango);
    const vendiste = enviosCobro.filter((e) => enRango(e.fecha))
      .reduce((a, e) => a + Number(e.venta), 0);
    // Lo cobrado de esa venta: de contado entra el mismo día del viaje; el
    // crédito solo cuando hay un cobro capturado, y ese trae su propia fecha.
    const cobradoDeEsaVenta = enviosCobro.filter((e) => enRango(e.fecha))
      .reduce((a, e) => a + Number(e.cobrado), 0);
    const entroContado = enviosCobro.filter((e) => !e.a_credito && enRango(e.fecha))
      .reduce((a, e) => a + Number(e.cobrado), 0);
    const entroCredito = cobrosTodos.filter((c) => enRango(c.fecha))
      .reduce((a, c) => a + Number(c.monto), 0);
    const salio = gastosTodos.filter((g) => enRango(g.fecha)).reduce((a, g) => a + Number(g.monto), 0)
      + comisionesPagadas.filter((c) => enRango(c.fecha_pago)).reduce((a, c) => a + Number(c.monto), 0)
      + pagosRenta.filter((p) => enRango(p.fecha)).reduce((a, p) => a + Number(p.monto), 0);
    return {
      vendiste,
      entro: entroContado + entroCredito,
      salio,
      faltaEntrar: Math.max(0, vendiste - cobradoDeEsaVenta),
    };
  }, [enviosCobro, cobrosTodos, gastosTodos, comisionesPagadas, pagosRenta, rango]);

  /**
   * Los saldos también se cortan por fecha, porque la gestión de la unidad
   * empieza en un día concreto y el acumulado de antes no habla de ella.
   *
   * Lo que queda fuera no se descarta: se suma aparte y la pantalla lo declara.
   * Una comisión de mayo se sigue debiendo aunque el filtro esté en junio, y
   * dejar que desaparezca al mover una fecha sería el peor error posible en
   * una pantalla de dinero.
   */
  const saldos: Saldos = useMemo(() => {
    const enRango = (f: string | null) => !!f && dentro(f, rango);
    const parte = <T,>(filas: T[], fecha: (x: T) => string | null, monto: (x: T) => number) => {
      let dentroP = 0, fueraP = 0;
      for (const x of filas) {
        if (enRango(fecha(x))) dentroP += monto(x);
        else fueraP += monto(x);
      }
      return { dentro: dentroP, fuera: fueraP };
    };

    // El fondo del periodo: lo que retuvieron sus viajes menos lo que salió en
    // esas mismas fechas.
    const devengado = parte(rentas, (r) => r.fecha, (r) => Number(r.renta_unidad));
    const salidas = parte(pagosRenta, (p) => p.fecha, (p) => Number(p.monto));
    const fondoDentro = devengado.dentro - salidas.dentro;
    const fondoFuera = devengado.fuera - salidas.fuera;

    const coms = parte(comisionesDetalle, (c) => c.fecha, (c) => Number(c.monto));
    const deudas = parte(cxc, (c) => c.fecha, (c) => Number(c.saldo));

    // Lo que la operación dejó fuera del periodo. Se arma de los movimientos
    // crudos y no del corte mensual: con un rango que empieza el día 5, la
    // fila del mes caería entera de un lado y la cifra mentiría.
    const entroFuera =
      enviosCobro.filter((e) => !e.a_credito && !enRango(e.fecha))
        .reduce((a, e) => a + Number(e.cobrado), 0)
      + cobrosTodos.filter((c) => !enRango(c.fecha)).reduce((a, c) => a + Number(c.monto), 0);
    const salioFuera =
      gastosTodos.filter((g) => !enRango(g.fecha)).reduce((a, g) => a + Number(g.monto), 0)
      + comisionesPagadas.filter((c) => !enRango(c.fecha_pago)).reduce((a, c) => a + Number(c.monto), 0)
      + salidas.fuera;
    const cajaFuera = entroFuera - salioFuera;

    const enPeriodo = cxc.filter((c) => enRango(c.fecha));
    return {
      generado: flujo.entro - flujo.salio,
      fondoRenta: Math.max(0, fondoDentro),
      comisiones: coms.dentro,
      teDeben: deudas.dentro,
      enOtrasManos,
      cuentasAbiertas: custodia.filter((c) => c.custodio !== 'caja' && c.saldo > 0.5).length,
      cuentasVencidas: enPeriodo.filter((c) => c.vencido).length,
      cuentasTotales: enPeriodo.length,
      personasConComision: new Set(
        comisionesDetalle.filter((c) => enRango(c.fecha)).map((c) => c.contacto_id)
      ).size,
      fuera: {
        fondoRenta: Math.max(0, fondoFuera),
        comisiones: coms.fuera,
        teDeben: deudas.fuera,
        caja: cajaFuera,
      },
    };
  }, [rentas, pagosRenta, comisionesDetalle, cxc, flujo, rango, custodia, enOtrasManos,
      enviosCobro, cobrosTodos, gastosTodos, comisionesPagadas]);

  /**
   * El flujo desarmado en renglones, para poder conciliar contra el banco.
   *
   * Cada entrada dice si tiene comprobante o si se está asumiendo: un flete de
   * contado se da por cobrado al entregarse, y ahí es donde el sistema se
   * separa de la cuenta real cuando el cliente pagó de menos.
   */
  const movimientos: Movimiento[] = useMemo(() => {
    const enRango = (f: string | null) => !!f && dentro(f, rango);
    const folio = (rutaId: string) => folioPorRuta[rutaId] ?? '—';
    // Vacío = la caja. Se resuelve a nombre para poder marcarlo en el renglón.
    const quien = (id?: string | null, otro?: string | null) =>
      id ? (nombrePorId[id] ?? 'otra persona') : (otro?.trim() || null);
    const ms: Movimiento[] = [];

    for (const e of enviosCobro) {
      // El contado se asume cobrado al entregar; el crédito solo cuenta con su
      // cobro capturado, que entra más abajo con su propia fecha.
      if (e.a_credito || Number(e.cobrado) <= 0 || !enRango(e.fecha)) continue;
      ms.push({
        id: `envio-${e.envio_id}`, fecha: e.fecha, tipo: 'entrada',
        concepto: `Flete #${folio(e.ruta_id)} · ${e.destino}`,
        detalle: `contado${e.cliente_id ? ` · ${nombrePorId[e.cliente_id] ?? ''}` : ''} · se da por cobrado al entregar`,
        monto: Number(e.cobrado), supuesto: true,
        rutaId: e.ruta_id, envioId: e.envio_id, precio: Number(e.venta),
        enManosDe: quien(e.cobrado_por, e.cobrado_por_otro),
        custodiaId: e.cobrado_por ?? null,
        custodiaOtro: e.cobrado_por_otro ?? '',
      });
    }

    const envioPorId = new Map(enviosCobro.map((e) => [e.envio_id, e]));
    for (const c of cobrosTodos) {
      if (!enRango(c.fecha)) continue;
      const e = envioPorId.get(c.envio_id);
      ms.push({
        id: `cobro-${c.id}`, fecha: c.fecha, tipo: 'entrada',
        concepto: e ? `Cobro #${folio(e.ruta_id)} · ${e.destino}` : 'Cobro de crédito',
        detalle: `crédito${c.metodo ? ` · ${c.metodo}` : ''} · cobro registrado`,
        monto: Number(c.monto), rutaId: e?.ruta_id,
        enManosDe: quien(c.recibido_por, c.recibido_por_otro),
      });
    }

    for (const g of gastosTodos) {
      if (!enRango(g.fecha)) continue;
      ms.push({
        id: `gasto-${g.id}`, fecha: g.fecha, tipo: 'salida',
        concepto: `${g.categoria.charAt(0).toUpperCase()}${g.categoria.slice(1)}${g.ruta_id ? ` · #${folio(g.ruta_id)}` : ''}`,
        detalle: g.descripcion ?? (g.ruta_id ? 'gasto de viaje' : `${g.tipo} · fuera de ruta`),
        monto: Number(g.monto), rutaId: g.ruta_id ?? undefined,
        enManosDe: quien(g.pagado_por, g.pagado_por_otro),
      });
    }

    for (const c of comisionesPagadas) {
      if (!enRango(c.fecha_pago)) continue;
      ms.push({
        id: `comision-${c.id}`, fecha: c.fecha_pago!, tipo: 'salida',
        concepto: `Comisión · ${nombrePorId[c.contacto_id] ?? '—'}`,
        detalle: `${c.rol} · ruta #${folio(c.ruta_id)}`,
        monto: Number(c.monto), rutaId: c.ruta_id,
      });
    }

    for (const p of pagosRenta) {
      if (!enRango(p.fecha)) continue;
      ms.push({
        id: `renta-${p.id}`, fecha: p.fecha, tipo: 'salida',
        concepto: `Fondo de renta · ${p.concepto}`,
        detalle: [p.metodo, p.referencia].filter(Boolean).join(' · ') || 'salida del fondo',
        monto: Number(p.monto),
      });
    }

    return ms;
  }, [enviosCobro, cobrosTodos, gastosTodos, comisionesPagadas, pagosRenta, rango, folioPorRuta, nombrePorId]);

  async function accion(fn: () => Promise<void>) {
    await correr(async () => { await fn(); router.refresh(); });
  }

  const secciones: { id: Seccion; label: string; badge?: string }[] = [
    { id: 'cobrar', label: 'Por cobrar', badge: cxc.length ? String(cxc.length) : undefined },
    { id: 'comisiones', label: 'Comisiones', badge: comisiones.length ? String(comisiones.length) : undefined },
    { id: 'renta', label: 'Fondo de renta', badge: saldoFondo > 0 ? mxn(saldoFondo) : undefined },
    { id: 'manos', label: 'En manos de', badge: enOtrasManos > 0 ? mxn(enOtrasManos) : undefined },
    { id: 'movimientos', label: 'Movimientos', badge: String(movimientos.length) },
    { id: 'gastos', label: 'Gastos y retiros' },
    { id: 'caja', label: 'Caja' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="etiqueta">Tesorería</p>
        <h1 className="mt-2 text-4xl font-medium tracking-tight">Dinero</h1>
        <p className="mt-2 max-w-xl text-sm text-ink-mute">
          Cuánto hay, cuánto de eso no es tuyo y cuánto falta por entrar.
        </p>
      </div>
      <FiltroPeriodo preset={preset} rango={rangoManual}
        onCambio={(p, r) => { setPreset(p); setRangoManual(r); }} />
      </div>

      <Panorama saldos={saldos} flujo={flujo} seccion={seccion} onIr={setSeccion}
        etiquetaPeriodo={etiquetaDe(preset, rango)}
        hayFiltro={rango.desde != null || rango.hasta != null} />

      {/* Pestañas */}
      <div className="flex flex-wrap gap-1 border-b border-surface-line">
        {secciones.map((s) => (
          <button key={s.id} onClick={() => { setError(null); setSeccion(s.id); }}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition ${
              seccion === s.id
                ? 'border-brand text-brand'
                : 'border-transparent text-ink-mute hover:text-ink'
            }`}>
            {s.label}
            {s.badge && <span className="ml-2 rounded-full bg-surface-sunk px-2 py-0.5 text-xs">{s.badge}</span>}
          </button>
        ))}
      </div>

      <Aviso error={error} />

      {seccion === 'cobrar' && (
        <PorCobrar cxc={cxc} total={totalCxC} cargando={cargando} error={error}
          accion={accion} setError={setError} />
      )}
      {seccion === 'comisiones' && (
        <Comisiones personas={comisiones} detalle={comisionesDetalle} total={totalComs}
          cargando={cargando} accion={accion} />
      )}
      {seccion === 'renta' && (
        <FondoRenta fondo={fondo} porUnidad={fondoUnidad} rentas={rentas} pagos={pagosRenta}
          cargando={cargando} accion={accion} disponible={fondo != null} />
      )}
      {seccion === 'manos' && (
        <EnManosDe saldos={custodia} entregas={entregas} contactos={contactos}
          cargando={cargando} accion={accion} disponible={fase5} />
      )}
      {seccion === 'movimientos' && (
        <Movimientos movimientos={movimientos} etiquetaPeriodo={etiquetaDe(preset, rango)}
          cargando={cargando} accion={accion} gente={contactos} />
      )}
      {seccion === 'gastos' && (
        <Gastos gastos={gastosFijos} vehiculos={vehiculos} nombrePorId={nombrePorId}
          cargando={cargando} accion={accion} />
      )}
      {seccion === 'caja' && <Caja caja={caja} mesActual={mesActual} />}
    </div>
  );
}

/* ══════════════════════════ Cuentas por cobrar ══════════════════════════ */

function PorCobrar({
  cxc, total, cargando, error, accion, setError,
}: {
  cxc: CxC[]; total: number; cargando: boolean; error: string | null;
  accion: (fn: () => Promise<void>) => Promise<void>;
  setError: (v: string | null) => void;
}) {
  const [soloVencidas, setSoloVencidas] = useState(false);
  const [busca, setBusca] = useState('');
  const [cobrando, setCobrando] = useState<CxC | null>(null);
  const [monto, setMonto] = useState('');

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return cxc.filter((c) => {
      if (soloVencidas && !c.vencido) return false;
      if (!q) return true;
      return `${c.folio} ${c.cliente ?? ''} ${c.destino}`.toLowerCase().includes(q);
    });
  }, [cxc, soloVencidas, busca]);

  const totalFiltrado = lista.reduce((s, c) => s + Number(c.saldo), 0);
  const numVencidas = cxc.filter((c) => c.vencido).length;

  function abrir(c: CxC) {
    setError(null);
    setCobrando(c);
    setMonto(String(Number(c.saldo)));
  }

  async function registrar(metodo: string) {
    if (!cobrando) return;
    await accion(async () => {
      const m = Number(monto);
      if (!(m > 0)) throw new Error('El monto debe ser mayor a cero.');
      if (m > Number(cobrando.saldo) + 0.005) throw new Error('El monto es mayor que el saldo.');
      await api('/api/cobros', { method: 'POST', body: { envio_id: cobrando.envio_id, monto: m, metodo } });
      setCobrando(null);
    });
  }

  return (
    <section className="tarjeta p-0">
      <div className="flex flex-wrap items-center gap-3 border-b border-surface-line px-5 py-3">
        <h2 className="text-sm font-semibold">Cuentas por cobrar</h2>
        <div className="flex gap-2">
          <Chip activo={!soloVencidas} onClick={() => setSoloVencidas(false)}>Todas ({cxc.length})</Chip>
          <Chip activo={soloVencidas} onClick={() => setSoloVencidas(true)}>Vencidas ({numVencidas})</Chip>
        </div>
        <Input className="ml-auto max-w-[14rem]" placeholder="Buscar cliente, destino o folio…"
          value={busca} onChange={(e) => setBusca(e.target.value)} />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-wide text-ink-mute">
              <th className="px-5 py-2 text-left">Folio</th>
              <th className="px-3 py-2 text-left">Cliente</th>
              <th className="px-3 py-2 text-left">Destino</th>
              <th className="px-3 py-2 text-right">Precio</th>
              <th className="px-3 py-2 text-right">Cobrado</th>
              <th className="px-3 py-2 text-right">Saldo</th>
              <th className="px-3 py-2 text-right">Días</th>
              <th className="px-5 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {lista.length === 0 && (
              <tr><td colSpan={8} className="px-5 py-8 text-center text-ink-mute">
                {cxc.length === 0
                  ? 'Nada por cobrar. Los envíos marcados a crédito aparecen aquí hasta que se liquidan.'
                  : 'Ningún envío coincide con el filtro.'}
              </td></tr>
            )}
            {lista.map((c) => (
              <tr key={c.envio_id} className="fila">
                <td className="px-5 py-2">
                  {c.ruta_id
                    ? <Link href={`/rutas/${c.ruta_id}`} className="cifra text-brand hover:underline">#{c.folio}</Link>
                    : <span className="cifra">#{c.folio}</span>}
                </td>
                <td className="px-3 py-2">{c.cliente ?? '—'}</td>
                <td className="px-3 py-2 text-ink-soft">{c.destino}</td>
                <td className="px-3 py-2 text-right cifra">{mxn(Number(c.precio))}</td>
                <td className="px-3 py-2 text-right cifra text-ink-mute">
                  {Number(c.cobrado) > 0 ? mxn(Number(c.cobrado)) : '—'}
                </td>
                <td className="px-3 py-2 text-right cifra font-medium">{mxn(Number(c.saldo))}</td>
                <td className="px-3 py-2 text-right">
                  {c.vencido ? <Etiqueta tono="malo">{c.dias_transcurridos}d</Etiqueta>
                    : <span className="cifra text-ink-mute">{c.dias_transcurridos}d</span>}
                </td>
                <td className="px-5 py-2 text-right">
                  <BotonMini onClick={() => abrir(c)}>Cobrar</BotonMini>
                </td>
              </tr>
            ))}
          </tbody>
          {lista.length > 0 && (
            <tfoot>
              <tr className="border-t border-surface-line bg-surface-raised">
                <td className="px-5 py-2 text-xs uppercase tracking-wide text-ink-mute" colSpan={5}>
                  {plural(lista.length, 'envío', 'envíos')}
                </td>
                <td className="px-3 py-2 text-right cifra font-semibold">{mxn(totalFiltrado)}</td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {totalFiltrado !== total && (
        <p className="px-5 py-2 text-xs text-ink-mute">Total sin filtrar: {mxn(total)}</p>
      )}

      {/* Cobrar: monto listo y el método es el botón que confirma */}
      <Panel abierto={!!cobrando} onCerrar={() => setCobrando(null)} titulo="Registrar cobro">
        {cobrando && (
          <div className="space-y-5">
            <div className="rounded-xl border border-surface-line bg-surface-raised p-3 text-sm">
              <p className="font-medium">#{cobrando.folio} · {cobrando.destino}</p>
              <p className="text-ink-mute">{cobrando.cliente ?? 'Sin cliente'} · {cobrando.dias_transcurridos} días</p>
              <p className="mt-2 flex justify-between"><span className="text-ink-mute">Precio</span>
                <span className="cifra">{mxn(Number(cobrando.precio))}</span></p>
              {Number(cobrando.cobrado) > 0 && (
                <p className="flex justify-between"><span className="text-ink-mute">Ya cobrado</span>
                  <span className="cifra">{mxn(Number(cobrando.cobrado))}</span></p>
              )}
              <p className="flex justify-between font-medium"><span>Saldo</span>
                <span className="cifra">{mxn(Number(cobrando.saldo))}</span></p>
            </div>

            <div>
              <span className="etiqueta">Monto</span>
              <div className="mt-1 flex gap-2">
                <Input type="number" inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value)} />
                <Chip activo={Number(monto) === Number(cobrando.saldo)}
                  onClick={() => setMonto(String(Number(cobrando.saldo)))}>Todo</Chip>
                <Chip onClick={() => setMonto((Number(cobrando.saldo) / 2).toFixed(2))}>Mitad</Chip>
              </div>
            </div>

            <div>
              <span className="etiqueta">¿Cómo pagó?</span>
              <p className="mt-1 text-xs text-ink-mute">Al elegir el método se registra el cobro de {mxn(Number(monto) || 0)}.</p>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {METODOS.map((m) => (
                  <Boton key={m} variante="suave" disabled={cargando} onClick={() => registrar(m)}
                    className="capitalize">{m}</Boton>
                ))}
              </div>
            </div>

            <Aviso error={error} />
            <Boton variante="fantasma" onClick={() => setCobrando(null)}>Cancelar</Boton>
          </div>
        )}
      </Panel>
    </section>
  );
}

/* ══════════════════════════ Comisiones por pagar ══════════════════════════ */

function Comisiones({
  personas, detalle, total, cargando, accion,
}: {
  personas: ComPorPagar[]; detalle: ComDetalle[]; total: number; cargando: boolean;
  accion: (fn: () => Promise<void>) => Promise<void>;
}) {
  const [abierta, setAbierta] = useState<string | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  // Se guarda lo que se acaba de pagar para poder emitir el comprobante: una
  // vez marcadas como pagadas, esas comisiones desaparecen de la lista.
  const [recibo, setRecibo] = useState<
    { para: string; monto: number; lineas: LineaComprobante[] } | null
  >(null);

  const porPersona = useMemo(() => {
    const m: Record<string, ComDetalle[]> = {};
    for (const c of detalle) (m[c.contacto_id] ??= []).push(c);
    return m;
  }, [detalle]);

  function alternar(id: string) {
    setSel((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  const seleccionadas = detalle.filter((c) => sel.has(c.id));
  const totalSel = seleccionadas.reduce((s, c) => s + Number(c.monto), 0);

  /** Con ids paga solo esas; sin ellos liquida todo lo devengado de la persona. */
  async function pagar(ids: string[], persona: ComPorPagar) {
    // El detalle se retiene ANTES de pagar: después ya no está en la lista.
    const filas = (porPersona[persona.contacto_id] ?? [])
      .filter((f) => (ids.length ? ids.includes(f.id) : true));
    const monto = ids.length
      ? filas.reduce((s, f) => s + Number(f.monto), 0)
      : Number(persona.total_devengado);

    await accion(async () => {
      await api('/api/comisiones', {
        method: 'PATCH',
        body: ids.length ? { ids, marcar: 'pagada' } : { contacto_id: persona.contacto_id, marcar: 'pagada' },
      });
      setSel(new Set());
      setRecibo({
        para: persona.nombre,
        monto,
        lineas: filas.map((f) => ({
          etiqueta: `Ruta #${f.folio ?? '—'}`,
          detalle: `${f.rol}${f.fecha ? ` · ${fechaCorta(f.fecha, false)}` : ''}`,
          monto: Number(f.monto),
        })),
      });
    });
  }

  return (
    <section className="tarjeta p-0">
      <div className="flex items-center justify-between border-b border-surface-line px-5 py-3">
        <h2 className="text-sm font-semibold">Comisiones devengadas</h2>
        <span className="text-xs text-ink-mute">Se generan al cerrar cada ruta</span>
      </div>

      {personas.length === 0 && (
        <p className="px-5 py-8 text-center text-sm text-ink-mute">
          No hay comisiones pendientes de pago.
        </p>
      )}

      <div className="divide-y divide-surface-line">
        {personas.map((p) => {
          const filas = porPersona[p.contacto_id] ?? [];
          const abiertaEsta = abierta === p.contacto_id;
          const selDeEsta = filas.filter((f) => sel.has(f.id));
          return (
            <div key={p.contacto_id}>
              <div className="flex flex-wrap items-center gap-3 px-5 py-3">
                <button onClick={() => setAbierta(abiertaEsta ? null : p.contacto_id)}
                  className="flex items-center gap-2 text-left">
                  <span className="text-ink-mute">{abiertaEsta ? '▾' : '▸'}</span>
                  <span className="font-medium">{p.nombre}</span>
                </button>
                <span className="text-xs text-ink-mute">
                  {plural(Number(p.num_comisiones), 'comisión', 'comisiones')} · desde {p.desde}
                </span>
                <span className="ml-auto cifra font-medium">{mxn(Number(p.total_devengado))}</span>
                <BotonMini disabled={cargando}
                  onClick={() => confirm(`¿Marcar como pagadas todas las comisiones de ${p.nombre} (${mxn(Number(p.total_devengado))})?`)
                    && pagar([], p)}>
                  Pagar todo
                </BotonMini>
              </div>

              {abiertaEsta && (
                <div className="bg-surface-raised/60 px-5 pb-4">
                  <table className="w-full text-sm">
                    <tbody>
                      {filas.map((f) => (
                        <tr key={f.id} className="border-t border-surface-line/60">
                          <td className="py-2 pr-3 w-8">
                            <input type="checkbox" checked={sel.has(f.id)} onChange={() => alternar(f.id)} />
                          </td>
                          <td className="py-2 pr-3">
                            <Link href={`/rutas/${f.ruta_id}`} className="text-brand hover:underline">
                              Ruta #{f.folio ?? '—'}
                            </Link>
                          </td>
                          <td className="py-2 pr-3 text-ink-soft">{f.fecha ?? '—'}</td>
                          <td className="py-2 pr-3"><Etiqueta tono="info">{f.rol}</Etiqueta></td>
                          <td className="py-2 text-right cifra">{mxn(Number(f.monto))}</td>
                        </tr>
                      ))}
                      {filas.length === 0 && (
                        <tr><td className="py-3 text-ink-mute">Sin detalle disponible.</td></tr>
                      )}
                    </tbody>
                  </table>
                  {selDeEsta.length > 0 && (
                    <div className="mt-3">
                      <Boton disabled={cargando} onClick={() => pagar(selDeEsta.map((f) => f.id), p)}>
                        Pagar {plural(selDeEsta.length, 'seleccionada', 'seleccionadas')} · {mxn(selDeEsta.reduce((s, f) => s + Number(f.monto), 0))}
                      </Boton>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {personas.length > 0 && (
        <div className="flex items-center justify-between border-t border-surface-line bg-surface-raised/60 px-5 py-3">
          <span className="text-xs uppercase tracking-wide text-ink-mute">
            {sel.size > 0 ? plural(sel.size, 'seleccionada', 'seleccionadas') : 'Total por pagar'}
          </span>
          <span className="cifra font-semibold">{sel.size > 0 ? mxn(totalSel) : mxn(total)}</span>
        </div>
      )}

      {recibo && (
        <Comprobante abierto onCerrar={() => setRecibo(null)}
          titulo="Comprobante de pago" concepto="Comisiones de flete"
          para={recibo.para} monto={recibo.monto}
          fecha={new Date().toISOString().slice(0, 10)}
          lineas={recibo.lineas}
          nota="Comisiones devengadas por los viajes listados, liquidadas en esta fecha." />
      )}
    </section>
  );
}

/* ══════════════════════════ Gastos, inversión y retiros ══════════════════════════ */

function Gastos({
  gastos, vehiculos, nombrePorId, cargando, accion,
}: {
  gastos: Gasto[]; vehiculos: Vehiculo[]; nombrePorId: Record<string, string>;
  cargando: boolean; accion: (fn: () => Promise<void>) => Promise<void>;
}) {
  const hoy = new Date().toISOString().slice(0, 10);
  const [f, setF] = useState({
    fecha: hoy, categoria: 'mantenimiento' as CategoriaGasto, tipo: 'operativo' as TipoGasto,
    monto: '', vehiculo_id: '', descripcion: '',
  });
  const [filtroTipo, setFiltroTipo] = useState<'todos' | TipoGasto>('todos');
  const [mes, setMes] = useState('todos');

  const meses = useMemo(() => {
    const s = new Set(gastos.map((g) => g.fecha.slice(0, 7)));
    return [...s].sort().reverse();
  }, [gastos]);

  const lista = gastos.filter((g) =>
    (filtroTipo === 'todos' || g.tipo === filtroTipo) && (mes === 'todos' || g.fecha.startsWith(mes)));
  const totalLista = lista.reduce((s, g) => s + Number(g.monto), 0);

  async function agregar() {
    await accion(async () => {
      if (!f.monto) throw new Error('Escribe el monto.');
      await api('/api/gastos', { method: 'POST', body: {
        fecha: f.fecha, categoria: f.categoria, tipo: f.tipo, monto: f.monto,
        vehiculo_id: f.vehiculo_id || null, descripcion: f.descripcion || null,
      } });
      setF({ ...f, monto: '', descripcion: '' });
    });
  }

  const tipoActual = TIPOS.find((t) => t.v === f.tipo)!;

  return (
    <div className="space-y-6">
      {/* Alta rápida, siempre a la vista */}
      <section className="tarjeta space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="mr-2 text-sm font-semibold">Registrar salida de dinero</h2>
          {TIPOS.map((t) => (
            <Chip key={t.v} activo={f.tipo === t.v}
              onClick={() => setF({ ...f, tipo: t.v, categoria: t.v === 'operativo' ? 'mantenimiento' : 'otro' })}>
              {t.label}
            </Chip>
          ))}
          <span className="w-full text-xs text-ink-mute sm:w-auto">{tipoActual.hint}</span>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <label className="block">
            <span className="etiqueta">Fecha</span>
            <Input className="mt-1" type="date" value={f.fecha} onChange={(e) => setF({ ...f, fecha: e.target.value })} />
          </label>
          <label className="block">
            <span className="etiqueta">Monto</span>
            <Input className="mt-1" type="number" inputMode="decimal" placeholder="0.00" value={f.monto}
              onChange={(e) => setF({ ...f, monto: e.target.value })}
              onKeyDown={(e) => { if (e.key === 'Enter' && !cargando) agregar(); }} />
          </label>
          <label className="block">
            <span className="etiqueta">Categoría</span>
            <Select className="mt-1" value={f.categoria}
              onChange={(e) => setF({ ...f, categoria: e.target.value as CategoriaGasto })}>
              {CAT_FIJAS.map((c) => <option key={c.v} value={c.v}>{c.label}</option>)}
            </Select>
          </label>
          <label className="block">
            <span className="etiqueta">Unidad</span>
            <Select className="mt-1" value={f.vehiculo_id} onChange={(e) => setF({ ...f, vehiculo_id: e.target.value })}>
              <option value="">— Ninguna —</option>
              {vehiculos.map((v) => <option key={v.id} value={v.id}>{v.nombre}</option>)}
            </Select>
          </label>
          <label className="block">
            <span className="etiqueta">Descripción</span>
            <Input className="mt-1" placeholder="Opcional" value={f.descripcion}
              onChange={(e) => setF({ ...f, descripcion: e.target.value })}
              onKeyDown={(e) => { if (e.key === 'Enter' && !cargando) agregar(); }} />
          </label>
        </div>

        <Boton disabled={cargando} onClick={agregar}>{cargando ? 'Guardando…' : 'Registrar'}</Boton>
      </section>

      <section className="tarjeta p-0">
        <div className="flex flex-wrap items-center gap-3 border-b border-surface-line px-5 py-3">
          <h2 className="text-sm font-semibold">Movimientos</h2>
          <div className="flex gap-2">
            <Chip activo={filtroTipo === 'todos'} onClick={() => setFiltroTipo('todos')}>Todos</Chip>
            {TIPOS.map((t) => (
              <Chip key={t.v} activo={filtroTipo === t.v} onClick={() => setFiltroTipo(t.v)}>{t.label}</Chip>
            ))}
          </div>
          <Select className="ml-auto max-w-[11rem]" value={mes} onChange={(e) => setMes(e.target.value)}>
            <option value="todos">Todos los meses</option>
            {meses.map((m) => <option key={m} value={m}>{nombreMes(`${m}-01`)}</option>)}
          </Select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-ink-mute">
                <th className="px-5 py-2 text-left">Fecha</th>
                <th className="px-3 py-2 text-left">Tipo</th>
                <th className="px-3 py-2 text-left">Categoría</th>
                <th className="px-3 py-2 text-left">Descripción</th>
                <th className="px-3 py-2 text-left">Unidad</th>
                <th className="px-3 py-2 text-right">Monto</th>
                <th className="px-5 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {lista.length === 0 && (
                <tr><td colSpan={7} className="px-5 py-8 text-center text-ink-mute">
                  {gastos.length === 0 ? 'Aún no registras gastos fuera de ruta.' : 'Nada con ese filtro.'}
                </td></tr>
              )}
              {lista.map((g) => (
                <tr key={g.id} className="fila">
                  <td className="px-5 py-2 text-ink-soft">{g.fecha}</td>
                  <td className="px-3 py-2">
                    <Etiqueta tono={g.tipo === 'inversion' ? 'info' : g.tipo === 'retiro' ? 'aviso' : 'neutro'}>
                      {TIPOS.find((t) => t.v === g.tipo)?.label ?? g.tipo}
                    </Etiqueta>
                  </td>
                  <td className="px-3 py-2">{CAT_LABEL[g.categoria] ?? g.categoria}</td>
                  <td className="px-3 py-2 text-ink-soft">{g.descripcion ?? '—'}</td>
                  <td className="px-3 py-2 text-ink-soft">{g.vehiculo_id ? nombrePorId[g.vehiculo_id] ?? '—' : '—'}</td>
                  <td className="px-3 py-2 text-right cifra font-medium">{mxn(Number(g.monto))}</td>
                  <td className="px-5 py-2 text-right">
                    <button onClick={() => confirm('¿Eliminar este gasto?') &&
                      accion(async () => { await api('/api/gastos', { method: 'DELETE', body: { id: g.id } }); })}
                      className="text-ink-mute hover:text-bad" aria-label="Eliminar">✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
            {lista.length > 0 && (
              <tfoot>
                <tr className="border-t border-surface-line bg-surface-raised">
                  <td className="px-5 py-2 text-xs uppercase tracking-wide text-ink-mute" colSpan={5}>
                    {plural(lista.length, 'movimiento', 'movimientos')}
                  </td>
                  <td className="px-3 py-2 text-right cifra font-semibold">{mxn(totalLista)}</td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </section>
    </div>
  );
}

/* ══════════════════════════ Caja ══════════════════════════ */

function Caja({ caja, mesActual }: { caja: CajaMes[]; mesActual: string }) {
  const suma = (f: (m: CajaMes) => number) => caja.reduce((s, m) => s + Number(f(m)), 0);

  return (
    <section className="tarjeta p-0">
      <div className="flex items-center justify-between border-b border-surface-line px-5 py-3">
        <h2 className="text-sm font-semibold">Caja por mes</h2>
        <span className="text-xs text-ink-mute">Flujo real: contado entregado + cobros de crédito − salidas</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-wide text-ink-mute">
              <th className="px-5 py-2 text-left">Mes</th>
              <th className="px-3 py-2 text-right">Entradas</th>
              <th className="px-3 py-2 text-right">Operativos</th>
              <th className="px-3 py-2 text-right">Comisiones</th>
              <th className="px-3 py-2 text-right">Inversión</th>
              <th className="px-3 py-2 text-right">Retiros</th>
              <th className="px-5 py-2 text-right">Flujo neto</th>
            </tr>
          </thead>
          <tbody>
            {caja.length === 0 && (
              <tr><td colSpan={7} className="px-5 py-8 text-center text-ink-mute">Sin movimientos todavía.</td></tr>
            )}
            {caja.map((m) => {
              const esActual = m.mes.slice(0, 7) === mesActual;
              return (
                <tr key={m.mes} className={`border-t border-surface-line ${esActual ? 'bg-acento/[0.06]' : ''}`}>
                  <td className="px-5 py-2 font-medium">
                    {nombreMes(m.mes)}
                    {esActual && <span className="ml-2 text-xs font-normal text-brand">en curso</span>}
                  </td>
                  <td className="px-3 py-2 text-right cifra">{mxn(Number(m.entradas))}</td>
                  <td className="px-3 py-2 text-right cifra text-ink-soft">{mxn(Number(m.salidas_operativas))}</td>
                  <td className="px-3 py-2 text-right cifra text-ink-soft">{mxn(Number(m.salidas_comisiones))}</td>
                  <td className="px-3 py-2 text-right cifra text-ink-soft">{mxn(Number(m.salidas_inversion))}</td>
                  <td className="px-3 py-2 text-right cifra text-ink-soft">{mxn(Number(m.salidas_retiro))}</td>
                  <td className={`px-5 py-2 text-right cifra font-medium ${Number(m.flujo_neto) < 0 ? 'text-bad' : 'text-good'}`}>
                    {mxn(Number(m.flujo_neto))}
                  </td>
                </tr>
              );
            })}
          </tbody>
          {caja.length > 0 && (
            <tfoot>
              <tr className="border-t border-surface-line bg-surface-sunk/40 font-semibold">
                <td className="px-5 py-2 text-xs uppercase tracking-wide text-ink-mute">Acumulado</td>
                <td className="px-3 py-2 text-right cifra">{mxn(suma((m) => m.entradas))}</td>
                <td className="px-3 py-2 text-right cifra">{mxn(suma((m) => m.salidas_operativas))}</td>
                <td className="px-3 py-2 text-right cifra">{mxn(suma((m) => m.salidas_comisiones))}</td>
                <td className="px-3 py-2 text-right cifra">{mxn(suma((m) => m.salidas_inversion))}</td>
                <td className="px-3 py-2 text-right cifra">{mxn(suma((m) => m.salidas_retiro))}</td>
                <td className={`px-5 py-2 text-right cifra ${suma((m) => m.flujo_neto) < 0 ? 'text-bad' : 'text-good'}`}>
                  {mxn(suma((m) => m.flujo_neto))}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </section>
  );
}

/* ══════════════════════════ Piezas menores ══════════════════════════ */

/** Nombre corto del periodo elegido, para la cabecera del bloque de flujo. */
function etiquetaDe(preset: Preset, rango: Rango): string {
  if (preset === 'rango') {
    if (!rango.desde && !rango.hasta) return 'todo';
    return `${rango.desde ? fechaCorta(rango.desde) : 'el inicio'} – ${rango.hasta ? fechaCorta(rango.hasta) : 'hoy'}`;
  }
  return { mes: 'este mes', '3m': 'últimos 3 meses', ano: 'este año', todo: 'todo el histórico' }[preset];
}

function nombreMes(iso: string): string {
  const [a, m] = iso.split('-');
  const n = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  return `${n[Number(m) - 1]} ${a}`;
}
