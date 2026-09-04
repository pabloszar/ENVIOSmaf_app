'use client';

import { useEffect, useRef, useState } from 'react';
import type { Adjunto } from '@/types';

/** A qué se le adjunta. Uno solo: un adjunto pertenece a una cosa. */
type Dueno = { gasto_id: string } | { envio_id: string } | { ruta_id: string };

const esImagen = (a: Adjunto) => (a.tipo_mime ?? '').startsWith('image/');

/**
 * La foto del ticket, la de la entrega, el PDF de la factura.
 *
 * Las imágenes se encogen antes de subirse. Una foto de celular pesa 4 MB y
 * llega con 4000 píxeles de ancho; para leer un ticket sobran 1600, y de 4 MB
 * a 200 KB la diferencia se siente al subir con datos móviles, que es
 * exactamente donde se va a usar esto: parado junto a la camioneta.
 */
async function encoger(archivo: File): Promise<File> {
  if (!archivo.type.startsWith('image/') || archivo.type === 'image/heic') return archivo;

  const bitmap = await createImageBitmap(archivo).catch(() => null);
  // Si el navegador no puede decodificarla, se sube tal cual: mejor pesada
  // que perdida.
  if (!bitmap) return archivo;

  const LADO = 1600;
  const escala = Math.min(1, LADO / Math.max(bitmap.width, bitmap.height));
  if (escala === 1 && archivo.size < 600_000) return archivo;

  const lienzo = document.createElement('canvas');
  lienzo.width = Math.round(bitmap.width * escala);
  lienzo.height = Math.round(bitmap.height * escala);
  lienzo.getContext('2d')?.drawImage(bitmap, 0, 0, lienzo.width, lienzo.height);

  const blob = await new Promise<Blob | null>((res) =>
    lienzo.toBlob(res, 'image/jpeg', 0.82));
  if (!blob || blob.size >= archivo.size) return archivo;

  const base = archivo.name.replace(/\.[^.]+$/, '');
  return new File([blob], `${base}.jpg`, { type: 'image/jpeg' });
}

export default function Evidencias({
  dueno, titulo = 'Evidencias', compacto, onCambio,
}: {
  dueno: Dueno;
  titulo?: string;
  /** Sin encabezado ni texto de ayuda: para meterlo dentro de una lista. */
  compacto?: boolean;
  onCambio?: () => void;
}) {
  const [lista, setLista] = useState<Adjunto[] | null>(null);
  const [subiendo, setSubiendo] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const foto = useRef<HTMLInputElement>(null);
  const archivo = useRef<HTMLInputElement>(null);

  const consulta = new URLSearchParams(dueno as Record<string, string>).toString();

  useEffect(() => {
    let vivo = true;
    fetch(`/api/adjuntos?${consulta}`)
      .then((r) => r.json())
      .then((j) => { if (vivo) setLista(j.data ?? []); })
      .catch(() => { if (vivo) setLista([]); });
    return () => { vivo = false; };
  }, [consulta]);

  async function subir(archivos: FileList | null) {
    if (!archivos || archivos.length === 0) return;
    setError(null);
    setSubiendo(archivos.length);

    try {
      for (const bruto of Array.from(archivos)) {
        const f = await encoger(bruto);
        const cuerpo = new FormData();
        cuerpo.append('archivo', f);
        for (const [k, v] of Object.entries(dueno)) cuerpo.append(k, v);

        const res = await fetch('/api/adjuntos', { method: 'POST', body: cuerpo });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || json.error) throw new Error(json.error ?? `Error ${res.status}`);
        setLista((xs) => [json.data as Adjunto, ...(xs ?? [])]);
      }
      onCambio?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo subir.');
    } finally {
      setSubiendo(0);
      // Se limpia el input para que volver a elegir el MISMO archivo dispare
      // el evento otra vez; si no, un reintento tras un error no haría nada.
      if (foto.current) foto.current.value = '';
      if (archivo.current) archivo.current.value = '';
    }
  }

  async function borrar(id: string) {
    if (!confirm('¿Quitar esta evidencia?')) return;
    setLista((xs) => (xs ?? []).filter((a) => a.id !== id));
    await fetch('/api/adjuntos', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    onCambio?.();
  }

  async function comentar(id: string, comentario: string) {
    setLista((xs) => (xs ?? []).map((a) => (a.id === id ? { ...a, comentario } : a)));
    await fetch('/api/adjuntos', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, comentario }),
    });
  }

  const hay = (lista?.length ?? 0) > 0;

  return (
    <div className={compacto ? '' : 'rounded-xl border border-white/[0.07] bg-white/[0.02] px-3.5 py-3'}>
      <input ref={foto} type="file" accept="image/*" capture="environment" multiple hidden
        onChange={(e) => subir(e.target.files)} />
      <input ref={archivo} type="file" accept="image/*,application/pdf" multiple hidden
        onChange={(e) => subir(e.target.files)} />

      <div className="flex flex-wrap items-center justify-between gap-2">
        {!compacto && <span className="etiqueta">{titulo}</span>}
        <div className="flex gap-1.5">
          <BotonAdjuntar onClick={() => foto.current?.click()} disabled={subiendo > 0}>
            📷 Foto
          </BotonAdjuntar>
          <BotonAdjuntar onClick={() => archivo.current?.click()} disabled={subiendo > 0}>
            📎 Archivo
          </BotonAdjuntar>
        </div>
      </div>

      {subiendo > 0 && (
        <p className="mt-2 text-xs text-ink-mute">
          Subiendo {subiendo === 1 ? 'la evidencia' : `${subiendo} evidencias`}…
        </p>
      )}
      {error && <p className="mt-2 text-xs text-bad">{error}</p>}

      {hay && (
        <ul className="mt-2.5 space-y-2">
          {lista!.map((a) => (
            <li key={a.id} className="flex items-start gap-2.5">
              <a href={`/api/adjuntos/${a.id}/archivo`} target="_blank" rel="noreferrer"
                title={a.nombre}
                className="shrink-0 overflow-hidden rounded-lg border border-white/[0.07] bg-surface-sunk">
                {esImagen(a) ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={`/api/adjuntos/${a.id}/archivo`} alt={a.comentario ?? a.nombre}
                    className="h-14 w-14 object-cover" />
                ) : (
                  <span className="flex h-14 w-14 items-center justify-center text-lg">📄</span>
                )}
              </a>
              <div className="min-w-0 flex-1">
                <input defaultValue={a.comentario ?? ''} placeholder="Comentario…"
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v !== (a.comentario ?? '')) comentar(a.id, v);
                  }}
                  className="w-full rounded-lg border border-transparent bg-transparent px-1.5 py-1
                    text-sm text-ink outline-none transition placeholder:text-ink-mute
                    hover:border-white/[0.07] focus:border-brand focus:bg-surface-raised" />
                <p className="mt-0.5 px-1.5 text-[11px] text-ink-mute">
                  <a href={`/api/adjuntos/${a.id}/archivo?descargar=1`}
                    className="transition hover:text-ink hover:underline">Descargar</a>
                  {a.bytes ? ` · ${(a.bytes / 1024).toFixed(0)} KB` : ''}
                </p>
              </div>
              <button onClick={() => borrar(a.id)} aria-label="Quitar evidencia"
                className="shrink-0 rounded-full px-1.5 text-ink-mute/50 transition hover:text-bad">✕</button>
            </li>
          ))}
        </ul>
      )}

      {!compacto && !hay && subiendo === 0 && (
        <p className="mt-2 text-[11px] leading-tight text-ink-mute">
          La foto del ticket o de la entrega. Las imágenes se encogen solas antes de subirse.
        </p>
      )}
    </div>
  );
}

function BotonAdjuntar({ onClick, disabled, children }: {
  onClick: () => void; disabled?: boolean; children: React.ReactNode;
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className="rounded-full border border-surface-line bg-surface-raised px-2.5 py-1 text-xs
        font-medium text-ink-soft transition hover:border-ink-mute hover:text-ink
        disabled:opacity-40">
      {children}
    </button>
  );
}

/** Cuántas evidencias trae algo, para poder mostrarlo en una lista. */
export function ContadorEvidencias({ n }: { n: number }) {
  if (!n) return null;
  return (
    <span title={`${n} ${n === 1 ? 'evidencia' : 'evidencias'}`}
      className="shrink-0 rounded-full bg-white/[0.06] px-1.5 py-0.5 text-[11px] text-ink-mute">
      📎 {n}
    </span>
  );
}
