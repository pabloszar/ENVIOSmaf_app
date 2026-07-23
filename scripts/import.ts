/**
 * Importa el histórico del Excel a Supabase.
 *
 *   python3 scripts/parse_excel.py "../Envíos MAF Registro.xlsx" scripts/data/historico.json
 *   npm run import:historico
 *
 * Es idempotente: identifica los envíos ya importados por su fila del Excel
 * (guardada en notas) y no los duplica.
 *
 * ── Decisión importante sobre el histórico ──────────────────────────────────
 * En el periodo del Excel NO se aplicaba el modelo de porcentajes: al ayudante
 * se le pagaba un monto fijo por viaje y el chofer no cobraba comisión. Por eso
 * cada ruta histórica se importa con un `config_snapshot` de porcentajes en
 * cero, de modo que su utilidad sea exactamente `ingreso − gastos reales`, que
 * es lo que de verdad pasó y lo que dice el Excel.
 *
 * Aplicarles los porcentajes de hoy haría que la utilidad histórica pareciera
 * mucho menor de lo que fue, y arruinaría cualquier comparación de tendencia.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

// ── Entorno ─────────────────────────────────────────────────────────────────

function cargarEnv() {
  try {
    const txt = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
    for (const linea of txt.split('\n')) {
      const m = linea.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
    }
  } catch {
    /* sin .env.local, se usan las variables del sistema */
  }
}
cargarEnv();

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Faltan SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en .env.local');
  process.exit(1);
}
const sb = createClient(url, key, { auth: { persistSession: false } });

// ── Datos de entrada ────────────────────────────────────────────────────────

interface Registro {
  fila_excel: number;
  orden_venta: string | null;
  num_ruta: number | null;
  fecha: string | null;
  fecha_confiable: boolean;
  cliente: string | null;
  celular: string | null;
  calificacion: number | null;
  destino: string | null;
  num_pisos: number | null;
  num_articulos: number | null;
  tamano_carga: string | null;
  distancia_km: number | null;
  unidad: string | null;
  chofer: string | null;
  ingreso: number | null;
  gasolina: number | null;
  num_chalanes: number | null;
  pago_chalan: number | null;
  caseta: number | null;
  comida: number | null;
  gasto_total_excel: number | null;
  utilidad_excel: number | null;
  uso_cotizador: boolean;
  precio_sugerido: number | null;
}

const datos = JSON.parse(
  readFileSync(resolve(process.cwd(), 'scripts/data/historico.json'), 'utf8')
) as { registros: Registro[] };

// El Excel escribe los tamaños en femenino.
const TAMANOS: Record<string, string> = {
  Chica: 'Chico', Chico: 'Chico',
  Mediana: 'Mediano', Mediano: 'Mediano',
  Grande: 'Grande',
  'Extra Grande': 'Extra Grande',
};

const SNAPSHOT_HISTORICO = {
  historico: true,
  nota: 'Periodo previo al modelo de porcentajes: la utilidad es ingreso menos gastos reales.',
  pct_venta: 0, pct_chofer: 0, pct_ayudante: 0, pct_admon: 0,
  pct_renta_propia: 0, pct_renta_rentada: 0,
};

// ── Helpers ─────────────────────────────────────────────────────────────────

const MARCA = (fila: number) => `[excel:fila-${fila}]`;

async function obtenerOCrearContacto(nombre: string, rol: string, extra: Record<string, unknown> = {}) {
  const { data: existente } = await sb
    .from('contactos').select('id, roles').eq('nombre', nombre).maybeSingle();

  if (existente) {
    if (!existente.roles?.includes(rol)) {
      await sb.from('contactos')
        .update({ roles: [...(existente.roles ?? []), rol] })
        .eq('id', existente.id);
    }
    return existente.id as string;
  }

  const { data, error } = await sb
    .from('contactos').insert({ nombre, roles: [rol], ...extra }).select('id').single();
  if (error) throw new Error(`contacto "${nombre}": ${error.message}`);
  return data.id as string;
}

async function obtenerOCrearVehiculo(nombre: string) {
  const { data: existente } = await sb
    .from('vehiculos').select('id').eq('nombre', nombre).maybeSingle();
  if (existente) return existente.id as string;

  const { data, error } = await sb
    .from('vehiculos')
    .insert({ nombre, propiedad: 'propia', tipo: 'Pickup', rendimiento_kml: 8 })
    .select('id').single();
  if (error) throw new Error(`vehículo "${nombre}": ${error.message}`);
  return data.id as string;
}

// ── Importación ─────────────────────────────────────────────────────────────

async function main() {
  const registros = datos.registros.filter((r) => r.destino || r.ingreso);
  console.log(`Registros a procesar: ${registros.length}`);

  // Qué filas del Excel ya están en la base.
  const { data: yaImportados } = await sb.from('envios').select('notas');
  const importadas = new Set(
    (yaImportados ?? [])
      .map((e) => e.notas?.match(/\[excel:fila-(\d+)\]/)?.[1])
      .filter(Boolean)
  );
  if (importadas.size) console.log(`Ya importadas anteriormente: ${importadas.size} filas`);

  // Un viaje es la combinación de número de ruta + fecha. El número de ruta
  // solo no basta: en el Excel el 38 aparece en dos fechas distintas, así que
  // son dos viajes, no uno con dos paradas.
  const grupos = new Map<string, Registro[]>();
  for (const r of registros) {
    if (importadas.has(String(r.fila_excel))) continue;
    const clave = r.num_ruta != null ? `${r.num_ruta}|${r.fecha}` : `solo|${r.fila_excel}`;
    if (!grupos.has(clave)) grupos.set(clave, []);
    grupos.get(clave)!.push(r);
  }

  console.log(`Viajes a crear: ${grupos.size}`);

  const cacheContactos = new Map<string, string>();
  const cacheVehiculos = new Map<string, string>();
  let rutasCreadas = 0, enviosCreados = 0, gastosCreados = 0;

  for (const [clave, filas] of grupos) {
    const primera = filas[0];
    const fecha = primera.fecha ?? '2026-01-01';

    let vehiculoId: string | null = null;
    if (primera.unidad) {
      if (!cacheVehiculos.has(primera.unidad)) {
        cacheVehiculos.set(primera.unidad, await obtenerOCrearVehiculo(primera.unidad));
      }
      vehiculoId = cacheVehiculos.get(primera.unidad)!;
    }

    const aproximada = filas.some((f) => !f.fecha_confiable);
    const notasRuta = [
      `Importado del Excel (${clave})`,
      aproximada ? 'Fecha aproximada: el Excel no traía día.' : null,
    ].filter(Boolean).join(' ');

    const { data: ruta, error: errRuta } = await sb
      .from('rutas')
      .insert({
        fecha,
        estado: 'entregada',
        vehiculo_id: vehiculoId,
        km_total: filas.reduce((s, f) => s + (f.distancia_km ?? 0), 0) || null,
        config_snapshot: SNAPSHOT_HISTORICO,
        cerrada_en: new Date().toISOString(),
        notas: notasRuta,
      })
      .select('id').single();
    if (errRuta) throw new Error(`ruta ${clave}: ${errRuta.message}`);
    rutasCreadas++;

    // Chofer
    if (primera.chofer) {
      if (!cacheContactos.has(primera.chofer)) {
        cacheContactos.set(primera.chofer, await obtenerOCrearContacto(primera.chofer, 'chofer'));
      }
      await sb.from('ruta_tripulacion').insert({
        ruta_id: ruta.id,
        contacto_id: cacheContactos.get(primera.chofer)!,
        rol: 'chofer',
        pct_aplicado: 0, // en el histórico el chofer no cobraba porcentaje
      });
    }

    // Envíos
    for (const [i, f] of filas.entries()) {
      let clienteId: string | null = null;
      if (f.cliente) {
        const llave = `cliente:${f.cliente}`;
        if (!cacheContactos.has(llave)) {
          cacheContactos.set(
            llave,
            await obtenerOCrearContacto(f.cliente, 'cliente_b2c', { telefono: f.celular })
          );
        }
        clienteId = cacheContactos.get(llave)!;
      }

      const { error } = await sb.from('envios').insert({
        ruta_id: ruta.id,
        secuencia: i + 1,
        cliente_id: clienteId,
        orden_venta: f.orden_venta,
        destino: f.destino ?? 'Sin destino',
        distancia_km: f.distancia_km,
        tamano_carga: f.tamano_carga ? TAMANOS[f.tamano_carga] ?? null : null,
        num_articulos: f.num_articulos,
        num_pisos: f.num_pisos,
        precio: f.ingreso ?? 0,
        precio_sugerido_cotizador: f.precio_sugerido,
        uso_cotizador: f.uso_cotizador,
        calificacion: f.calificacion,
        notas: MARCA(f.fila_excel),
      });
      if (error) throw new Error(`envío fila ${f.fila_excel}: ${error.message}`);
      enviosCreados++;
    }

    // Gastos del viaje
    const gastos: Record<string, unknown>[] = [];
    const agregar = (categoria: string, monto: number | null, descripcion?: string) => {
      if (!monto) return;
      gastos.push({
        fecha, categoria, tipo: 'operativo', monto,
        ruta_id: ruta.id, vehiculo_id: vehiculoId, descripcion,
      });
    };

    let desglosado = 0;
    for (const f of filas) {
      agregar('gasolina', f.gasolina);
      agregar('caseta', f.caseta);
      agregar('comida', f.comida);
      agregar(
        'comision',
        f.pago_chalan,
        `Pago a ayudante (${f.num_chalanes ?? 1}), monto fijo del histórico`
      );
      desglosado += (f.gasolina ?? 0) + (f.caseta ?? 0) + (f.comida ?? 0) + (f.pago_chalan ?? 0);
    }

    // En 18 filas el Excel tiene un gasto total sin desglosar. Se registra la
    // diferencia para que el total del periodo cuadre con el Excel.
    const totalExcel = filas.reduce((s, f) => s + (f.gasto_total_excel ?? 0), 0);
    const diferencia = Math.round((totalExcel - desglosado) * 100) / 100;
    if (diferencia > 0.5) {
      agregar('otro', diferencia, 'Gasto sin desglosar en el Excel');
    }

    if (gastos.length) {
      const { error } = await sb.from('gastos').insert(gastos);
      if (error) throw new Error(`gastos de ${clave}: ${error.message}`);
      gastosCreados += gastos.length;
    }
  }

  console.log(`\n✓ Rutas creadas   : ${rutasCreadas}`);
  console.log(`✓ Envíos creados  : ${enviosCreados}`);
  console.log(`✓ Gastos creados  : ${gastosCreados}`);

  // Verificación contra el Excel
  const { data: pnl } = await sb.from('v_pnl_mensual').select('*');
  const ingresoBase = (pnl ?? []).reduce((s, m) => s + Number(m.ingreso), 0);
  const ingresoExcel = registros.reduce((s, r) => s + (r.ingreso ?? 0), 0);
  const gastoExcel = registros.reduce((s, r) => s + (r.gasto_total_excel ?? 0), 0);
  const utilidadBase = (pnl ?? []).reduce((s, m) => s + Number(m.utilidad_operativa), 0);

  console.log('\n── Verificación contra el Excel ──');
  console.log(`Ingreso  Excel $${ingresoExcel.toLocaleString('es-MX')}  |  Base $${ingresoBase.toLocaleString('es-MX')}`);
  console.log(`Utilidad Excel $${(ingresoExcel - gastoExcel).toLocaleString('es-MX')}  |  Base $${utilidadBase.toLocaleString('es-MX')}`);
}

main().catch((e) => {
  console.error('\n✗ Falló la importación:', e.message);
  process.exit(1);
});
