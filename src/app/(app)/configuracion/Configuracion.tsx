'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/cliente';
import { Campo, Input, Boton, Aviso, useAccion, Etiqueta } from '@/components/ui';
import { desglosarFlete } from '@/lib/negocio';
import { mxn } from '@/lib/pricing';
import type { ConfigNegocio } from '@/types';

const CAMPOS_PCT: { k: keyof ConfigNegocio; label: string; hint?: string }[] = [
  { k: 'pct_renta_propia', label: '% Renta unidad propia' },
  { k: 'pct_renta_rentada', label: '% Renta unidad rentada' },
  { k: 'pct_venta', label: '% Comisión venta' },
  { k: 'pct_chofer', label: '% Comisión chofer' },
  { k: 'pct_ayudante', label: '% Comisión ayudante' },
  { k: 'pct_admon', label: '% Administración', hint: 'Es tu utilidad, no se paga a nadie.' },
];

export default function Configuracion({ inicial }: { inicial: ConfigNegocio }) {
  const router = useRouter();
  const { cargando, error, correr } = useAccion();
  const [c, setC] = useState<ConfigNegocio>(inicial);
  const [guardado, setGuardado] = useState(false);

  // Precio de prueba del simulador (como la Calculadora Flete).
  const [sim, setSim] = useState({ precio: 2500, km: 120, casetas: 150 });

  const set = (k: keyof ConfigNegocio, v: number) => {
    setC((prev) => ({ ...prev, [k]: v }));
    setGuardado(false);
  };

  // Con unidad propia como referencia del simulador.
  const desglose = useMemo(
    () =>
      desglosarFlete({
        precio: sim.precio,
        km: sim.km,
        casetas: sim.casetas,
        numAyudantes: 1,
        pctRenta: Number(c.pct_renta_propia),
        pctVenta: Number(c.pct_venta),
        pctChofer: Number(c.pct_chofer),
        pctAyudante: Number(c.pct_ayudante),
        pctAdmon: Number(c.pct_admon),
        rendimientoKml: Number(c.rendimiento_default_kml),
        precioLitro: Number(c.precio_litro),
      }),
    [c, sim]
  );

  const tono = desglose.salud === 'sano' ? 'bueno' : desglose.salud === 'apretado' ? 'aviso' : 'malo';
  const mensajeSalud =
    desglose.salud === 'sano' ? 'sano' :
    desglose.salud === 'apretado' ? 'zona apretada' : 'insostenible, algo tiene que bajar';

  async function guardar() {
    await correr(async () => {
      await api('/api/config', { method: 'POST', body: c });
      setGuardado(true);
      router.refresh();
    });
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Configuración del modelo de negocio</h1>
        <p className="mt-1 text-sm text-ink-mute">
          Estos porcentajes alimentan el cálculo de comisiones y el precio mínimo del cotizador.
          Guardar crea una nueva vigencia: no cambia la rentabilidad de rutas ya cerradas.
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        {/* ── Configuración ── */}
        <section className="tarjeta space-y-5">
          <h2 className="text-sm font-semibold">Porcentajes sobre el flete</h2>
          <div className="grid grid-cols-2 gap-4">
            {CAMPOS_PCT.map((f) => (
              <Campo key={f.k} label={f.label} hint={f.hint}>
                <Input
                  type="number" step="0.5" min="0"
                  value={String(c[f.k] ?? '')}
                  onChange={(e) => set(f.k, Number(e.target.value))}
                />
              </Campo>
            ))}
          </div>

          <h2 className="pt-2 text-sm font-semibold">Gasolina (valores por defecto)</h2>
          <div className="grid grid-cols-2 gap-4">
            <Campo label="Rendimiento (km/l)">
              <Input type="number" step="0.1" value={String(c.rendimiento_default_kml)}
                onChange={(e) => set('rendimiento_default_kml', Number(e.target.value))} />
            </Campo>
            <Campo label="Precio del litro">
              <Input type="number" step="0.5" value={String(c.precio_litro)}
                onChange={(e) => set('precio_litro', Number(e.target.value))} />
            </Campo>
          </div>

          <Campo label="Vigente desde" hint="A partir de qué fecha aplican estos valores.">
            <Input type="date" value={c.vigente_desde}
              onChange={(e) => { setC((p) => ({ ...p, vigente_desde: e.target.value })); setGuardado(false); }} />
          </Campo>

          <Aviso error={error} />
          <div className="flex items-center gap-3">
            <Boton onClick={guardar} disabled={cargando}>
              {cargando ? 'Guardando…' : 'Guardar vigencia'}
            </Boton>
            {guardado && <span className="text-sm text-good">Guardado ✓</span>}
          </div>
        </section>

        {/* ── Simulador ── */}
        <section className="tarjeta space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Simulador de un flete</h2>
            <Etiqueta tono={tono}>Suma {desglose.sumaPct.toFixed(0)}% — {mensajeSalud}</Etiqueta>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Campo label="Precio">
              <Input type="number" value={String(sim.precio)}
                onChange={(e) => setSim((s) => ({ ...s, precio: Number(e.target.value) }))} />
            </Campo>
            <Campo label="Km (ida y vuelta)">
              <Input type="number" value={String(sim.km)}
                onChange={(e) => setSim((s) => ({ ...s, km: Number(e.target.value) }))} />
            </Campo>
            <Campo label="Casetas">
              <Input type="number" value={String(sim.casetas)}
                onChange={(e) => setSim((s) => ({ ...s, casetas: Number(e.target.value) }))} />
            </Campo>
          </div>

          <div className="space-y-1.5 rounded-lg bg-surface-sunk p-4 text-sm">
            <Fila label="Ingreso" valor={desglose.precio} fuerte />
            <Fila label={`Renta (${c.pct_renta_propia}%)`} valor={-desglose.renta} />
            <Fila label={`Venta (${c.pct_venta}%)`} valor={-desglose.venta} />
            <Fila label={`Chofer (${c.pct_chofer}%)`} valor={-desglose.chofer} />
            <Fila label={`Ayudante (${c.pct_ayudante}%)`} valor={-desglose.ayudante} />
            <Fila label={`Administración (${c.pct_admon}%)`} valor={-desglose.admon} />
            <Fila label="Gasolina" valor={-desglose.gasolina} />
            <Fila label="Casetas" valor={-desglose.casetas} />
            <div className="my-2 border-t border-surface-line" />
            <Fila label="Utilidad del negocio" valor={desglose.utilidad} fuerte
              tono={desglose.utilidad < 0 ? 'malo' : 'bueno'} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-lg border border-surface-line p-3">
              <p className="etiqueta">Margen</p>
              <p className={`cifra mt-1 text-xl font-semibold ${desglose.utilidad < 0 ? 'text-bad' : desglose.margenPct < 15 ? 'text-warn' : 'text-good'}`}>
                {desglose.margenPct.toFixed(0)}%
              </p>
            </div>
            <div className="rounded-lg border border-surface-line p-3">
              <p className="etiqueta">Precio mínimo</p>
              <p className="cifra mt-1 text-xl font-semibold">
                {desglose.precioMinimo ? mxn(desglose.precioMinimo) : 'imposible'}
              </p>
              <p className="mt-0.5 text-xs text-ink-mute">para no perder dinero</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function Fila({ label, valor, fuerte, tono }: { label: string; valor: number; fuerte?: boolean; tono?: 'bueno' | 'malo' }) {
  const color = tono === 'malo' ? 'text-bad' : tono === 'bueno' ? 'text-good' : valor < 0 ? 'text-ink-soft' : 'text-ink';
  return (
    <div className="flex items-center justify-between">
      <span className={fuerte ? 'font-medium' : 'text-ink-mute'}>{label}</span>
      <span className={`cifra ${fuerte ? 'font-semibold' : ''} ${color}`}>
        {valor < 0 ? '− ' : ''}{mxn(Math.abs(valor))}
      </span>
    </div>
  );
}
