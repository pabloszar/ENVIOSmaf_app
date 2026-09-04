'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Map as MapaLeaflet, Marker, Polyline, LayerGroup } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { ORIGEN } from '@/lib/pricing';

export interface PuntoMapa {
  lat: number;
  lng: number;
  /** El número que va dentro del pin. Sin él se dibuja un punto pelón. */
  etiqueta?: string | number;
  titulo?: string;
  atenuado?: boolean;
}

/**
 * El mapa del cotizador y de las rutas.
 *
 * Leaflet crudo y no react-leaflet: son cuatro llamadas —crear, poner capa,
 * poner marcadores, encuadrar— y envolverlas en otra biblioteca añadiría un
 * ciclo de vida más que sincronizar con el de React.
 *
 * Se carga con `dynamic(..., { ssr: false })` desde donde se use. Leaflet toca
 * `window` al importarse y en el servidor no existe.
 *
 * Los teselas son las de OpenStreetMap, oscurecidas con un filtro CSS en vez
 * de usar un servidor de teselas oscuras: los mapas oscuros que se ven bien
 * son de empresas con sus propios términos, y aquí conviene depender de una
 * sola fuente, la que ya se cita en los créditos.
 */
export default function Mapa({
  paradas, globo, linea, onClic, alto = '420px', encuadrar = true, margen, controles = 'topleft',
}: {
  paradas: PuntoMapa[];
  /**
   * Lo que se abre al tocar un pin o al acercarle el cursor.
   *
   * Es una función y no un campo de `PuntoMapa` porque lo que devuelve se
   * pinta en cada render. Metido en la lista de paradas —que va memorizada
   * para no rehacer los marcadores cada vez que cambia un cobro— el globo se
   * quedaría con los datos del momento en que se dibujó el mapa.
   *
   * `cerrar` es para el botón que abre una ventana encima: un globo que se
   * queda abierto detrás del modal se asoma por las orillas.
   */
  globo?: (punto: PuntoMapa, i: number, cerrar: () => void) => React.ReactNode;
  linea?: [number, number][];
  /** Poner un pin tocando el mapa. Sin esto el mapa es de solo mirar. */
  onClic?: (lat: number, lng: number) => void;
  alto?: string;
  encuadrar?: boolean;
  /**
   * Cuánto del mapa tapan los paneles que flotan encima, en píxeles. El
   * encuadre lo respeta para que el recorrido no quede debajo de una tarjeta.
   */
  margen?: { arriba: number; izquierda: number; abajo: number; derecha: number };
  controles?: 'topleft' | 'bottomleft' | 'ninguno';
}) {
  const caja = useRef<HTMLDivElement>(null);
  // Se prende cuando el mapa ya conoce su tamaño de verdad. Ver más abajo.
  const [medido, setMedido] = useState(false);
  /**
   * Una caja vacía por pin. Leaflet la adopta como contenido de su globo y
   * React pinta dentro por portal: así el globo es un componente de verdad,
   * con sus botones, y no una cadena de HTML que solo se puede mirar.
   *
   * Se crean todas de entrada, aunque el globo esté cerrado. Leaflet mide el
   * contenido al abrirlo y le fija la posición ahí mismo: si la caja llegara
   * vacía y React la llenara después, el globo quedaría del tamaño del hueco.
   */
  const [cajas, setCajas] = useState<HTMLDivElement[]>([]);
  const mapa = useRef<MapaLeaflet | null>(null);
  const capa = useRef<LayerGroup | null>(null);
  const trazo = useRef<Polyline | null>(null);
  const origen = useRef<Marker | null>(null);
  // El callback vive en una ref para que el manejador de clic no haya que
  // volver a registrarlo en cada render: reengancharlo perdería el mapa.
  const alClic = useRef(onClic);
  alClic.current = onClic;
  // Igual que el clic: se lee al dibujar los marcadores, no es una dependencia
  // suya. Si lo fuera, cada render reharía los pines y cerraría el globo
  // abierto —justo el que se está leyendo—.
  const hacerGlobo = useRef(globo);
  hacerGlobo.current = globo;
  const relojGlobo = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cerrarGlobo = () => { mapa.current?.closePopup(); };

  // ── Crear el mapa una sola vez ──
  useEffect(() => {
    if (!caja.current || mapa.current) return;
    let vivo = true;

    (async () => {
      const L = (await import('leaflet')).default;
      if (!vivo || !caja.current || mapa.current) return;

      const m = L.map(caja.current, {
        center: [ORIGEN.lat, ORIGEN.lng],
        zoom: 11,
        zoomControl: false,
        attributionControl: true,
      });
      if (controles !== 'ninguno') L.control.zoom({ position: controles }).addTo(m);

      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap',
        className: 'mapa-teselas',
        // Un anillo ancho de teselas ya cargadas alrededor de lo que se ve.
        // Con el valor por omisión (2), arrastrar el mapa deja huecos hasta
        // que llega la imagen; con seis, el hueco casi nunca alcanza a verse.
        keepBuffer: 6,
        // Pedir mientras se arrastra y no solo al soltar: las teselas llegan
        // durante el movimiento en vez de todas juntas al final.
        updateWhenIdle: false,
      }).addTo(m);

      origen.current = L.marker([ORIGEN.lat, ORIGEN.lng], {
        icon: L.divIcon({
          className: '',
          html: `<div class="pin-origen" title="${ORIGEN.nombre} — ${ORIGEN.direccion}">🏠</div>`,
          iconSize: [30, 30], iconAnchor: [15, 15],
        }),
        interactive: false,
      }).addTo(m);

      capa.current = L.layerGroup().addTo(m);
      m.on('click', (e) => alClic.current?.(e.latlng.lat, e.latlng.lng));

      mapa.current = m;
      // El contenedor suele medir cero cuando Leaflet arranca —está dentro de
      // una columna que aún no se acomoda— y el mapa queda en gris. Esto lo
      // obliga a medirse otra vez cuando ya hay tamaño.
      //
      // `medido` no está de más: un encuadre calculado sobre un contenedor de
      // cero píxeles sale mal y nada lo vuelve a intentar, así que la ruta
      // aparecía dibujada a un zoom que no era el suyo. Al prenderse, el
      // efecto de abajo vuelve a encuadrar con las medidas buenas.
      setTimeout(() => { m.invalidateSize(); setMedido(true); }, 0);
    })();

    return () => {
      vivo = false;
      mapa.current?.remove();
      mapa.current = null;
      capa.current = null;
      trazo.current = null;
    };
    // `controles` solo se lee al crear el mapa: cambiarlo después movería el
    // control de sitio sin motivo, y no hay pantalla que lo necesite.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => { if (relojGlobo.current) clearTimeout(relojGlobo.current); }, []);

  // ── Volver a medirse cuando cambia el contenedor ──
  // Leaflet ya escucha el resize de la ventana, pero aquí el mapa comparte
  // columna con paneles que crecen al pasar el cursor: la caja cambia de alto
  // sin que la ventana se mueva, y sin esto quedan franjas grises donde no
  // hay tesela pedida.
  useEffect(() => {
    if (!caja.current || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => mapa.current?.invalidateSize());
    ro.observe(caja.current);
    return () => ro.disconnect();
  }, []);

  // ── Redibujar paradas y trayecto ──
  useEffect(() => {
    const m = mapa.current;
    if (!m || !capa.current) return;
    let vivo = true;

    (async () => {
      const L = (await import('leaflet')).default;
      if (!vivo || !mapa.current || !capa.current) return;

      capa.current.clearLayers();
      const nuevas: HTMLDivElement[] = [];
      for (const p of paradas) {
        const pin = L.marker([p.lat, p.lng], {
          icon: L.divIcon({
            className: '',
            html: `<div class="pin-parada${p.atenuado ? ' pin-atenuado' : ''}">${p.etiqueta ?? ''}</div>`,
            iconSize: [26, 26], iconAnchor: [13, 13],
          }),
          title: p.titulo ?? '',
        }).addTo(capa.current!);

        if (hacerGlobo.current) {
          const nodo = document.createElement('div');
          nuevas.push(nodo);
          pin.bindPopup(nodo, {
            className: 'globo',
            // La cruz la pone el globo, dentro de su cabecera. La de Leaflet
            // cae justo sobre la primera línea del contenido.
            closeButton: false,
            minWidth: 288, maxWidth: 288,
            offset: [0, -11],
            // Al abrirse, el mapa se mueve lo justo para que el globo quepa
            // entero. Los márgenes son los mismos que respeta el encuadre: lo
            // que le tapan los paneles. Con el margen suelto de Leaflet, un
            // pin de arriba abría su globo debajo de la pastilla del viaje.
            autoPanPaddingTopLeft: [(margen?.izquierda ?? 24) + 10, (margen?.arriba ?? 24) + 10],
            autoPanPaddingBottomRight: [(margen?.derecha ?? 24) + 10, (margen?.abajo ?? 24) + 10],
          });

          // El cursor lo abre, con retardo: sin él, cruzar el mapa con el
          // ratón va abriendo globos a su paso. Al salir NO se cierra —hay
          // que poder llegar hasta sus botones—; lo cierran el pin siguiente,
          // un clic en el mapa o su propia cruz.
          pin.on('mouseover', () => {
            if (relojGlobo.current) clearTimeout(relojGlobo.current);
            relojGlobo.current = setTimeout(() => pin.openPopup(), 160);
          });
          pin.on('mouseout', () => {
            if (relojGlobo.current) clearTimeout(relojGlobo.current);
          });
        }
      }
      setCajas(nuevas);

      trazo.current?.remove();
      trazo.current = null;
      if (linea && linea.length > 1) {
        trazo.current = L.polyline(linea, {
          color: '#14a08f', weight: 4, opacity: 0.85, lineJoin: 'round',
        }).addTo(m);
      }

      if (!encuadrar) return;
      const puntos: [number, number][] = [
        [ORIGEN.lat, ORIGEN.lng],
        ...paradas.map((p) => [p.lat, p.lng] as [number, number]),
      ];
      if (puntos.length === 1) { m.setView(puntos[0], 11); return; }
      m.fitBounds(L.latLngBounds(puntos).pad(0.06), {
        animate: false,
        maxZoom: 14,
        paddingTopLeft: [margen?.izquierda ?? 24, margen?.arriba ?? 24],
        paddingBottomRight: [margen?.derecha ?? 24, margen?.abajo ?? 24],
      });
    })();

    return () => { vivo = false; };
  }, [paradas, linea, encuadrar, margen, medido]);

  return (
    <>
      <div ref={caja} style={{ height: alto }} className="h-full w-full" />
      {/* Las cajas las creó el efecto de arriba y Leaflet ya las tiene en su
          panel de globos; aquí solo se pinta dentro. `paradas[i]` puede faltar
          durante el render que va entre un cambio de paradas y el redibujo. */}
      {globo && cajas.map((nodo, i) => (
        paradas[i] ? createPortal(globo(paradas[i], i, cerrarGlobo), nodo, `globo-${i}`) : null
      ))}
    </>
  );
}
