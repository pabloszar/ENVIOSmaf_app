'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/cliente';
import { Input, Select, Boton, BotonMini, Aviso, Chip, useAccion } from '@/components/ui';
import type { CategoriaGasto, SubcategoriaGasto } from '@/types';

/**
 * Las subcategorías de gasto, editables desde aquí.
 *
 * La categoría es un enum de la base y no se toca: `v_ruta_pnl` separa la
 * rentabilidad por ella, así que agregarle valores sería mover el cálculo del
 * negocio para resolver un problema de archivo. La subcategoría es una tabla
 * normal, y por eso una limpieza o una mejora de servicio nuevas se dan de
 * alta aquí, en el momento, sin migrar nada ni pedírselo a nadie.
 *
 * No se borran, se apagan: un gasto de hace tres meses que decía "Llantas"
 * tiene que seguir diciéndolo aunque hoy esa subcategoría ya no se use.
 */
const CATEGORIAS: { v: CategoriaGasto; label: string }[] = [
  { v: 'mantenimiento', label: 'Mantenimiento' },
  { v: 'administrativo', label: 'Administrativo' },
  { v: 'seguro', label: 'Seguro' },
  { v: 'tenencia', label: 'Tenencia' },
  { v: 'sueldo', label: 'Sueldo base' },
  { v: 'gasolina', label: 'Gasolina' },
  { v: 'caseta', label: 'Caseta' },
  { v: 'comida', label: 'Comida' },
  { v: 'otro', label: 'Otro' },
];

export default function Subcategorias({
  subcategorias, disponible,
}: {
  subcategorias: SubcategoriaGasto[];
  disponible: boolean;
}) {
  const router = useRouter();
  const { cargando, error, correr } = useAccion();
  const [categoria, setCategoria] = useState<CategoriaGasto>('mantenimiento');
  const [nombre, setNombre] = useState('');
  const [verApagadas, setVerApagadas] = useState(false);

  async function accion(fn: () => Promise<void>) {
    await correr(async () => { await fn(); router.refresh(); });
  }

  if (!disponible) {
    return (
      <section className="tarjeta">
        <h2 className="text-sm font-semibold">Subcategorías de gasto</h2>
        <p className="mt-2 text-sm text-warn">
          Falta correr <code>supabase/fase6.sql</code> para poder clasificar los gastos.
        </p>
      </section>
    );
  }

  const deEsta = subcategorias
    .filter((s) => s.categoria === categoria)
    .filter((s) => verApagadas || s.activa);
  const apagadas = subcategorias.filter((s) => s.categoria === categoria && !s.activa).length;

  return (
    <section className="tarjeta space-y-4">
      <div>
        <h2 className="text-sm font-semibold">Subcategorías de gasto</h2>
        <p className="mt-1 text-xs text-ink-mute">
          Para saber en qué se está yendo el dinero. &ldquo;Mantenimiento $4,200&rdquo; no dice nada;
          &ldquo;llantas $2,800 · limpieza $600 · afinación $800&rdquo; sí.
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {CATEGORIAS.map((c) => {
          const n = subcategorias.filter((s) => s.categoria === c.v && s.activa).length;
          return (
            <Chip key={c.v} activo={categoria === c.v} onClick={() => setCategoria(c.v)}>
              {c.label}{n > 0 ? ` (${n})` : ''}
            </Chip>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-2">
        <Input className="min-w-[12rem] flex-1" placeholder="Nueva subcategoría…"
          value={nombre} onChange={(e) => setNombre(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter' || !nombre.trim() || cargando) return;
            e.preventDefault();
            accion(async () => {
              await api('/api/subcategorias', { method: 'POST', body: { categoria, nombre } });
              setNombre('');
            });
          }} />
        <Boton disabled={cargando || !nombre.trim()}
          onClick={() => accion(async () => {
            await api('/api/subcategorias', { method: 'POST', body: { categoria, nombre } });
            setNombre('');
          })}>
          {cargando ? 'Guardando…' : 'Agregar'}
        </Boton>
      </div>

      <Aviso error={error} />

      {deEsta.length === 0 ? (
        <p className="py-4 text-sm text-ink-mute">
          Todavía no hay subcategorías en {CATEGORIAS.find((c) => c.v === categoria)?.label}.
        </p>
      ) : (
        <ul className="divide-y divide-surface-line">
          {deEsta.map((s) => (
            <li key={s.id} className="flex items-center gap-3 py-2">
              {/* Se guarda al salir del campo: renombrar es cambiar una palabra,
                  y un botón de guardar por renglón sería más ruido que ayuda. */}
              <Input className={`min-w-0 flex-1 ${s.activa ? '' : 'opacity-50'}`}
                defaultValue={s.nombre}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (!v || v === s.nombre) { e.target.value = s.nombre; return; }
                  accion(async () => {
                    await api('/api/subcategorias', { method: 'PATCH', body: { id: s.id, nombre: v } });
                  });
                }} />
              <BotonMini onClick={() => accion(async () => {
                await api('/api/subcategorias', { method: 'PATCH', body: { id: s.id, activa: !s.activa } });
              })}>
                {s.activa ? 'Quitar' : 'Reactivar'}
              </BotonMini>
            </li>
          ))}
        </ul>
      )}

      {apagadas > 0 && (
        <button onClick={() => setVerApagadas((v) => !v)}
          className="text-xs text-brand transition hover:underline">
          {verApagadas ? 'Ocultar' : `Ver ${apagadas} quitada${apagadas === 1 ? '' : 's'}`}
        </button>
      )}

      <p className="text-[11px] leading-tight text-ink-mute">
        Quitar una no borra nada: los gastos que ya la usaban la siguen mostrando,
        solo deja de ofrecerse al capturar.
      </p>
    </section>
  );
}
