import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
for (const l of fs.readFileSync('.env.local','utf8').split('\n')) {
  const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2].trim();
}
const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth:{persistSession:false} });
const mx = (n:any) => '$' + Math.round(Number(n)).toLocaleString('es-MX');

const { data: mes } = await db.from('v_pnl_mensual').select('*');
console.log('── P&L MENSUAL ──');
console.log('mes         viajes   ingreso    utilidad   margen');
for (const m of (mes??[]).sort((a:any,b:any)=>a.mes<b.mes?-1:1))
  console.log(`${m.mes}  ${String(m.viajes).padStart(4)}  ${mx(m.ingreso).padStart(9)}  ${mx(m.utilidad_neta).padStart(9)}   ${m.margen_neto_pct ?? '—'}%`);

const { data: ch } = await db.from('v_rentabilidad_chofer').select('*');
console.log('\n── POR CHOFER ──');
for (const c of ch??[]) console.log(`${c.chofer.padEnd(8)} ${String(c.viajes).padStart(3)} viajes  ing ${mx(c.ingreso).padStart(9)}  util ${mx(c.utilidad).padStart(8)}  ${c.margen_pct}%  ticket ${mx(c.ticket_promedio)}`);

const { data: v } = await db.from('v_rentabilidad_vehiculo').select('*');
console.log('\n── POR UNIDAD ──');
for (const x of v??[]) console.log(`${x.vehiculo.padEnd(12)} ${String(x.viajes).padStart(3)} viajes  ing ${mx(x.ingreso).padStart(9)}  util ${mx(x.utilidad).padStart(8)}  ${x.margen_pct ?? '—'}%`);

const { data: z } = await db.from('v_rentabilidad_zona').select('*').order('ingreso',{ascending:false}).limit(8);
console.log('\n── TOP DESTINOS (por ingreso) ──');
for (const x of z??[]) console.log(`${(x.zona||'').padEnd(22)} ${String(x.envios).padStart(3)} envíos  ${mx(x.ingreso).padStart(9)}  prom ${mx(x.precio_promedio)}`);
