import { db, dbConfigurada } from '@/lib/db';
import { Indicador, Dinero, Porcentaje, tonoMargen } from '@/components/Cifras';
import { mxn } from '@/lib/pricing';

export const dynamic = 'force-dynamic';

interface FilaMes {
  mes: string;
  viajes: number;
  ingreso: number;
  utilidad_operativa: number;
  gastos_fijos: number;
  utilidad_neta: number;
  inversion: number;
  retiros: number;
  margen_neto_pct: number | null;
}

interface FilaChofer {
  contacto_id: string;
  chofer: string;
  viajes: number;
  ingreso: number;
  utilidad: number;
  margen_pct: number | null;
  ticket_promedio: number;
}

interface FilaVehiculo {
  vehiculo_id: string;
  vehiculo: string;
  propiedad: string;
  viajes: number;
  ingreso: number;
  utilidad: number;
  margen_pct: number | null;
  km_recorridos: number | null;
  gastos_fijos_unidad: number;
}

export default async function Rentabilidad() {
  if (!dbConfigurada()) return <SinConfigurar />;

  const sb = db();
  const [meses, choferes, vehiculos] = await Promise.all([
    sb.from('v_pnl_mensual').select('*').limit(24),
    sb.from('v_rentabilidad_chofer').select('*').order('utilidad', { ascending: false }),
    sb.from('v_rentabilidad_vehiculo').select('*').order('utilidad', { ascending: false }),
  ]);

  const error = meses.error ?? choferes.error ?? vehiculos.error;
  if (error) return <ErrorBase mensaje={error.message} />;

  const filasMes = (meses.data ?? []) as FilaMes[];
  if (filasMes.length === 0) return <SinDatos />;

  const total = filasMes.reduce(
    (a, m) => ({
      ingreso: a.ingreso + Number(m.ingreso),
      utilidadOp: a.utilidadOp + Number(m.utilidad_operativa),
      gastosFijos: a.gastosFijos + Number(m.gastos_fijos),
      viajes: a.viajes + Number(m.viajes),
      inversion: a.inversion + Number(m.inversion),
      retiros: a.retiros + Number(m.retiros),
    }),
    { ingreso: 0, utilidadOp: 0, gastosFijos: 0, viajes: 0, inversion: 0, retiros: 0 }
  );

  const utilidadNeta = total.utilidadOp - total.gastosFijos;
  const margenNeto = total.ingreso > 0 ? (utilidadNeta / total.ingreso) * 100 : null;
  const ticket = total.viajes > 0 ? total.ingreso / total.viajes : 0;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Rentabilidad</h1>
        <p className="mt-1 text-sm text-ink-mute">
          Histórico completo · {total.viajes} viajes
        </p>
      </div>

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Indicador etiqueta="Ingreso" valor={mxn(total.ingreso)} detalle={`${total.viajes} viajes`} />
        <Indicador
          etiqueta="Utilidad neta"
          valor={mxn(utilidadNeta)}
          detalle={`después de $${Math.round(total.gastosFijos).toLocaleString('es-MX')} de gastos fijos`}
          tono={tonoMargen(margenNeto)}
        />
        <Indicador
          etiqueta="Margen neto"
          valor={margenNeto != null ? `${margenNeto.toFixed(1)}%` : '—'}
          tono={tonoMargen(margenNeto)}
        />
        <Indicador
          etiqueta="Ticket promedio"
          valor={mxn(ticket)}
          detalle="ingreso por viaje"
        />
      </section>

      <Tabla
        titulo="Por mes"
        cabeceras={['Mes', 'Viajes', 'Ingreso', 'Utilidad op.', 'Gastos fijos', 'Utilidad neta', 'Margen']}
      >
        {filasMes.map((m) => (
          <tr key={m.mes} className="border-t border-surface-line">
            <td className="py-2 pr-4 font-medium">{nombreMes(m.mes)}</td>
            <td className="py-2 pr-4 text-right cifra">{m.viajes}</td>
            <td className="py-2 pr-4 text-right"><Dinero n={Number(m.ingreso)} /></td>
            <td className="py-2 pr-4 text-right"><Dinero n={Number(m.utilidad_operativa)} /></td>
            <td className="py-2 pr-4 text-right"><Dinero n={Number(m.gastos_fijos)} /></td>
            <td className="py-2 pr-4 text-right"><Dinero n={Number(m.utilidad_neta)} /></td>
            <td className="py-2 text-right"><Porcentaje n={m.margen_neto_pct != null ? Number(m.margen_neto_pct) : null} /></td>
          </tr>
        ))}
      </Tabla>

      <div className="grid gap-8 lg:grid-cols-2">
        <Tabla titulo="Por chofer" cabeceras={['Chofer', 'Viajes', 'Ingreso', 'Utilidad', 'Margen']}>
          {(choferes.data as FilaChofer[] ?? []).map((c) => (
            <tr key={c.contacto_id} className="border-t border-surface-line">
              <td className="py-2 pr-4 font-medium">{c.chofer}</td>
              <td className="py-2 pr-4 text-right cifra">{c.viajes}</td>
              <td className="py-2 pr-4 text-right"><Dinero n={Number(c.ingreso)} /></td>
              <td className="py-2 pr-4 text-right"><Dinero n={Number(c.utilidad)} /></td>
              <td className="py-2 text-right"><Porcentaje n={c.margen_pct != null ? Number(c.margen_pct) : null} /></td>
            </tr>
          ))}
        </Tabla>

        <Tabla titulo="Por unidad" cabeceras={['Unidad', 'Viajes', 'Ingreso', 'Utilidad', 'Margen']}>
          {(vehiculos.data as FilaVehiculo[] ?? []).map((v) => (
            <tr key={v.vehiculo_id} className="border-t border-surface-line">
              <td className="py-2 pr-4">
                <span className="font-medium">{v.vehiculo}</span>
                <span className="ml-2 text-xs text-ink-mute">{v.propiedad}</span>
              </td>
              <td className="py-2 pr-4 text-right cifra">{v.viajes}</td>
              <td className="py-2 pr-4 text-right"><Dinero n={Number(v.ingreso)} /></td>
              <td className="py-2 pr-4 text-right"><Dinero n={Number(v.utilidad)} /></td>
              <td className="py-2 text-right"><Porcentaje n={v.margen_pct != null ? Number(v.margen_pct) : null} /></td>
            </tr>
          ))}
        </Tabla>
      </div>
    </div>
  );
}

function Tabla({
  titulo,
  cabeceras,
  children,
}: {
  titulo: string;
  cabeceras: string[];
  children: React.ReactNode;
}) {
  return (
    <section className="tarjeta overflow-hidden p-0">
      <h2 className="border-b border-surface-line px-5 py-3 text-sm font-semibold">{titulo}</h2>
      <div className="overflow-x-auto px-5 pb-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-wide text-ink-mute">
              {cabeceras.map((c, i) => (
                <th key={c} className={`py-3 ${i === 0 ? 'pr-4 text-left' : 'pr-4 text-right'}`}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      </div>
    </section>
  );
}

function nombreMes(iso: string): string {
  const [a, m] = iso.split('-');
  const nombres = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
                   'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  return `${nombres[Number(m) - 1]} ${a}`;
}

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
        <code className="font-mono text-xs">supabase/schema.sql</code>.
      </p>
    </div>
  );
}
