'use client';

import { useState } from 'react';
import { Boton, Aviso, Etiqueta, Modal, AccionesModal } from '@/components/ui';
import ComoSePago from '@/components/ComoSePago';
import { mxn } from '@/lib/pricing';
import { fechaCorta } from '@/lib/fechas';
import {
  type Desglose, desgloseSimple, desgloseVacio, desgloseDesdeCobros, restante,
} from '@/lib/cobro';
import type { MovCobro } from './tipos';

/**
 * Aterrizar cómo se pagó un envío.
 *
 * Vive aquí y no dentro de una pantalla porque son dos las que lo abren: la
 * lista de envíos, cuando se revisa la cobranza, y el libro de movimientos,
 * cuando se está cuadrando contra el banco y aparece el renglón que no
 * coincide. Es la misma corrección desde dos caminos, y tener dos formularios
 * en paralelo acabaría con uno de los dos escribiendo distinto que el otro.
 *
 * Reemplaza el desglose entero en vez de sumar un abono: esto es "así se
 * pagó". Sumar cobraría dos veces la misma entrega en cuanto se corrigiera dos
 * veces.
 */
export interface ObjetoCobro {
  envioId: string;
  destino: string;
  fecha: string;
  precio: number;
  aCredito: boolean;
  dias?: number | null;
  vencido?: boolean;
}

export default function ModalComoSePago({
  objeto, cobros, contactos, onCerrar, onGuardar, error, cargando,
}: {
  objeto: ObjetoCobro | null;
  cobros: MovCobro[];
  contactos: { id: string; nombre: string }[];
  onCerrar: () => void;
  onGuardar: (envioId: string, d: Desglose) => void;
  error: string | null;
  cargando: boolean;
}) {
  if (!objeto) return null;
  return (
    <Modal abierto onCerrar={onCerrar} titulo="Cómo se pagó"
      descripcion={`${objeto.destino} · ${fechaCorta(objeto.fecha)}`}>
      {/* La `key` reconstruye el formulario al cambiar de envío: sin ella,
          abrir uno y luego otro mostraría el desglose del primero. */}
      <Cuerpo key={objeto.envioId} objeto={objeto} cobros={cobros} contactos={contactos}
        error={error} cargando={cargando} onCerrar={onCerrar} onGuardar={onGuardar} />
    </Modal>
  );
}

function Cuerpo({
  objeto, cobros, contactos, onCerrar, onGuardar, error, cargando,
}: {
  objeto: ObjetoCobro; cobros: MovCobro[]; contactos: { id: string; nombre: string }[];
  onCerrar: () => void; onGuardar: (envioId: string, d: Desglose) => void;
  error: string | null; cargando: boolean;
}) {
  const precio = Number(objeto.precio);
  const [pago, setPago] = useState<Desglose>(() =>
    cobros.length > 0 ? desgloseDesdeCobros(cobros)
      : objeto.aCredito ? desgloseVacio()
      : desgloseSimple('efectivo', precio));

  const falta = restante(pago, precio);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-surface-line bg-surface-raised p-3 text-sm">
        <p className="flex justify-between">
          <span className="text-ink-mute">Precio del flete</span>
          <span className="cifra">{mxn(precio)}</span>
        </p>
        {objeto.dias != null && (
          <p className="mt-1 flex items-center justify-between">
            <span className="text-ink-mute">Lleva {objeto.dias} días</span>
            {objeto.vencido && <Etiqueta tono="malo">vencida</Etiqueta>}
          </p>
        )}
      </div>

      <ComoSePago precio={precio} valor={pago} onCambio={setPago} sugeridos={contactos} />

      {falta > 0 && (
        <p className="rounded-xl border border-warn/25 bg-warn/10 px-3 py-2 text-sm text-warn">
          Quedan {mxn(falta)} sin pagar. El envío aparece en lo que te deben.
        </p>
      )}

      <Aviso error={error} />

      <AccionesModal>
        <Boton variante="fantasma" onClick={onCerrar}>Cancelar</Boton>
        <Boton disabled={cargando || falta < 0} onClick={() => onGuardar(objeto.envioId, pago)}>
          {cargando ? 'Guardando…' : 'Guardar'}
        </Boton>
      </AccionesModal>
    </div>
  );
}
