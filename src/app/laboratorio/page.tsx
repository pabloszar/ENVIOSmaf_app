'use client';

/**
 * El sistema de movimiento, en una sola pantalla.
 *
 * No es una pantalla del negocio: es el banco donde se prueba el diseño. Cada
 * pieza que se anime en la app aparece aquí primero, con datos inventados,
 * para poder mirarla sin depender de que la base responda ni de que exista una
 * ruta con los números adecuados.
 *
 * Por eso vive FUERA de `(app)`: el cascarón de allá monta la barra de
 * métricas, que consulta la base. Aquí no se consulta nada, así que el
 * movimiento se puede juzgar solo, que es como hay que juzgarlo.
 *
 * No está en la navegación y no hace falta que lo esté: se llega escribiendo
 * /laboratorio, y quien lo busca sabe lo que busca.
 */
import { useState } from 'react';
import { Indicador } from '@/components/Cifras';
import { Boton, BotonMini, Chip, Etiqueta, Modal, AccionesModal } from '@/components/ui';
import { Barra } from '@/components/movimiento';

export default function Laboratorio() {
  const [abierto, setAbierto] = useState(false);
  const [activo, setActivo] = useState('mes');

  return (
    <main className="mx-auto max-w-6xl px-8 py-10">
      <div className="entra">
        <p className="etiqueta">Banco de pruebas</p>
        <h1 className="mt-2 text-4xl font-medium tracking-tight">Sistema de movimiento</h1>
      </div>

      <div className="mt-6 flex gap-2">
        {['mes', '3 meses', 'año', 'todo'].map((c) => (
          <Chip key={c} activo={activo === c} onClick={() => setActivo(c)}>{c}</Chip>
        ))}
      </div>

      <section className="cascada mt-6 grid gap-4 lg:grid-cols-3">
        <div className="tarjeta levanta relative flex flex-col justify-between overflow-hidden lg:row-span-3">
          <span aria-hidden className="halo halo-vivo -right-16 -top-20 h-56 w-56"
            style={{ background: 'radial-gradient(circle, rgba(215,240,0,0.16), transparent 70%)' }} />
          <div className="relative">
            <p className="etiqueta">Margen neto</p>
            <p className="cifra mt-4 text-[4.5rem] font-light leading-[0.9] tracking-tighter text-good">
              37.8<span className="text-3xl font-light text-ink-mute">%</span>
            </p>
            <p className="mt-4 text-lg font-light">Muy sano</p>
            <p className="mt-2 text-xs text-ink-mute">
              De cada peso que vendes, te quedan 38 centavos después de todo.
            </p>
          </div>
          <div className="relative mt-8">
            <span className="block h-1 overflow-hidden rounded-full bg-white/[0.08]">
              <Barra pct={76} className="bg-good" />
            </span>
          </div>
        </div>

        <Indicador etiqueta="Venta" numero={151700} halo="teal" detalle="82 viajes" />
        <Indicador etiqueta="Cobrado" numero={131700} detalle="$20,000 siguen por cobrar" tono="aviso" />
        <Indicador etiqueta="Utilidad neta" numero={73979.61} halo="naranja" tono="bueno"
          detalle="después de renta y comisiones" />
        <Indicador etiqueta="Ticket promedio" numero={1849.39} detalle="por misión entregada" />
        <Indicador etiqueta="Utilidad por misión" numero={840.68} detalle="88 misiones" />
      </section>

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <Boton onClick={() => setAbierto(true)}>Abrir ventana</Boton>
        <Boton variante="suave">Suave</Boton>
        <Boton variante="peligro">Peligro</Boton>
        <Boton variante="fantasma">Fantasma</Boton>
        <BotonMini>Mini</BotonMini>
        <Etiqueta tono="activo">en curso</Etiqueta>
        <Etiqueta tono="bueno">entregada</Etiqueta>
        <Etiqueta tono="aviso">por cobrar</Etiqueta>
      </div>

      <Modal abierto={abierto} onCerrar={() => setAbierto(false)} titulo="Nueva ruta"
        descripcion="Lo mínimo para que el viaje exista.">
        <p className="text-sm text-ink-soft">
          El velo entra en 200 ms y la ventana en 320 con 60 de retardo: se leen
          como dos planos a distinta profundidad, no como una capa plana.
        </p>
        <AccionesModal>
          <Boton variante="fantasma" onClick={() => setAbierto(false)}>Cancelar</Boton>
          <Boton onClick={() => setAbierto(false)}>Crear y abrir</Boton>
        </AccionesModal>
      </Modal>
    </main>
  );
}
