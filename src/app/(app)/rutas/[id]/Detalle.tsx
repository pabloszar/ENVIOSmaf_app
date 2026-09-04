'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { api } from '@/lib/cliente';
import {
  Campo, Input, Select, Boton, BotonMini, Aviso, Chip, Etiqueta, Modal, AccionesModal,
  CampoMonto, useAccion,
} from '@/components/ui';
import { useDesplegable, Cuerpo, Plegable, HojaMovil, BordesOscuros } from '@/components/vidrio';
import SelectorTamano from '@/components/SelectorTamano';
import QuienTuvo, { SIN_CUSTODIA, type Custodia, custodiaABody } from '@/components/QuienTuvo';
import ComoSePago, { SelectorMetodo } from '@/components/ComoSePago';
import Evidencias, { ContadorEvidencias } from '@/components/Evidencias';
import ModalUbicar from '@/components/ModalUbicar';
import LienzoRuta from './LienzoRuta';
import type { Lugar } from '@/lib/geo';
import {
  METODO_INFO, type Metodo, type Desglose,
  desgloseSimple, desgloseVacio, desgloseDesdeCobros, desgloseABody,
  metodosUsados, montoDe, sumaDesglose, restante, esMetodo,
} from '@/lib/cobro';
import { mxn } from '@/lib/pricing';
import { fechaCorta } from '@/lib/fechas';
import type {
  Ruta, Envio, Gasto, Tripulante, Comision, Vehiculo, Contacto, RutaPnl, Cobro,
  SubcategoriaGasto, TamanoCarga, CategoriaGasto, EstadoRuta,
} from '@/types';

// Leaflet toca `window` al importarse: en el servidor no existe.
const Mapa = dynamic(() => import('@/components/Mapa'), {
  ssr: false,
  loading: () => <div className="h-full w-full bg-surface-sunk" />,
});

const CATS: { v: CategoriaGasto; label: string }[] = [
  { v: 'gasolina', label: 'Gasolina' }, { v: 'caseta', label: 'Caseta' },
  { v: 'comida', label: 'Comida' }, { v: 'mantenimiento', label: 'Mantenimiento' },
  { v: 'otro', label: 'Otro' },
];
const ESTADOS: { v: EstadoRuta; label: string }[] = [
  { v: 'cotizada', label: 'Cotizada' }, { v: 'agendada', label: 'Agendada' },
  { v: 'en_curso', label: 'En curso' }, { v: 'entregada', label: 'Entregada' },
  { v: 'cancelada', label: 'Cancelada' },
];

/** Renglón del borrador de gastos: se capturan varios y se guardan de un jalón. */
interface LineaGasto {
  k: number; categoria: CategoriaGasto; subcategoria_id: string; monto: string; descripcion: string;
}
let contadorLinea = 0;
const nuevaLinea = (categoria: CategoriaGasto = 'gasolina'): LineaGasto =>
  ({ k: ++contadorLinea, categoria, subcategoria_id: '', monto: '', descripcion: '' });

interface Datos {
  ruta: Ruta; envios: Envio[]; gastos: Gasto[];
  tripulacion: Tripulante[]; comisiones: Comision[];
}

/**
 * El detalle de una ruta.
 *
 * El viaje ocupa la pantalla entera y todo lo demás flota encima, igual que en
 * el cotizador. No es simetría por gusto: son las dos caras de lo mismo —ahí
 * se decide el viaje, aquí se revisa cómo salió— y verlas distintas obligaba a
 * reaprender la pantalla a media jornada.
 *
 * Todo cabe sin desplazar la página. Cada panel se encoge a una línea que ya
 * dice algo —"Gastos · 4 · −$1,230"— y crece al acercarse el cursor. La regla
 * es esa: si para saber cuánto se gastó hay que abrirlo, encogerlo no ahorró
 * nada, nada más escondió.
 *
 * Cuando ninguna misión tiene ubicación —los 60 registros del Excel y todo lo
 * capturado antes del mapa— el fondo no es un mapa vacío sino el viaje contado
 * como cadena. Ver Lienzo­Ruta.
 */
export default function Detalle({
  datos, pnl, porCobrar, cobros, subcategorias, evidenciasEnvio, evidenciasGasto, fase6,
  comisionesEstimadas, vehiculos, choferes, ayudantes, vendedores, clientes, nombrePorId,
}: {
  datos: Datos;
  pnl: RutaPnl | null;
  porCobrar: number | null;
  cobros: Cobro[];
  subcategorias: SubcategoriaGasto[];
  evidenciasEnvio: Record<string, number>;
  evidenciasGasto: Record<string, number>;
  fase6: boolean;
  comisionesEstimadas: number;
  vehiculos: Vehiculo[];
  choferes: Contacto[];
  ayudantes: Contacto[];
  vendedores: Contacto[];
  clientes: Contacto[];
  nombrePorId: Record<string, string>;
}) {
  const router = useRouter();
  const { ruta, envios, gastos, tripulacion, comisiones } = datos;
  const { cargando, error, correr, setError } = useAccion();
  const cerrada = ruta.estado === 'entregada';

  const [nota, setNota] = useState<string | null>(null);
  const [modal, setModal] = useState<null | 'mision' | 'gasto' | 'tripulacion'>(null);
  const [editando, setEditando] = useState<Envio | null>(null);
  const [cobrando, setCobrando] = useState<Envio | null>(null);
  const [abierta, setAbierta] = useState<string | null>(null);
  const [ubicando, setUbicando] = useState<Envio | null>(null);

  async function accion(fn: () => Promise<void>) {
    await correr(async () => { await fn(); router.refresh(); });
  }

  // ── Cifras ──
  // Todas salen de v_ruta_pnl_full, la misma vista que alimenta la lista de
  // rutas. Calcularlas aquí otra vez fue justo lo que las desalineó: faltaba
  // la renta de la unidad, que la vista sí descuenta.
  const ingreso = Number(pnl?.ingreso ?? 0);
  const gastosViaje = Number(pnl?.gastos_directos ?? 0);
  const comisionesReales = Number(pnl?.comisiones ?? 0);
  const renta = Number(pnl?.renta_unidad ?? 0);
  const utilidad = Number(pnl?.utilidad ?? 0);
  const margen = pnl?.margen_pct != null ? Number(pnl.margen_pct) : null;
  const vehiculo = vehiculos.find((v) => v.id === ruta.vehiculo_id)?.nombre ?? null;
  // Quienes pudieron traer el dinero de este viaje: los que iban arriba y los
  // que vendieron. Aparecen como atajo para no buscarlos en una lista larga.
  const gente = [
    ...tripulacion.map((t) => ({ id: t.contacto_id, nombre: nombrePorId[t.contacto_id] ?? '—' })),
    ...vendedores
      .filter((v) => envios.some((e) => e.vendedor_id === v.id))
      .map((v) => ({ id: v.id, nombre: v.nombre })),
  ].filter((g, i, xs) => xs.findIndex((x) => x.id === g.id) === i);
  const chofer = tripulacion.find((t) => t.rol === 'chofer');

  const cobrosDe = (envioId: string) => cobros.filter((c) => c.envio_id === envioId);
  const ubicadas = envios.filter((e) => e.lat != null && e.lng != null);

  /** Cambia el estado. 'entregada' no es una etiqueta: cierra la ruta de verdad. */
  async function cambiarEstado(nuevo: EstadoRuta) {
    if (nuevo === ruta.estado) return;
    if (nuevo === 'entregada' &&
      !confirm('Cerrar la ruta congela los porcentajes de hoy y genera las comisiones. ¿Seguir?')) return;
    if (cerrada && nuevo !== 'entregada' &&
      !confirm('Sacarla de "entregada" borra las comisiones devengadas de este viaje. ¿Seguir?')) return;

    await accion(async () => {
      const r = await api<{ cerro: boolean; comisiones_generadas: number }>(
        `/api/rutas/${ruta.id}`, { method: 'PATCH', body: { estado: nuevo } });
      setNota(r.cerro
        ? `Ruta cerrada · ${r.comisiones_generadas} ${r.comisiones_generadas === 1 ? 'comisión generada' : 'comisiones generadas'}`
        : cerrada ? 'Ruta reabierta · comisiones devengadas borradas' : null);
    });
  }

  /**
   * Sube o baja una misión.
   *
   * Se manda la lista completa ya reordenada y no un "muévela una posición":
   * dos clics seguidos sobre una lista que todavía no se refresca mandarían
   * dos veces la misma orden y dejarían dos misiones con el mismo número.
   */
  async function mover(id: string, delta: number) {
    const orden = envios.map((e) => e.id);
    const i = orden.indexOf(id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= orden.length) return;
    [orden[i], orden[j]] = [orden[j], orden[i]];
    await accion(async () => {
      await api('/api/envios/orden', { method: 'POST', body: { ruta_id: ruta.id, ids: orden } });
    });
  }

  /**
   * Vuelve a trazar el recorrido con las misiones ubicadas.
   *
   * Reordena las misiones al orden que conviene manejar y reparte los
   * kilómetros tramo por tramo. Si el kilometraje se escribió a mano, ese
   * número se respeta y el calculado queda solo como referencia: nadie
   * corrige un dato para que la app se lo borre.
   */
  async function recalcular() {
    await accion(async () => {
      const r = await api<{
        km: number; minutos: number; roundtrip: boolean;
        paradas_sin_ubicar: number; km_conservado: boolean;
      }>(`/api/rutas/${ruta.id}/trayecto`, { method: 'POST' });
      setNota([
        `Recorrido trazado · ${r.km.toLocaleString('es-MX')} km${r.roundtrip ? ' ida y vuelta' : ' solo ida'}`,
        r.km_conservado ? 'se conservó tu kilometraje escrito a mano' : null,
        r.paradas_sin_ubicar > 0
          ? `${r.paradas_sin_ubicar} ${r.paradas_sin_ubicar === 1 ? 'misión quedó fuera por no tener' : 'misiones quedaron fuera por no tener'} ubicación`
          : null,
      ].filter(Boolean).join(' · '));
    });
  }

  /**
   * Vuelve a trazar, pero solo si vale la pena y sin hacer ruido.
   *
   * Se usa después de agregar o quitar una misión: los kilómetros de una ruta
   * ubicada salen del recorrido, así que dejarlos como estaban los volvería
   * mentira en silencio. Si falla, no se dice nada — el dato de la misión ya
   * se guardó y el recorrido se puede rehacer con el botón.
   */
  async function retrazar() {
    if (ubicadas.length === 0) return;
    try {
      await api(`/api/rutas/${ruta.id}/trayecto`, { method: 'POST' });
    } catch { /* el botón Recalcular sigue ahí */ }
  }

  /** Guarda la ubicación de una misión y vuelve a trazar el viaje. */
  async function guardarUbicacion(envio: Envio, l: Lugar) {
    await accion(async () => {
      await api('/api/envios', {
        method: 'PATCH',
        body: { id: envio.id, lat: l.lat, lng: l.lng, zona: l.zona || null },
      });
      setUbicando(null);
      // El recorrido cambia en cuanto una misión se ubica; recalcularlo aquí
      // evita que el mapa quede mostrando un viaje que ya no es el de la ruta.
      try {
        await api(`/api/rutas/${ruta.id}/trayecto`, { method: 'POST' });
      } catch { /* la ubicación ya quedó; el recorrido se puede rehacer a mano */ }
      setNota('Ubicación guardada');
    });
  }

  // ── El fondo ──
  // Solo dónde va cada pin. Lo que dice el pin al abrirse va aparte, en
  // `globoMision`: si el contenido entrara aquí, esta lista cambiaría cada vez
  // que se registra un cobro y el mapa volvería a dibujar todos los
  // marcadores —cerrando, de paso, el globo que se estaba leyendo—.
  const puntos = useMemo(
    () => envios
      .filter((e) => e.lat != null && e.lng != null)
      .map((e, i) => ({
        lat: Number(e.lat), lng: Number(e.lng), etiqueta: i + 1, titulo: e.destino,
      })),
    [envios]);

  /**
   * El globo de un pin.
   *
   * Va por índice contra `ubicadas`, que es de donde salieron los puntos y
   * conserva su orden. Se pinta en cada render, así que trae los cobros y las
   * evidencias del momento y no los del día en que se dibujó el mapa.
   */
  const globoMision = (_p: unknown, i: number, cerrar: () => void) => {
    const e = ubicadas[i];
    if (!e) return null;
    return (
      <GloboMision envio={e} cobros={cobrosDe(e.id)} evidencias={evidenciasEnvio[e.id] ?? 0}
        nombrePorId={nombrePorId} cerrada={cerrada} fase6={fase6}
        onCerrar={cerrar}
        onEditar={() => { cerrar(); setError(null); setEditando(e); }}
        onCobro={() => { cerrar(); setError(null); setCobrando(e); }}
        onUbicar={() => { cerrar(); setError(null); setUbicando(e); }} />
    );
  };

  // Lo que le tapan al mapa. En escritorio vive en su tarjeta y solo le cae
  // encima la pastilla del viaje; en celular lo cubren la cabecera y la hoja.
  const celular = useEsCelular();
  const margenMapa = useMemo(
    () => (celular
      ? { arriba: 110, izquierda: 20, abajo: 130, derecha: 20 }
      : { arriba: 72, izquierda: 24, abajo: 24, derecha: 24 }),
    [celular]);

  // ── Los paneles ──
  // Se arman una sola vez y se colocan en los dos acomodos, para que el de
  // escritorio y el de celular no puedan diverger.
  const cabecera = (
    <PanelCabecera ruta={ruta} envios={envios} vehiculo={vehiculo}
      chofer={chofer ? nombrePorId[chofer.contacto_id] ?? null : null}
      cerrada={cerrada} cargando={cargando}
      onEstado={cambiarEstado}
      onEliminar={() => {
        if (!confirm('¿Eliminar la ruta y todo lo asociado?')) return;
        accion(async () => {
          await api(`/api/rutas/${ruta.id}`, { method: 'DELETE' });
          router.push('/rutas');
        });
      }} />
  );

  const listaMisiones = (
    <PanelMisiones envios={envios} venta={ingreso} cerrada={cerrada}
      accion={!cerrada && (
        <BotonMini onClick={() => { setError(null); setModal('mision'); }}>+ Misión</BotonMini>
      )}>
      {envios.map((e, i) => (
        <FilaMision key={e.id} envio={e} cobros={cobrosDe(e.id)}
          evidencias={evidenciasEnvio[e.id] ?? 0}
          abierta={abierta === e.id}
          onAbrir={() => setAbierta(abierta === e.id ? null : e.id)}
          nombrePorId={nombrePorId} cerrada={cerrada} fase6={fase6}
          primera={i === 0} ultima={i === envios.length - 1}
          onMover={(d) => mover(e.id, d)}
          onEditar={() => { setError(null); setEditando(e); }}
          onCobro={() => { setError(null); setCobrando(e); }}
          onUbicar={() => { setError(null); setUbicando(e); }}
          onEliminar={() => {
            if (!confirm(`¿Eliminar la misión de ${e.destino}?`)) return;
            accion(async () => {
              await api('/api/envios', { method: 'DELETE', body: { id: e.id } });
              await retrazar();
            });
          }}
          onRefrescar={() => router.refresh()} />
      ))}
    </PanelMisiones>
  );

  const panelGastos = (
    /* Sin línea de resumen: en una tarjeta de un tercio de columna, entre el
       botón de alta y el total no le queda ancho, y "gasolina · otro · cas…"
       no dice más que el número que ya está al lado. */
    <Plegable titulo="Gastos" icono={<IconoGasto />} material="lamina-honda"
      cuenta={gastos.length} total={resta(gastosViaje)}
      resumen={gastos.length === 0 ? 'sin capturar' : undefined}
      siCabe
      accion={!cerrada && (
        <BotonMini onClick={() => { setError(null); setModal('gasto'); }}>+ Gasto</BotonMini>
      )}>
      {gastos.length === 0 ? (
        <Vacio texto="Sin gastos capturados. La gasolina y las casetas van aquí." />
      ) : (
        <ul className="max-h-[24vh] divide-y divide-white/[0.05] overflow-y-auto">
          {gastos.map((g) => (
            <FilaGasto key={g.id} gasto={g} subcategorias={subcategorias}
              evidencias={evidenciasGasto[g.id] ?? 0}
              abierta={abierta === g.id}
              onAbrir={() => setAbierta(abierta === g.id ? null : g.id)}
              gente={gente} cerrada={cerrada} fase6={fase6}
              onGuardar={(campos) => accion(async () => {
                await api('/api/gastos', { method: 'PATCH', body: { id: g.id, ...campos } });
              })}
              onEliminar={() => {
                if (!confirm('¿Eliminar este gasto y sus evidencias?')) return;
                accion(async () => {
                  await api('/api/gastos', { method: 'DELETE', body: { id: g.id } });
                });
              }}
              onRefrescar={() => router.refresh()} />
          ))}
        </ul>
      )}
    </Plegable>
  );

  const panelComisiones = (
    <Plegable titulo="Comisiones" icono={<IconoComision />} material="lamina-honda"
      cuenta={comisiones.length}
      total={resta(cerrada ? comisionesReales : comisionesEstimadas)}
      resumen={cerrada ? 'generadas al cerrar' : 'estimadas'} siCabe>
      {comisiones.length === 0 ? (
        <Vacio texto={cerrada
          ? 'Cerrada sin comisiones: no había tripulación ni vendedor asignado.'
          : `Se generan al cerrar la ruta. Con lo capturado hoy serían ${mxn(comisionesEstimadas)}.`} />
      ) : (
        <ul className="max-h-[24vh] divide-y divide-white/[0.05] overflow-y-auto">
          {comisiones.map((c) => (
            <li key={c.id} className="flex items-center gap-2 px-4 py-2.5">
              <span className="min-w-0 flex-1 truncate text-sm">{nombrePorId[c.contacto_id] ?? '—'}</span>
              <span className="cifra shrink-0 text-xs text-ink-mute">
                {c.rol} · {Number(c.porcentaje)}%
              </span>
              <span className="cifra w-20 shrink-0 text-right text-sm font-medium">
                {mxn(Number(c.monto))}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Plegable>
  );

  const panelViaje = (
    <PanelViaje ruta={ruta} envios={envios} ubicadas={ubicadas.length}
      vehiculos={vehiculos} vehiculo={vehiculo} cerrada={cerrada} cargando={cargando}
      onRecalcular={recalcular}
      onCampo={(campos, aviso) => accion(async () => {
        const r = await api<{ gastos_movidos?: number }>(`/api/rutas/${ruta.id}`, {
          method: 'PATCH', body: campos,
        });
        setNota(r.gastos_movidos
          ? `${aviso} · ${r.gastos_movidos} ${r.gastos_movidos === 1 ? 'gasto se movió' : 'gastos se movieron'} con la ruta`
          : aviso);
      })} />
  );

  const panelCobro = fase6
    ? <PanelCobro envios={envios} cobros={cobros} />
    : null;

  const panelEquipo = (
    <PanelEquipo tripulacion={tripulacion} nombrePorId={nombrePorId} ruta={ruta}
      cerrada={cerrada}
      onAgregar={() => { setError(null); setModal('tripulacion'); }}
      onQuitar={(id) => accion(async () => {
        await api('/api/tripulacion', { method: 'DELETE', body: { id } });
      })}
      onNota={(texto) => accion(async () => {
        await api(`/api/rutas/${ruta.id}`, { method: 'PATCH', body: { notas: texto || null } });
        setNota('Nota guardada');
      })} />
  );

  const resultado = (
    <PanelResultado ingreso={ingreso} gastos={gastosViaje}
      comisiones={cerrada ? comisionesReales : comisionesEstimadas}
      renta={renta} utilidad={utilidad} margen={margen}
      porCobrar={porCobrar} cerrada={cerrada} vehiculo={vehiculo} />
  );

  const viaje = ubicadas.length > 0 ? (
    <Mapa paradas={puntos} globo={globoMision} linea={ruta.trayecto?.linea} alto="100%"
      controles="bottomleft" margen={margenMapa} />
  ) : (
    <LienzoRuta envios={envios} roundtrip={ruta.roundtrip}
      onUbicar={(e) => { setError(null); setUbicando(e); }} />
  );

  /*
   * El acomodo.
   *
   * A la izquierda lo que se lee primero —de qué ruta hablamos, qué dejó y
   * qué entregó—; a la derecha el mapa y, debajo, lo que hay que ir a buscar.
   * El mapa ya no es el fondo de todo: en una ruta la pregunta que trae a
   * alguien aquí es "¿convino?", y esa se contesta con números. El recorrido
   * los explica, pero no los sustituye.
   *
   * Es una sola estructura para las dos pantallas: en celular el mapa crece
   * hasta llenar el alto y la columna de datos se recoge en la hoja de abajo.
   * Duplicarla habría montado dos mapas de Leaflet y pedido dos veces las
   * mismas teselas.
   */
  return (
    <div data-pantalla-completa
      className="relative h-full w-full overflow-hidden md:flex md:gap-4 md:p-4">

      {/* ── Los datos que se leen primero ── */}
      <aside className="hidden min-h-0 w-[25rem] shrink-0 flex-col gap-4 md:flex">
        {cabecera}
        {resultado}
        {listaMisiones}
        {/* Quién fue se ancla abajo: es lo último que se consulta y así la
            columna termina donde termina la pantalla, sin hueco a la vista. */}
        <div className="mt-auto">{panelEquipo}</div>
      </aside>

      {/* ── El recorrido y, debajo, el resto ── */}
      <div className="flex h-full min-w-0 flex-1 flex-col md:gap-4">
        {/* Sin borde ni esquinas: el recorrido se desvanece por las orillas y
            se funde con el fondo. Encerrado en un rectángulo con filo era una
            lámina más entre las otras, y el mapa no es un dato al lado de los
            demás sino el sitio donde ocurrieron. */}
        <div className="mapa-difuminado relative min-h-0 flex-1 overflow-hidden">
          {viaje}
          {/* Los ajustes del viaje van sobre el mapa y no en una columna: lo
              que cambian —los kilómetros, el regreso— se ve ahí mismo. */}
          <div className="absolute left-3 top-3 z-[900] hidden w-[27rem]
            max-w-[calc(100%-1.5rem)] md:block">
            {panelViaje}
          </div>
        </div>

        <div className="hidden shrink-0 gap-4 md:grid md:grid-cols-3">
          {panelGastos}
          {panelComisiones}
          {panelCobro}
        </div>
      </div>

      {/* Los avisos flotan al centro: son del momento, no del viaje, y meterlos
          en una columna movería todo lo de abajo cada vez que aparecen. */}
      <Avisos error={error} nota={nota} fase6={fase6}
        onCerrar={() => { setNota(null); setError(null); }} />

      {/* ── Celular: la cabecera arriba y una hoja abajo ── */}
      <div className="pointer-events-none absolute inset-0 z-[900] flex flex-col p-3 md:hidden">
        <BordesOscuros />
        <div className="pointer-events-auto relative shrink-0">{cabecera}</div>
        <HojaMovil
          titulo={`${envios.length} ${envios.length === 1 ? 'misión' : 'misiones'} · ${mxn(ingreso)}`}
          detalle={cerrada ? 'Cerrada · toca para ver el desglose' : 'Toca para capturar y ver el desglose'}
          cifra={mxn(utilidad)} tono={utilidad < 0 ? 'malo' : 'bueno'}>
          {resultado}
          {listaMisiones}
          {panelGastos}
          {panelComisiones}
          {panelCobro}
          {panelViaje}
          {panelEquipo}
        </HojaMovil>
      </div>

      {/* ══ Ventanas de captura ══ */}
      <ModalMision abierto={modal === 'mision' || editando != null}
        onCerrar={() => { setModal(null); setEditando(null); }}
        ruta={ruta} envio={editando} cobros={editando ? cobrosDe(editando.id) : []}
        clientes={clientes} vendedores={vendedores} gente={gente} fase6={fase6}
        error={error} cargando={cargando}
        onGuardar={(cuerpo, desglose, cerrarAlGuardar) => accion(async () => {
          const guardado = editando
            ? await api<Envio>('/api/envios', { method: 'PATCH', body: { id: editando.id, ...cuerpo } })
            : await api<Envio>('/api/envios', { method: 'POST', body: { ruta_id: ruta.id, ...cuerpo } });
          if (fase6 && desglose) {
            await api('/api/envios/cobro', {
              method: 'PUT',
              body: { envio_id: guardado.id, ...desgloseABody(desglose, ruta.fecha) },
            });
          }
          if (!editando) await retrazar();
          if (cerrarAlGuardar) { setModal(null); setEditando(null); }
        })} />

      <ModalCobro envio={cobrando} cobros={cobrando ? cobrosDe(cobrando.id) : []}
        fecha={ruta.fecha} gente={gente} error={error} cargando={cargando}
        onCerrar={() => setCobrando(null)}
        onGuardar={(envioId, d) => accion(async () => {
          await api('/api/envios/cobro', {
            method: 'PUT', body: { envio_id: envioId, ...desgloseABody(d, ruta.fecha) },
          });
          setCobrando(null);
        })} />

      <ModalGasto abierto={modal === 'gasto'} onCerrar={() => setModal(null)}
        ruta={ruta} gente={gente} subcategorias={subcategorias} error={error} cargando={cargando}
        onGuardar={(lineas, quien, metodo) => accion(async () => {
          await api('/api/gastos', {
            method: 'POST',
            body: lineas.map((l) => ({
              ruta_id: ruta.id, fecha: ruta.fecha, tipo: 'operativo',
              categoria: l.categoria, monto: l.monto,
              subcategoria_id: l.subcategoria_id || null,
              descripcion: l.descripcion || null, vehiculo_id: ruta.vehiculo_id,
              metodo_pago: metodo,
              ...custodiaABody(quien, 'pagado_por'),
            })),
          });
          setModal(null);
        })} />

      <ModalUbicar abierto={ubicando != null} onCerrar={() => setUbicando(null)}
        destino={ubicando?.destino ?? ''}
        inicial={ubicando?.lat != null && ubicando?.lng != null
          ? { lat: Number(ubicando.lat), lng: Number(ubicando.lng) } : null}
        cargando={cargando} error={error}
        onGuardar={(l) => ubicando && guardarUbicacion(ubicando, l)} />

      <ModalTripulacion abierto={modal === 'tripulacion'} onCerrar={() => setModal(null)}
        choferes={choferes} ayudantes={ayudantes} yaEstan={tripulacion}
        error={error} cargando={cargando}
        onGuardar={(contactoId, rol) => accion(async () => {
          await api('/api/tripulacion', { method: 'POST', body: { ruta_id: ruta.id, contacto_id: contactoId, rol } });
          setModal(null);
        })} />
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Marcas de sección

   Con todas las tarjetas del mismo tono la pantalla se leía como una
   cuadrícula de rectángulos iguales y había que ir a buscar el título para
   saber en cuál se estaba. Cada sección lleva su icono y su color: se
   reconocen de reojo, sin leer.

   El color dice de qué son. Verde lo que quedó, teal lo que se entregó y lo
   que entró, naranja y ámbar lo que se fue. El lima no aparece: en esta app
   marca lo ACTIVO y nada más.
   ══════════════════════════════════════════════════════════════════════════ */

const svg = {
  width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none',
  stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const, 'aria-hidden': true,
  className: 'shrink-0',
};

/** Lo que quedó del viaje. */
function IconoUtilidad() {
  return <svg {...svg} className="shrink-0 text-good">
    <path d="M3 17l6-6 4 4 8-8M15 7h6v6" /></svg>;
}
/** Las entregas: el camino con sus paradas. */
function IconoMision() {
  return <svg {...svg} className="shrink-0 text-brand">
    <circle cx="6" cy="6" r="2.5" /><circle cx="18" cy="18" r="2.5" />
    <path d="M8.5 6H14a3 3 0 010 6h-4a3 3 0 000 6h5.5" /></svg>;
}
/** Lo que se gastó en el camino. */
function IconoGasto() {
  return <svg {...svg} className="shrink-0 text-dato">
    <path d="M4.5 20V5.5A1.5 1.5 0 016 4h8a1.5 1.5 0 011.5 1.5V20l-2-1.4-2 1.4-2-1.4-2 1.4z" />
    <path d="M8 8.5h4M8 12h4" /></svg>;
}
/** Lo que se llevó la gente. */
function IconoComision() {
  return <svg {...svg} className="shrink-0 text-warn">
    <circle cx="12" cy="12" r="8" /><path d="M12 7.5v9M14 10a2 2 0 00-4 .4c0 1.9 4 1 4 3a2 2 0 01-4 .4" /></svg>;
}
/** Dónde quedó el dinero. */
function IconoCobro() {
  return <svg {...svg} className="shrink-0 text-ink-soft">
    <rect x="2.5" y="6" width="19" height="12" rx="2.5" /><circle cx="12" cy="12" r="2.5" /></svg>;
}
/** Quiénes iban arriba. */
function IconoGente() {
  return <svg {...svg} className="shrink-0 text-ink-mute">
    <circle cx="9" cy="8" r="3" />
    <path d="M3.5 19a5.5 5.5 0 0111 0M16 5.5a3 3 0 010 5.8M17.5 19a5.4 5.4 0 00-2-4.2" /></svg>;
}
/** La unidad y su recorrido. */
function IconoCamion() {
  return <svg {...svg} className="shrink-0 text-ink-soft">
    <path d="M2.5 16V7a1 1 0 011-1h9.5v10M13 10h4l4 3.5V16" />
    <circle cx="7" cy="17.5" r="1.8" /><circle cx="17.5" cy="17.5" r="1.8" /></svg>;
}

/* ══════════════════════════════════════════════════════════════════════════
   Piezas sueltas
   ══════════════════════════════════════════════════════════════════════════ */

/** Lo que se resta lleva su signo — salvo el cero, que no resta nada. */
function resta(n: number): string {
  return n ? `−${mxn(n)}` : mxn(0);
}

function Vacio({ texto }: { texto: string }) {
  return <p className="px-4 py-3 text-xs leading-relaxed text-ink-mute">{texto}</p>;
}

/**
 * Si la ventana es de celular.
 *
 * Solo para el encuadre del mapa: ahí los paneles lo tapan por arriba y por
 * abajo, y en escritorio por ningún lado. Se mide con `matchMedia` en un
 * efecto y no al renderizar, para que el servidor y el navegador pinten lo
 * mismo la primera vez.
 */
function useEsCelular() {
  const [si, setSi] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const leer = () => setSi(mq.matches);
    leer();
    mq.addEventListener('change', leer);
    return () => mq.removeEventListener('change', leer);
  }, []);
  return si;
}

function BotonFila({ onClick, peligro, children }: {
  onClick: () => void; peligro?: boolean; children: React.ReactNode;
}) {
  return (
    <button type="button" onClick={onClick}
      className={`rounded-lg border border-white/[0.09] bg-white/[0.04] px-2.5 py-1 text-[11px]
        font-medium transition ${peligro
          ? 'text-ink-mute hover:border-bad/40 hover:text-bad'
          : 'text-ink-soft hover:border-ink-mute hover:text-ink'}`}>
      {children}
    </button>
  );
}

function Renglon({ etiqueta, valor, nota, tono, fuerte, atenuado }: {
  etiqueta: string; valor: string; nota?: string;
  tono?: 'aviso' | 'malo'; fuerte?: boolean; atenuado?: boolean;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className={`text-[13px] leading-tight ${
          atenuado ? 'text-ink-mute' : fuerte ? 'text-ink' : 'text-ink-soft'}`}>{etiqueta}</span>
        <span className={`cifra shrink-0 text-[13px] ${
          tono === 'malo' ? 'text-bad' : tono === 'aviso' ? 'text-warn'
            : atenuado ? 'text-ink-mute' : fuerte ? 'font-medium text-ink' : 'text-ink-soft'}`}>
          {valor}
        </span>
      </div>
      {nota && <p className="mt-0.5 text-[11px] leading-tight text-ink-mute">{nota}</p>}
    </div>
  );
}

/**
 * Los avisos del momento: el error de la última acción, la confirmación de que
 * algo se guardó, y la advertencia de que falta una migración. Flotan sobre el
 * mapa en vez de ocupar sitio en una columna, porque desaparecen solos.
 */
function Avisos({ error, nota, fase6, onCerrar }: {
  error: string | null; nota: string | null; fase6: boolean; onCerrar: () => void;
}) {
  if (!error && !nota && fase6) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 top-3 z-[950] flex justify-center px-4">
      <button type="button" onClick={onCerrar}
        className="pointer-events-auto max-w-lg text-left">
        {error && (
          <p className="vidrio mb-2 border-bad/30 px-3.5 py-2 text-xs text-bad">{error}</p>
        )}
        {nota && (
          <p className="vidrio mb-2 border-good/30 px-3.5 py-2 text-xs text-good">{nota}</p>
        )}
        {!fase6 && (
          <p className="vidrio border-warn/30 px-3.5 py-2 text-xs text-warn">
            Falta correr <code>supabase/fase6.sql</code>: el desglose de cobro, las
            subcategorías y las evidencias todavía no están disponibles.
          </p>
        )}
      </button>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Cabecera
   ══════════════════════════════════════════════════════════════════════════ */

const TONO_ESTADO: Record<EstadoRuta, 'bueno' | 'info' | 'aviso' | 'neutro' | 'malo'> = {
  cotizada: 'neutro', agendada: 'info', en_curso: 'aviso',
  entregada: 'bueno', cancelada: 'malo',
};

/**
 * Quién es esta ruta. Cerrada dice a dónde fue, cuándo y en qué estado está;
 * abierta trae el cambio de estado y el borrado, que son las dos cosas que no
 * conviene tener a un clic de distancia por accidente.
 */
function PanelCabecera({
  ruta, envios, vehiculo, chofer, cerrada, cargando, onEstado, onEliminar,
}: {
  ruta: Ruta; envios: Envio[]; vehiculo: string | null; chofer: string | null;
  cerrada: boolean; cargando: boolean;
  onEstado: (e: EstadoRuta) => void; onEliminar: () => void;
}) {
  const { abierto, props, alternar } = useDesplegable();
  const estado = ESTADOS.find((e) => e.v === ruta.estado);

  return (
    <section {...props} className="lamina shrink-0 overflow-hidden">
      <div className="flex items-start gap-3 px-4 pb-3 pt-3">
        <div className="min-w-0 flex-1">
          <Link href="/rutas" className="text-xs text-ink-mute transition hover:text-ink">
            ← Rutas
          </Link>
          <div className="mt-1 flex items-baseline gap-2">
            <h1 className="min-w-0 flex-1 truncate text-2xl font-medium leading-tight tracking-tight">
              {envios[0]?.destino ?? `Ruta #${ruta.folio}`}
            </h1>
            <span className="cifra shrink-0 text-xs text-ink-mute">#{ruta.folio}</span>
          </div>
          <p className="mt-1 text-xs leading-snug text-ink-mute">
            {fechaCorta(ruta.fecha)}
            {' · '}{envios.length} {envios.length === 1 ? 'misión' : 'misiones'}
            {ruta.km_total ? ` · ${Number(ruta.km_total).toLocaleString('es-MX')} km` : ''}
            {vehiculo ? ` · ${vehiculo}` : ''}
            {chofer ? ` · ${chofer}` : ''}
          </p>
        </div>
        <button type="button" onClick={alternar} aria-expanded={abierto}
          className="mt-5 flex shrink-0 items-center gap-1.5">
          <Etiqueta tono={TONO_ESTADO[ruta.estado]}>{estado?.label ?? ruta.estado}</Etiqueta>
          <span aria-hidden className={`text-[11px] text-ink-mute transition-transform
            ${abierto ? 'rotate-180' : ''}`}>▾</span>
        </button>
      </div>

      <Cuerpo abierto={abierto}>
        <div className="space-y-3 border-t border-white/[0.07] px-4 py-3.5">
          <div className="flex flex-wrap gap-1.5">
            {ESTADOS.map((e) => (
              <Chip key={e.v} activo={ruta.estado === e.v} disabled={cargando}
                onClick={() => onEstado(e.v)}>{e.label}</Chip>
            ))}
          </div>
          {cerrada && (
            <p className="text-xs text-ink-mute">
              Cerrada: los porcentajes de este viaje quedaron congelados.
            </p>
          )}
          <div className="flex items-center gap-2">
            {!cerrada ? (
              <Boton onClick={() => onEstado('entregada')} disabled={cargando}>
                {cargando ? 'Cerrando…' : 'Cerrar ruta'}
              </Boton>
            ) : (
              <Boton variante="suave" onClick={() => onEstado('agendada')} disabled={cargando}>
                Reabrir
              </Boton>
            )}
            <span className="flex-1" />
            <BotonFila onClick={onEliminar} peligro>Eliminar ruta</BotonFila>
          </div>
        </div>
      </Cuerpo>
    </section>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Misiones
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * La lista de misiones. Es lo único que no se pliega: es el contenido de la
 * pantalla, y plegarlo dejaría una columna de títulos sin nada dentro.
 */
function PanelMisiones({ envios, venta, cerrada, accion, children }: {
  envios: Envio[]; venta: number; cerrada: boolean;
  accion: React.ReactNode; children: React.ReactNode;
}) {
  return (
    /* Del alto de su contenido, y se desplaza por dentro cuando ya no cabe.
       Estirada al alto de la columna dejaba medio metro de tarjeta vacía
       —y entre menos misiones tenga el viaje, más se ve—. Puede encogerse:
       es la lista que puede ser larga de verdad y la que cede el espacio. */
    <section className="lamina flex min-h-0 shrink flex-col overflow-hidden">
      <div className="flex shrink-0 items-center gap-2 border-b border-white/[0.07] px-4 py-3">
        <IconoMision />
        <h2 className="text-sm font-medium tracking-tight">Misiones</h2>
        {envios.length > 0 && (
          <span className="rounded-full bg-white/[0.08] px-1.5 py-0.5 text-[11px] text-ink-mute">
            {envios.length}
          </span>
        )}
        <span className="flex-1" />
        {venta > 0 && <span className="cifra text-sm text-ink-soft">{mxn(venta)}</span>}
        {accion}
      </div>

      {envios.length === 0 ? (
        <Vacio texto={cerrada
          ? 'Esta ruta se cerró sin misiones, así que no tuvo ingreso.'
          : 'Sin misiones. Una ruta sin misiones no tiene ingreso.'} />
      ) : (
        <ul className="min-h-0 max-h-[45vh] divide-y divide-white/[0.05] overflow-y-auto">
          {children}
        </ul>
      )}
    </section>
  );
}

/**
 * Una misión.
 *
 * Dice de corrido lo que se consulta: a dónde, de quién, qué tamaño, cuántos
 * kilómetros, cómo quedó el cobro y cuánto. Al acercar el cursor se abre
 * entera —cómo se pagó, las evidencias, la ubicación y los botones de editar—
 * sin tener que hacer clic para asomarse.
 *
 * Se abre con retardo a propósito. Sin él, cruzar la lista con el ratón
 * desplegaba media docena de misiones a su paso y pedía las evidencias de
 * todas; con el retardo solo se abre la que de verdad se está mirando.
 *
 * El clic la deja fija. No es un extra: en una pantalla táctil no existe
 * "pasar por encima", y ahí el clic es la única manera de abrirla.
 */
function FilaMision({
  envio, cobros, evidencias, abierta, onAbrir, nombrePorId, cerrada, fase6,
  primera, ultima, onMover, onEditar, onCobro, onUbicar, onEliminar, onRefrescar,
}: {
  envio: Envio; cobros: Cobro[]; evidencias: number;
  abierta: boolean; onAbrir: () => void;
  nombrePorId: Record<string, string>; cerrada: boolean; fase6: boolean;
  primera: boolean; ultima: boolean;
  onMover: (delta: number) => void;
  onEditar: () => void; onCobro: () => void; onUbicar: () => void;
  onEliminar: () => void; onRefrescar: () => void;
}) {
  const { abierto: encima, props } = useDesplegable(false, 180);
  const desplegada = encima || abierta;
  const ubicada = envio.lat != null && envio.lng != null;
  const precio = Number(envio.precio);
  const cobrado = cobros.reduce((s, c) => s + Number(c.monto), 0);
  const debe = Math.round((precio - cobrado) * 100) / 100;
  const meta = [
    envio.cliente_id ? nombrePorId[envio.cliente_id] : null,
    envio.tamano_carga,
    envio.distancia_km ? `${Number(envio.distancia_km)} km` : null,
    envio.vendedor_id ? `vende ${nombrePorId[envio.vendedor_id]}` : null,
  ].filter(Boolean).join(' · ');

  return (
    <li {...props} className={`group transition-colors ${
      desplegada ? 'bg-white/[0.04]' : 'hover:bg-white/[0.03]'}`}>
      <button onClick={onAbrir} className="flex w-full items-start gap-3 px-4 py-3 text-left">
        <span className="cifra mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full
          bg-brand/25 text-[11px] font-medium text-brand">{envio.secuencia}</span>

        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{envio.destino}</span>
            {ubicada && <span className="shrink-0 text-[11px]"
              title={envio.zona ?? 'Ubicada en el mapa'}>📍</span>}
            <span aria-hidden className={`shrink-0 text-[11px] text-ink-mute transition-transform
              ${desplegada ? 'rotate-90' : ''}`}>›</span>
          </span>
          {meta && <span className="mt-0.5 block truncate text-xs text-ink-mute">{meta}</span>}
          <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <ChipsCobro envio={envio} cobros={cobros} />
            <ContadorEvidencias n={evidencias} />
          </span>
        </span>

        <span className="flex shrink-0 flex-col items-end gap-1">
          <span className="cifra text-sm font-medium">{mxn(precio)}</span>
          {!cerrada && (
            /* Flechas y no arrastrar: en el celular, que es donde se captura,
               arrastrar pelea con desplazar la lista. Aparecen al acercarse
               porque ordenar es cosa de una vez, no de cada consulta. */
            <span className="flex items-center opacity-0 transition-opacity group-hover:opacity-100">
              <span role="button" tabIndex={0} aria-label="Subir la misión"
                onClick={(ev) => { ev.stopPropagation(); if (!primera) onMover(-1); }}
                className={`px-1 text-[10px] transition hover:text-ink ${primera ? 'opacity-20' : ''}`}>▲</span>
              <span role="button" tabIndex={0} aria-label="Bajar la misión"
                onClick={(ev) => { ev.stopPropagation(); if (!ultima) onMover(1); }}
                className={`px-1 text-[10px] transition hover:text-ink ${ultima ? 'opacity-20' : ''}`}>▼</span>
            </span>
          )}
        </span>
      </button>

      {desplegada && (
        <div className="space-y-3 border-t border-white/[0.05] bg-black/25 px-4 py-3.5">
          {fase6 && (
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="etiqueta text-[11px]">Cómo se pagó</p>
                <p className="mt-0.5 text-[13px] leading-tight text-ink-soft">
                  {comoSePago(envio, cobros)}
                </p>
              </div>
              <BotonFila onClick={onCobro}>
                {cobros.length === 0 ? 'Registrar' : 'Cambiar'}
              </BotonFila>
            </div>
          )}

          {fase6 && (
            <Evidencias dueno={{ envio_id: envio.id }} titulo="Evidencia de entrega"
              compacto onCambio={onRefrescar} />
          )}

          {/* Ubicación. Se puede poner aun con la ruta cerrada: es un dato del
              viaje que ya pasó, no una decisión que la cierre reabra. */}
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="etiqueta text-[11px]">Ubicación</p>
              <p className="mt-0.5 text-[13px] leading-tight text-ink-soft">
                {ubicada
                  ? `${envio.zona || 'Ubicada'}${envio.distancia_km ? ` · ${Number(envio.distancia_km)} km desde la anterior` : ''}`
                  : 'Sin ubicación. Sin ella no entra en el recorrido ni en los kilómetros.'}
              </p>
            </div>
            <BotonFila onClick={onUbicar}>{ubicada ? 'Cambiar' : 'Ubicar'}</BotonFila>
          </div>

          {!cerrada && (
            <div className="flex flex-wrap gap-1.5">
              <BotonFila onClick={onEditar}>Editar misión</BotonFila>
              <BotonFila onClick={onEliminar} peligro>Eliminar</BotonFila>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

/** El estado del cobro de una misión, en una etiqueta. */
function ChipsCobro({ envio, cobros }: { envio: Envio; cobros: Cobro[] }) {
  const precio = Number(envio.precio);
  const cobrado = cobros.reduce((s, c) => s + Number(c.monto), 0);
  const debe = Math.round((precio - cobrado) * 100) / 100;

  if (cobros.length === 0) {
    if (envio.a_credito) return <Etiqueta tono="aviso">por cobrar</Etiqueta>;
    // Sin desglose y sin crédito: la app lo da por cobrado, pero es un
    // supuesto. Decirlo aquí es lo que permite ir a corregirlo.
    return envio.cobro_detallado
      ? <Etiqueta tono="aviso">sin pagar</Etiqueta>
      : <Etiqueta tono="neutro">se supone cobrado</Etiqueta>;
  }

  const usados = [...new Set(cobros.map((c) => c.metodo).filter(esMetodo))];
  return (
    <>
      {usados.map((m) => (
        <Etiqueta key={m} tono={m === 'tienda' ? 'info' : 'neutro'}>
          {METODO_INFO[m].corto}
        </Etiqueta>
      ))}
      {debe > 0 && <Etiqueta tono="aviso">debe {mxn(debe)}</Etiqueta>}
    </>
  );
}

/** Cómo se pagó una misión, en una frase. La leen la lista y el globo. */
function comoSePago(envio: Envio, cobros: Cobro[]): string {
  if (cobros.length === 0) {
    return envio.cobro_detallado
      ? 'Nadie ha pagado nada todavía.'
      : 'Sin desglose. Se da por cobrado en efectivo al entregar.';
  }
  const debe = Math.round(
    (Number(envio.precio) - cobros.reduce((s, c) => s + Number(c.monto), 0)) * 100) / 100;
  const partes = cobros.map((c) => (
    `${METODO_INFO[c.metodo as Metodo]?.label ?? c.metodo ?? 'Sin método'} ${mxn(Number(c.monto))}`));
  return partes.join('  ·  ') + (debe > 0 ? `  ·  debe ${mxn(debe)}` : '');
}

/**
 * El globo que abre un pin del mapa.
 *
 * Dice lo mismo que el renglón de la lista y trae los mismos botones. No es
 * duplicar por gusto: quien está mirando el mapa ya encontró la misión, y
 * mandarlo a buscarla otra vez en la columna de la izquierda para cambiarle
 * algo lo devuelve al principio.
 *
 * Los botones abren las mismas ventanas que la lista y no un formulario
 * propio. Dos formularios para el mismo dato se separan a la primera
 * corrección que se le haga a uno solo.
 *
 * Va sin `<Evidencias>` y con el contador a secas: el globo de cada pin se
 * pinta aunque esté cerrado —Leaflet mide el contenido al abrirlo—, así que
 * montar ahí un componente que pide archivos pediría las evidencias de todas
 * las misiones nada más abrir la ruta.
 */
function GloboMision({
  envio, cobros, evidencias, nombrePorId, cerrada, fase6,
  onCerrar, onEditar, onCobro, onUbicar,
}: {
  envio: Envio; cobros: Cobro[]; evidencias: number;
  nombrePorId: Record<string, string>; cerrada: boolean; fase6: boolean;
  onCerrar: () => void;
  onEditar: () => void; onCobro: () => void; onUbicar: () => void;
}) {
  const precio = Number(envio.precio);

  return (
    <div className="text-ink">
      <header className="flex items-start gap-2.5 px-4 pt-3.5">
        <span className="cifra mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full
          bg-brand/25 text-[11px] font-medium text-brand">{envio.secuencia}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium leading-tight">{envio.destino}</span>
          <span className="mt-0.5 block truncate text-[11px] text-ink-mute">
            {envio.zona || 'Sin zona'}
          </span>
        </span>
        <button type="button" onClick={onCerrar} aria-label="Cerrar"
          className="-mr-1 -mt-0.5 shrink-0 rounded-lg px-1.5 py-0.5 text-[13px] leading-none
            text-ink-mute transition hover:text-ink">✕</button>
      </header>

      <div className="mt-2.5 flex items-end gap-2 px-4">
        <span className="cifra flex-1 text-2xl font-light leading-none">{mxn(precio)}</span>
        <span className="flex flex-wrap items-center justify-end gap-1.5">
          <ChipsCobro envio={envio} cobros={cobros} />
          <ContadorEvidencias n={evidencias} />
        </span>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2.5 border-t border-white/[0.07] px-4 py-3">
        <Dato etiqueta="Cliente"
          valor={envio.cliente_id ? nombrePorId[envio.cliente_id] ?? null : null} />
        <Dato etiqueta="Tamaño" valor={envio.tamano_carga} />
        <Dato etiqueta="Desde la anterior"
          valor={envio.distancia_km ? `${Number(envio.distancia_km)} km` : null} />
        <Dato etiqueta="Vendedor"
          valor={envio.vendedor_id ? nombrePorId[envio.vendedor_id] ?? null : null} />
      </dl>

      {/* Solo cuando hay desglose que contar. Sin él, la etiqueta de arriba
          —"se supone cobrado"— ya lo dijo, y repetirlo en dos renglones le
          añade al globo un tercio de alto para no decir nada nuevo. */}
      {fase6 && cobros.length > 0 && (
        <div className="border-t border-white/[0.07] px-4 py-3">
          <p className="etiqueta text-[10px]">Cómo se pagó</p>
          <p className="mt-1 text-[12px] leading-snug text-ink-soft">{comoSePago(envio, cobros)}</p>
        </div>
      )}

      {/* Columnas iguales y no botones al hilo: con el ancho del globo, tres
          etiquetas sueltas caían en dos renglones y la tercera quedaba
          colgando sola. Así reparten el ancho, sean dos o sean tres.
          Los verbos van cortos por lo mismo; de qué misión hablan lo dice la
          cabecera, a dos dedos de aquí. */}
      <footer className="grid auto-cols-fr grid-flow-col gap-1.5 border-t border-white/[0.07] px-4 py-3">
        {!cerrada && <BotonFila onClick={onEditar}>Editar</BotonFila>}
        {fase6 && <BotonFila onClick={onCobro}>Cobro</BotonFila>}
        {/* Ubicar se puede con la ruta cerrada: es un dato del viaje que ya
            pasó, no una decisión que reabra el cierre. */}
        <BotonFila onClick={onUbicar}>Ubicación</BotonFila>
      </footer>
    </div>
  );
}

/** Un dato del globo: el nombre encima y el valor debajo. */
function Dato({ etiqueta, valor }: { etiqueta: string; valor: string | null }) {
  return (
    <div className="min-w-0">
      <dt className="etiqueta text-[10px]">{etiqueta}</dt>
      <dd className={`truncate text-[12.5px] leading-tight ${valor ? 'text-ink-soft' : 'text-ink-mute'}`}>
        {valor || '—'}
      </dd>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Gastos
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Un gasto del viaje.
 *
 * Se edita en el mismo renglón y no en una ventana: corregir un monto mal
 * tecleado o ponerle la subcategoría es un cambio de un campo, y abrir un
 * formulario entero para eso pesa más que el cambio.
 */
function FilaGasto({
  gasto, subcategorias, evidencias, abierta, onAbrir, gente, cerrada, fase6,
  onGuardar, onEliminar, onRefrescar,
}: {
  gasto: Gasto; subcategorias: SubcategoriaGasto[]; evidencias: number;
  abierta: boolean; onAbrir: () => void;
  gente: { id: string; nombre: string }[]; cerrada: boolean; fase6: boolean;
  onGuardar: (campos: Record<string, unknown>) => void;
  onEliminar: () => void; onRefrescar: () => void;
}) {
  const subs = subcategorias.filter((s) => s.categoria === gasto.categoria);
  const sub = subcategorias.find((s) => s.id === gasto.subcategoria_id);
  const metodo = esMetodo(gasto.metodo_pago) ? gasto.metodo_pago : null;

  return (
    <li>
      <div className="flex items-center gap-2 px-4 py-2.5">
        <button onClick={onAbrir} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          <span className="shrink-0 text-sm font-medium capitalize">{gasto.categoria}</span>
          <span className="min-w-0 flex-1 truncate text-xs text-ink-mute">
            {[sub?.nombre, gasto.descripcion].filter(Boolean).join(' · ') || ''}
          </span>
          {metodo && <Etiqueta tono="neutro">{METODO_INFO[metodo].corto}</Etiqueta>}
          <ContadorEvidencias n={evidencias} />
          <span aria-hidden className={`shrink-0 text-[11px] text-ink-mute transition-transform
            ${abierta ? 'rotate-90' : ''}`}>›</span>
        </button>
        <span className="cifra shrink-0 text-sm">{mxn(Number(gasto.monto))}</span>
      </div>

      {abierta && (
        <div className="space-y-3 border-t border-white/[0.05] bg-black/25 px-4 py-3.5">
          <div className="grid gap-3">
            <Campo label="Monto">
              <Input className="cifra !py-2 !text-sm" type="number" inputMode="decimal"
                defaultValue={gasto.monto} disabled={cerrada}
                onBlur={(e) => {
                  const v = e.target.value;
                  if (!v || Number(v) === Number(gasto.monto)) return;
                  onGuardar({ monto: v });
                }} />
            </Campo>
            {fase6 && (
              <Campo label="Subcategoría" hint={subs.length ? undefined : 'Se dan de alta en Configuración.'}>
                <Select className="!py-2 !text-sm" defaultValue={gasto.subcategoria_id ?? ''}
                  disabled={cerrada || subs.length === 0}
                  onChange={(e) => onGuardar({ subcategoria_id: e.target.value || null })}>
                  <option value="">— Sin especificar —</option>
                  {subs.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                </Select>
              </Campo>
            )}
            <Campo label="Descripción">
              <Input className="!py-2 !text-sm" defaultValue={gasto.descripcion ?? ''} disabled={cerrada}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v === (gasto.descripcion ?? '')) return;
                  onGuardar({ descripcion: v || null });
                }} />
            </Campo>
          </div>

          {!cerrada && (
            <div className="grid gap-3">
              <SelectorMetodo valor={metodo} onCambio={(m) => onGuardar({ metodo_pago: m })} />
              <QuienTuvo
                valor={{ contactoId: gasto.pagado_por, otro: gasto.pagado_por_otro ?? '' }}
                onCambio={(c) => onGuardar(custodiaABody(c, 'pagado_por'))}
                etiqueta="¿Quién lo pagó?" sugeridos={gente} />
            </div>
          )}

          <Campo label="Comentario">
            <textarea defaultValue={gasto.notas ?? ''} rows={2} disabled={cerrada}
              placeholder="Se cambió la llanta trasera derecha…"
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v === (gasto.notas ?? '')) return;
                onGuardar({ notas: v || null });
              }}
              className="w-full resize-y rounded-xl border border-surface-line bg-surface-raised px-3 py-2
                text-sm leading-relaxed text-ink outline-none transition placeholder:text-ink-mute
                focus:border-brand focus:ring-2 focus:ring-brand/25 disabled:opacity-50" />
          </Campo>

          {fase6 && (
            <Evidencias dueno={{ gasto_id: gasto.id }} titulo="Comprobante" compacto onCambio={onRefrescar} />
          )}

          {!cerrada && (
            <div className="flex flex-wrap items-center gap-2">
              <BotonFila onClick={onEliminar} peligro>Eliminar gasto</BotonFila>
              <span className="text-[11px] text-ink-mute">Se guarda al salir de cada campo.</span>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   El viaje: fecha, unidad, kilómetros y recorrido
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Los datos del viaje en sí, y el recorrido que los produce.
 *
 * Van juntos porque son la misma discusión: los kilómetros salen del recorrido
 * salvo que alguien los escriba a mano, y el interruptor de ida y vuelta los
 * cambia. Separados, había que saltar entre dos tarjetas para entender un solo
 * número.
 */
function PanelViaje({
  ruta, envios, ubicadas, vehiculos, vehiculo, cerrada, cargando, onRecalcular, onCampo,
}: {
  ruta: Ruta; envios: Envio[]; ubicadas: number;
  vehiculos: Vehiculo[]; vehiculo: string | null;
  cerrada: boolean; cargando: boolean;
  onRecalcular: () => void;
  onCampo: (campos: Record<string, unknown>, aviso: string) => void;
}) {
  const sinUbicar = envios.length - ubicadas;
  const kmOsrm = ruta.km_osrm != null ? Number(ruta.km_osrm) : null;
  const kmTotal = ruta.km_total != null ? Number(ruta.km_total) : null;
  const difiere = ruta.km_manual && kmOsrm != null && kmTotal != null
    && Math.abs(kmOsrm - kmTotal) > 0.5;

  return (
    <Plegable titulo="El viaje" icono={<IconoCamion />} material="vidrio"
      resumen={[
        vehiculo ?? 'sin unidad',
        ruta.roundtrip ? 'ida y vuelta' : 'solo ida',
      ].join(' · ')}
      total={kmTotal != null ? `${kmTotal.toLocaleString('es-MX')} km` : undefined}
      tono={sinUbicar > 0 ? 'aviso' : undefined}
      accion={<BotonMini onClick={onRecalcular} disabled={cargando || ubicadas === 0}>
        {cargando ? '…' : 'Recalcular'}
      </BotonMini>}>
      <div className="max-h-[60vh] space-y-3 overflow-y-auto px-4 py-3.5">
        <Campo label="Fecha" hint={cerrada ? 'se puede corregir aun cerrada' : undefined}>
          {/* defaultValue y no value: el navegador ya muestra lo elegido, y un
              control atado al servidor se sentiría trabado al guardar. */}
          <Input className="!py-2 !text-sm" type="date" defaultValue={ruta.fecha}
            onChange={(e) => {
              const fecha = e.target.value;
              if (!fecha || fecha === ruta.fecha) return;
              onCampo({ fecha }, 'Fecha corregida');
            }} />
        </Campo>

        <Campo label="Unidad" hint="Define el % de renta y el rendimiento.">
          <Select className="!py-2 !text-sm" value={ruta.vehiculo_id ?? ''} disabled={cerrada}
            onChange={(e) => onCampo({ vehiculo_id: e.target.value || null }, 'Unidad asignada')}>
            <option value="">— Sin asignar —</option>
            {vehiculos.map((v) => <option key={v.id} value={v.id}>{v.nombre}</option>)}
          </Select>
        </Campo>

        <Campo label="Km del viaje"
          hint={ruta.km_manual
            ? 'Escrito a mano: recalcular ya no lo pisa.'
            : 'Sale del recorrido. Si lo escribes, tu número manda.'}>
          <Input className="!py-2 !text-sm" type="number" inputMode="decimal"
            defaultValue={ruta.km_total ?? ''} disabled={cerrada}
            onBlur={(e) => {
              if (String(e.target.value || '') === String(ruta.km_total ?? '')) return;
              onCampo({ km_total: e.target.value || null }, e.target.value
                ? 'Kilometraje anotado a mano'
                : 'Kilometraje borrado · vuelve a salir del recorrido');
            }} />
        </Campo>

        {/* Ida y vuelta. Cambia los kilómetros del viaje y con ellos la
            gasolina estimada, así que vive junto a los km y no escondido. */}
        <button type="button" disabled={cerrada}
          onClick={() => onCampo({ roundtrip: !ruta.roundtrip },
            'Cambió el recorrido. Dale a Recalcular para actualizar los kilómetros.')}
          className="flex w-full items-center justify-between gap-2 rounded-xl border
            border-white/[0.07] bg-white/[0.03] px-3 py-2 text-left transition
            hover:border-white/20 disabled:opacity-50">
          <span className="text-sm text-ink-soft">
            Ida y vuelta
            <span className="mt-0.5 block text-[11px] leading-tight text-ink-mute">
              {ruta.roundtrip
                ? 'Los kilómetros incluyen el regreso a la bodega.'
                : 'La camioneta se queda fuera; no se cuenta el regreso.'}
            </span>
          </span>
          <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
            ruta.roundtrip ? 'bg-acento/15 text-acento' : 'bg-surface-raised text-ink-mute'}`}>
            {ruta.roundtrip ? 'Sí' : 'No'}
          </span>
        </button>

        <p className="text-[11px] leading-tight text-ink-mute">
          {ubicadas === 0
            ? 'Ninguna misión tiene ubicación, así que no hay recorrido que trazar.'
            : ruta.trayecto
              ? `${ruta.trayecto.roundtrip ? 'Ida y vuelta a la bodega' : 'Solo ida'}`
                + `${ruta.trayecto.minutos ? ` · ${(ruta.trayecto.minutos / 60).toFixed(1)} hrs de manejo` : ''}`
              : 'Sin trazar todavía. Dale a Recalcular.'}
        </p>

        {difiere && (
          <p className="rounded-lg border border-warn/25 bg-warn/10 px-3 py-2 text-[11px] leading-tight text-warn">
            El recorrido da {kmOsrm!.toLocaleString('es-MX')} km y tú anotaste{' '}
            {kmTotal!.toLocaleString('es-MX')}. Mandan los tuyos; el cálculo queda de referencia.
          </p>
        )}

        {sinUbicar > 0 && (
          <p className="text-[11px] leading-tight text-warn">
            {sinUbicar} {sinUbicar === 1 ? 'misión no tiene' : 'misiones no tienen'} ubicación
            y {sinUbicar === 1 ? 'queda fuera' : 'quedan fuera'} de estos kilómetros.
          </p>
        )}
      </div>
    </Plegable>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Cómo se cobró
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Cómo se cobró la ruta entera: la suma de los desgloses de sus misiones.
 *
 * Aquí es donde se ve, sin entrar a cada una, si el dinero de este viaje está
 * en la caja, en el banco o se quedó en la tienda a cuenta de la renta.
 */
function PanelCobro({ envios, cobros }: { envios: Envio[]; cobros: Cobro[] }) {
  const venta = envios.reduce((s, e) => s + Number(e.precio), 0);
  const porMetodo = cobros.reduce<Record<string, number>>((acc, c) => {
    if (!esMetodo(c.metodo)) return acc;
    acc[c.metodo] = (acc[c.metodo] ?? 0) + Number(c.monto);
    return acc;
  }, {});
  const cobrado = Object.values(porMetodo).reduce((s, n) => s + n, 0);
  // Las misiones sin desglose: la app las da por cobradas, pero no sabe cómo.
  const supuesto = envios
    .filter((e) => !e.cobro_detallado && !e.a_credito)
    .reduce((s, e) => s + Number(e.precio), 0);
  const debe = Math.round((venta - cobrado - supuesto) * 100) / 100;

  const resumen = Object.keys(porMetodo).length > 0
    ? Object.keys(porMetodo).map((m) => METODO_INFO[m as Metodo].corto).join(' · ')
    : supuesto > 0 ? 'sin desglose' : 'nada cobrado';

  return (
    <Plegable titulo="Cómo se cobró" icono={<IconoCobro />} material="lamina-honda"
      resumen={resumen} total={mxn(venta)}
      tono={debe > 0 ? 'aviso' : undefined} siCabe>
      <div className="max-h-[24vh] space-y-2 overflow-y-auto px-4 py-3.5">
        {Object.entries(porMetodo).map(([m, monto]) => (
          <Renglon key={m}
            etiqueta={`${METODO_INFO[m as Metodo].emoji} ${METODO_INFO[m as Metodo].label}`}
            valor={mxn(monto)} />
        ))}
        {supuesto > 0 && (
          <Renglon etiqueta="Sin desglose" valor={mxn(supuesto)} atenuado
            nota="Se da por cobrado al entregar. Ábrelas para decir cómo se pagó." />
        )}
        {debe > 0 && <Renglon etiqueta="Queda a deber" valor={mxn(debe)} tono="aviso" />}
        {cobrado === 0 && supuesto === 0 && debe === 0 && (
          <p className="text-xs text-ink-mute">Sin misiones todavía.</p>
        )}
      </div>
    </Plegable>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Tripulación y notas
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Quién fue y qué pasó. Van en el mismo panel porque son las dos cosas que se
 * consultan al revisar un viaje viejo y ninguna de las dos justifica sola una
 * lámina en pantalla.
 */
function PanelEquipo({
  tripulacion, nombrePorId, ruta, cerrada, onAgregar, onQuitar, onNota,
}: {
  tripulacion: Tripulante[]; nombrePorId: Record<string, string>; ruta: Ruta;
  cerrada: boolean;
  onAgregar: () => void; onQuitar: (id: string) => void; onNota: (texto: string) => void;
}) {
  const [texto, setTexto] = useState(ruta.notas ?? '');
  const sucio = texto !== (ruta.notas ?? '');
  const nombres = tripulacion.map((t) => nombrePorId[t.contacto_id] ?? '—');

  return (
    <Plegable titulo="Tripulación" icono={<IconoGente />} cuenta={tripulacion.length}
      resumen={nombres.length ? nombres.join(' · ') : 'sin asignar'}
      total={ruta.notas ? 'con nota' : undefined}
      accion={!cerrada && <BotonMini onClick={onAgregar}>+ Persona</BotonMini>}>
      <div className="space-y-3 px-4 py-3.5">
        {tripulacion.length === 0 ? (
          <p className="text-xs leading-relaxed text-ink-mute">
            Sin tripulación. Sin ella no hay comisiones al cerrar.
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {tripulacion.map((t) => (
              <span key={t.id}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.07]
                  bg-white/[0.04] py-1 pl-1.5 pr-2.5 text-xs">
                <Etiqueta tono={t.rol === 'chofer' ? 'info' : 'neutro'}>{t.rol}</Etiqueta>
                {nombrePorId[t.contacto_id] ?? '—'}
                {!cerrada && (
                  <button onClick={() => onQuitar(t.id)}
                    className="text-ink-mute transition hover:text-bad" aria-label="Quitar">✕</button>
                )}
              </span>
            ))}
          </div>
        )}

        <div>
          <span className="etiqueta text-[11px]">Notas del viaje</span>
          {/* Se guarda al salir del campo y no en cada tecla: guardar mientras
              se escribe manda una petición por letra y hace parpadear todo. */}
          <textarea value={texto} onChange={(e) => setTexto(e.target.value)}
            onBlur={() => { if (sucio) onNota(texto); }}
            rows={3} placeholder="El cliente no estaba, se entregó al día siguiente…"
            className="mt-1 w-full resize-y rounded-xl border border-surface-line bg-surface-raised
              px-3 py-2 text-sm leading-relaxed text-ink outline-none transition
              placeholder:text-ink-mute focus:border-brand focus:ring-2 focus:ring-brand/25" />
          <span className="mt-1 block text-[11px] text-ink-mute">
            {sucio ? 'Sin guardar · se guarda al salir del campo.' : 'Se guarda al salir del campo.'}
          </span>
        </div>
      </div>
    </Plegable>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   El resultado
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Lo que dejó el viaje.
 *
 * Es la tarjeta grande de la columna: la pregunta que trae a alguien a esta
 * pantalla es "¿convino?", y esa se contesta con un número, no con una tabla.
 * Debajo va la resta completa que lo produce, siempre a la vista mientras la
 * ventana dé el alto — son cuatro renglones y esconderlos por costumbre le
 * cobra un clic a quien viene justo a leerlos.
 */
function PanelResultado({
  ingreso, gastos, comisiones, renta, utilidad, margen, porCobrar, cerrada, vehiculo,
}: {
  ingreso: number; gastos: number; comisiones: number; renta: number;
  utilidad: number; margen: number | null;
  porCobrar: number | null; cerrada: boolean; vehiculo: string | null;
}) {
  const { abierto, props, alternar } = useDesplegable();

  return (
    <section {...props} className="lamina shrink-0 overflow-hidden">
      <button type="button" onClick={alternar} aria-expanded={abierto}
        className="w-full px-4 pb-3 pt-3.5 text-left">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <IconoUtilidad />
            <span className="etiqueta text-[11px]">Utilidad del viaje</span>
          </span>
          <span className="text-[11px] text-ink-mute">{cerrada ? 'cerrada' : 'en curso'}</span>
        </div>
        <div className="mt-2 flex items-end justify-between gap-3">
          <span className={`cifra text-[2.75rem] font-light leading-none tracking-tight ${
            utilidad < 0 ? 'text-bad' : 'text-good'}`}>
            {mxn(utilidad)}
          </span>
          <span className="flex items-center gap-2 pb-1">
            <Etiqueta tono={margen == null ? 'neutro'
              : margen < 0 ? 'malo' : margen < 15 ? 'aviso' : 'bueno'}>
              {margen != null ? `${margen.toFixed(0)}%` : '—'} de margen
            </Etiqueta>
            <span aria-hidden className={`text-[11px] text-ink-mute transition-transform
              ${abierto ? 'rotate-180' : 'alto:rotate-180'}`}>▾</span>
          </span>
        </div>
      </button>

      <Cuerpo abierto={abierto} siCabe>
        <div className="space-y-2 border-t border-white/[0.07] px-4 py-3.5">
          <Renglon etiqueta="Venta" valor={mxn(ingreso)} fuerte />
          {porCobrar != null && porCobrar > 0 && (
            <Renglon etiqueta="Sin cobrar" valor={mxn(porCobrar)} tono="aviso" />
          )}
          <Renglon etiqueta="Gastos del viaje" valor={resta(gastos)} />
          <Renglon etiqueta={cerrada ? 'Comisiones generadas' : 'Comisiones estimadas'}
            valor={resta(comisiones)} atenuado={!cerrada}
            nota={cerrada ? undefined : 'Todavía no existen: se generan al cerrar la ruta.'} />
          <Renglon etiqueta={`Renta de la unidad${vehiculo ? ` · ${vehiculo}` : ''}`}
            valor={resta(renta)} />
        </div>
      </Cuerpo>
    </section>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Ventanas de captura
   ══════════════════════════════════════════════════════════════════════════ */

interface CuerpoMision {
  destino: string; precio: string; cliente_id: string | null; vendedor_id: string | null;
  tamano_carga: TamanoCarga | null; distancia_km: string | null;
}

/**
 * Alta y edición de una misión.
 *
 * Es la misma ventana para las dos cosas a propósito: los campos son idénticos
 * y mantener dos formularios en paralelo termina con uno de los dos olvidado
 * el día que se agregue un campo nuevo.
 *
 * El estado del formulario vive en `FormularioMision` y no aquí, con la `key`
 * en ese componente: así, pasar de editar una misión a otra lo vuelve a montar
 * con los datos de la nueva. Sembrarlo desde fuera dejaría los datos de la
 * primera en pantalla hasta que alguien tocara un campo.
 */
function ModalMision({
  abierto, onCerrar, ruta, envio, cobros, clientes, vendedores, gente, fase6,
  onGuardar, error, cargando,
}: {
  abierto: boolean; onCerrar: () => void; ruta: Ruta;
  /** La misión que se edita, o null para dar una de alta. */
  envio: Envio | null;
  cobros: Cobro[];
  clientes: Contacto[]; vendedores: Contacto[];
  gente: { id: string; nombre: string }[];
  fase6: boolean;
  onGuardar: (cuerpo: CuerpoMision, desglose: Desglose | null, cerrar: boolean) => void;
  error: string | null; cargando: boolean;
}) {
  return (
    <Modal abierto={abierto} onCerrar={onCerrar}
      titulo={envio ? 'Editar misión' : 'Agregar misión'}
      descripcion="Cada misión cobra completo; los gastos del viaje se comparten.">
      <FormularioMision key={envio?.id ?? 'nueva'}
        envio={envio} cobros={cobros} ruta={ruta}
        clientes={clientes} vendedores={vendedores} gente={gente} fase6={fase6}
        error={error} cargando={cargando} onCerrar={onCerrar} onGuardar={onGuardar} />
    </Modal>
  );
}

interface FormMision {
  destino: string; precio: string; cliente_id: string; vendedor_id: string;
  tamano_carga: '' | TamanoCarga; km: string;
}

function FormularioMision({
  envio, cobros, ruta, clientes, vendedores, gente, fase6,
  error, cargando, onCerrar, onGuardar,
}: {
  envio: Envio | null; cobros: Cobro[]; ruta: Ruta;
  clientes: Contacto[]; vendedores: Contacto[];
  gente: { id: string; nombre: string }[]; fase6: boolean;
  error: string | null; cargando: boolean;
  onCerrar: () => void;
  onGuardar: (cuerpo: CuerpoMision, desglose: Desglose | null, cerrar: boolean) => void;
}) {
  const vacio: FormMision = {
    destino: '', precio: '', cliente_id: '', vendedor_id: '', tamano_carga: '', km: '',
  };

  const [f, setF] = useState<FormMision>(() => (envio ? {
    destino: envio.destino,
    precio: String(envio.precio),
    cliente_id: envio.cliente_id ?? '',
    vendedor_id: envio.vendedor_id ?? '',
    tamano_carga: envio.tamano_carga ?? '',
    km: envio.distancia_km != null ? String(envio.distancia_km) : '',
  } : vacio));

  // Arranca en efectivo por el total: así se cobra casi siempre, y el caso
  // normal no cuesta ningún clic. Al editar se reconstruye de lo guardado.
  const [pago, setPago] = useState<Desglose>(() => {
    if (!envio) return desgloseSimple('efectivo', '');
    if (cobros.length > 0) return desgloseDesdeCobros(cobros);
    return envio.a_credito ? desgloseVacio() : desgloseSimple('efectivo', envio.precio);
  });

  const precio = Number(f.precio || 0);
  const falta = restante(pago, precio);

  // Si nadie ha tocado el desglose, el precio manda sobre él. En cuanto se
  // toca, deja de moverse solo: quien acaba de marcar "queda a deber" no
  // esperaría que teclear el precio lo regresara a efectivo.
  const [tocado, setTocado] = useState(envio != null);
  const cambiarPago = (d: Desglose) => { setTocado(true); setPago(d); };

  /**
   * El desglose sigue al precio: el precio se teclea DESPUÉS de elegir cómo se
   * paga, y sin esto el monto se quedaría en el valor viejo sin que nadie lo
   * notara.
   */
  function alPrecio(v: string) {
    const usados = metodosUsados(pago);
    if (!tocado) {
      // Todavía en el default: efectivo, completo. Es como se cobra casi siempre.
      setPago(desgloseSimple('efectivo', v));
    } else if (usados.length === 1 && montoDe(pago, usados[0]) === precio) {
      setPago({ ...pago, montos: { ...pago.montos, [usados[0]]: v } });
    }
    setF({ ...f, precio: v });
  }

  function guardar(cerrar: boolean) {
    onGuardar({
      destino: f.destino.trim(), precio: f.precio || '0',
      cliente_id: f.cliente_id || null, vendedor_id: f.vendedor_id || null,
      tamano_carga: f.tamano_carga || null,
      distancia_km: f.km || null,
    }, fase6 ? pago : null, cerrar);
    if (!envio) { setF(vacio); setPago(desgloseSimple('efectivo', '')); setTocado(false); }
  }

  return (
    <div className="space-y-4">
      <Campo label="¿A dónde?">
        <Input value={f.destino} autoFocus placeholder="Metepec, Toluca, CDMX…"
          className="!py-2.5 !text-base"
          onChange={(e) => setF({ ...f, destino: e.target.value })} />
      </Campo>

      <div className="grid gap-4 sm:grid-cols-2">
        <Campo label="Precio del flete">
          <CampoMonto valor={f.precio} onCambio={alPrecio} />
        </Campo>
        <Campo label="Km que agrega"
          hint={`Se suman al viaje${ruta.km_total ? ` (hoy ${Number(ruta.km_total)} km)` : ''}.`}>
          <Input type="number" inputMode="decimal" placeholder="0" value={f.km}
            className="!py-2.5 !text-base"
            onChange={(e) => setF({ ...f, km: e.target.value })} />
        </Campo>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Campo label="Cliente">
          <Select value={f.cliente_id} onChange={(e) => setF({ ...f, cliente_id: e.target.value })}>
            <option value="">— Sin cliente —</option>
            {clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </Select>
        </Campo>
        <Campo label="Vendedor" hint="Define su comisión al cerrar.">
          <Select value={f.vendedor_id} onChange={(e) => setF({ ...f, vendedor_id: e.target.value })}>
            <option value="">— Sin vendedor —</option>
            {vendedores.map((v) => <option key={v.id} value={v.id}>{v.nombre}</option>)}
          </Select>
        </Campo>
      </div>

      <SelectorTamano valor={f.tamano_carga} onCambio={(t) => setF({ ...f, tamano_carga: t })} />

      {fase6 && (
        <ComoSePago precio={precio} valor={pago} onCambio={cambiarPago} sugeridos={gente} />
      )}

      <Aviso error={error} />

      <AccionesModal>
        <Boton variante="fantasma" onClick={onCerrar}>Cancelar</Boton>
        {!envio && (
          <Boton variante="suave" disabled={cargando || !f.destino.trim() || falta < 0}
            onClick={() => guardar(false)}>
            Guardar y agregar otra
          </Boton>
        )}
        <Boton disabled={cargando || !f.destino.trim() || falta < 0} onClick={() => guardar(true)}>
          {cargando ? 'Guardando…' : envio ? 'Guardar cambios' : 'Agregar misión'}
        </Boton>
      </AccionesModal>
    </div>
  );
}

/**
 * Corregir cómo se pagó una misión que ya existe.
 *
 * Reemplaza el desglose entero, no suma un abono: esto es "así se pagó", y
 * sumar haría que corregir dos veces cobrara dos veces la misma entrega.
 */
function ModalCobro({
  envio, cobros, fecha, gente, onCerrar, onGuardar, error, cargando,
}: {
  envio: Envio | null; cobros: Cobro[]; fecha: string;
  gente: { id: string; nombre: string }[];
  onCerrar: () => void;
  onGuardar: (envioId: string, d: Desglose) => void;
  error: string | null; cargando: boolean;
}) {
  if (!envio) return null;
  return (
    <Modal abierto onCerrar={onCerrar} titulo="Cómo se pagó" key={envio.id}
      descripcion={`${envio.destino} · ${mxn(Number(envio.precio))} · ${fechaCorta(fecha)}`}>
      <CuerpoCobro envio={envio} cobros={cobros} gente={gente}
        error={error} cargando={cargando} onCerrar={onCerrar} onGuardar={onGuardar} />
    </Modal>
  );
}

function CuerpoCobro({
  envio, cobros, gente, onCerrar, onGuardar, error, cargando,
}: {
  envio: Envio; cobros: Cobro[]; gente: { id: string; nombre: string }[];
  onCerrar: () => void; onGuardar: (envioId: string, d: Desglose) => void;
  error: string | null; cargando: boolean;
}) {
  const precio = Number(envio.precio);
  const [pago, setPago] = useState<Desglose>(() =>
    cobros.length > 0 ? desgloseDesdeCobros(cobros)
      : envio.a_credito ? desgloseVacio()
      : desgloseSimple('efectivo', precio));

  const falta = restante(pago, precio);

  return (
    <div className="space-y-4">
      <ComoSePago precio={precio} valor={pago} onCambio={setPago} sugeridos={gente} />

      {falta > 0 && (
        <p className="rounded-xl border border-warn/25 bg-warn/10 px-3 py-2 text-sm text-warn">
          Quedan {mxn(falta)} sin pagar. La misión pasa a cuentas por cobrar.
        </p>
      )}

      <Aviso error={error} />

      <AccionesModal>
        <Boton variante="fantasma" onClick={onCerrar}>Cancelar</Boton>
        <Boton disabled={cargando || falta < 0} onClick={() => onGuardar(envio.id, pago)}>
          {cargando ? 'Guardando…' : `Guardar · ${mxn(sumaDesglose(pago))}`}
        </Boton>
      </AccionesModal>
    </div>
  );
}

/**
 * Captura de gastos en varias líneas. Un viaje trae gasolina, casetas y comida
 * del mismo tirón: obligar a guardar uno por uno convierte tres datos en tres
 * viajes al servidor y tres esperas.
 */
function ModalGasto({
  abierto, onCerrar, ruta, gente, subcategorias, onGuardar, error, cargando,
}: {
  abierto: boolean; onCerrar: () => void; ruta: Ruta;
  gente: { id: string; nombre: string }[];
  subcategorias: SubcategoriaGasto[];
  onGuardar: (lineas: LineaGasto[], quien: Custodia, metodo: Metodo | null) => void;
  error: string | null; cargando: boolean;
}) {
  const [lineas, setLineas] = useState<LineaGasto[]>([nuevaLinea()]);
  // Un solo custodio y un solo método para todas las líneas: quien sale al
  // viaje paga la gasolina y las casetas del mismo dinero, no una cosa cada quien.
  const [quien, setQuien] = useState<Custodia>(SIN_CUSTODIA);
  const [metodo, setMetodo] = useState<Metodo | null>('efectivo');

  const agregar = (cat?: CategoriaGasto) => setLineas((ls) => [...ls, nuevaLinea(cat)]);
  const cambiar = (k: number, campos: Partial<LineaGasto>) =>
    setLineas((ls) => ls.map((l) => (l.k === k ? { ...l, ...campos } : l)));
  const quitar = (k: number) =>
    setLineas((ls) => (ls.length > 1 ? ls.filter((l) => l.k !== k) : [nuevaLinea()]));

  const conMonto = lineas.filter((l) => Number(l.monto) > 0);
  const total = conMonto.reduce((s, l) => s + Number(l.monto), 0);

  return (
    <Modal abierto={abierto} onCerrar={onCerrar} titulo="Registrar gastos" ancho="ancho"
      descripcion={`Se fechan el ${fechaCorta(ruta.fecha)}, igual que el viaje.`}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-ink-mute">Atajos:</span>
          {CATS.map((c) => <Chip key={c.v} onClick={() => agregar(c.v)}>+ {c.label}</Chip>)}
        </div>

        <div className="space-y-2">
          {lineas.map((l) => {
            const subs = subcategorias.filter((s) => s.categoria === l.categoria);
            return (
              <div key={l.k} className="flex flex-wrap items-center gap-2">
                <Select className="w-36" value={l.categoria}
                  onChange={(e) => cambiar(l.k, {
                    categoria: e.target.value as CategoriaGasto,
                    // La subcategoría cuelga de la categoría: al cambiarla, la
                    // que estaba elegida ya no pertenece a la lista nueva.
                    subcategoria_id: '',
                  })}>
                  {CATS.map((c) => <option key={c.v} value={c.v}>{c.label}</option>)}
                </Select>
                {subs.length > 0 && (
                  <Select className="w-40" value={l.subcategoria_id}
                    onChange={(e) => cambiar(l.k, { subcategoria_id: e.target.value })}>
                    <option value="">— Subcategoría —</option>
                    {subs.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                  </Select>
                )}
                <div className="relative w-32">
                  <span aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-ink-mute">$</span>
                  <Input className="cifra !pl-7" type="number" inputMode="decimal" placeholder="0" value={l.monto}
                    onChange={(e) => cambiar(l.k, { monto: e.target.value })}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); agregar(); } }} />
                </div>
                <Input className="min-w-[10rem] flex-1" placeholder="Descripción (opcional)" value={l.descripcion}
                  onChange={(e) => cambiar(l.k, { descripcion: e.target.value })}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); agregar(); } }} />
                <button onClick={() => quitar(l.k)} className="px-1 text-ink-mute transition hover:text-bad"
                  aria-label="Quitar línea">✕</button>
              </div>
            );
          })}
        </div>

        <button onClick={() => agregar()} className="text-sm text-brand transition hover:underline">
          + Otra línea
        </button>

        <div className="grid gap-3 sm:grid-cols-2">
          <SelectorMetodo valor={metodo} onCambio={setMetodo} />
          <QuienTuvo valor={quien} onCambio={setQuien} etiqueta="¿Quién lo paga?" sugeridos={gente} />
        </div>

        <p className="text-[11px] leading-tight text-ink-mute">
          Las fotos del ticket se agregan abriendo el gasto en la lista, ya que exista.
        </p>

        <Aviso error={error} />

        <AccionesModal>
          <Boton variante="fantasma" onClick={onCerrar}>Cancelar</Boton>
          <Boton disabled={cargando || conMonto.length === 0}
            onClick={() => { onGuardar(conMonto, quien, metodo); setLineas([nuevaLinea()]); }}>
            {cargando ? 'Guardando…'
              : conMonto.length > 1
                ? `Guardar ${conMonto.length} gastos · ${mxn(total)}`
                : `Guardar gasto${total ? ` · ${mxn(total)}` : ''}`}
          </Boton>
        </AccionesModal>
      </div>
    </Modal>
  );
}

function ModalTripulacion({
  abierto, onCerrar, choferes, ayudantes, yaEstan, onGuardar, error, cargando,
}: {
  abierto: boolean; onCerrar: () => void;
  choferes: Contacto[]; ayudantes: Contacto[]; yaEstan: Tripulante[];
  onGuardar: (contactoId: string, rol: 'chofer' | 'ayudante') => void;
  error: string | null; cargando: boolean;
}) {
  const [rol, setRol] = useState<'chofer' | 'ayudante'>('ayudante');
  const gente = rol === 'chofer' ? choferes : ayudantes;
  const puestos = new Set(yaEstan.map((t) => `${t.contacto_id}:${t.rol}`));

  return (
    <Modal abierto={abierto} onCerrar={onCerrar} titulo="Agregar a la tripulación"
      descripcion="Sus porcentajes se congelan al cerrar la ruta.">
      <div className="space-y-4">
        <div className="flex gap-2">
          <Chip activo={rol === 'chofer'} onClick={() => setRol('chofer')}>Chofer</Chip>
          <Chip activo={rol === 'ayudante'} onClick={() => setRol('ayudante')}>Ayudante</Chip>
        </div>

        {gente.length === 0 ? (
          <p className="py-6 text-sm text-ink-mute">
            No hay nadie con el rol de {rol}. Se dan de alta en Contactos.
          </p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {gente.map((c) => {
              const puesto = puestos.has(`${c.id}:${rol}`);
              return (
                <button key={c.id} type="button" disabled={cargando || puesto}
                  onClick={() => onGuardar(c.id, rol)}
                  className="flex items-center justify-between gap-2 rounded-xl border border-white/[0.07]
                    bg-white/[0.03] px-3.5 py-3 text-left text-sm transition
                    hover:border-brand hover:bg-brand/[0.06] disabled:opacity-40 disabled:hover:border-white/[0.07]">
                  <span className="truncate">{c.nombre}</span>
                  <span className="shrink-0 text-xs text-ink-mute">{puesto ? 'ya está' : 'agregar'}</span>
                </button>
              );
            })}
          </div>
        )}

        <Aviso error={error} />
      </div>
    </Modal>
  );
}
