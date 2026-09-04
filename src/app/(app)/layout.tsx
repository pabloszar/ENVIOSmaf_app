import Navegacion, { MenuMovil } from '@/components/Navegacion';
import BarraMetricas from '@/components/BarraMetricas';

/**
 * El cascarón de la app.
 *
 * Casi todas las pantallas son documentos: crecen hacia abajo y se recorren.
 * El cotizador no —es un mapa, y un mapa con scroll de página se pelea con el
 * scroll del propio mapa—. En vez de darle una ruta aparte fuera del cascarón,
 * que lo dejaría sin la navegación y sin la barra de métricas, la página se
 * marca con `data-pantalla-completa` y el cascarón se adapta: se vuelve una
 * columna del alto exacto de la ventana y deja de recortar el contenido.
 *
 * Se resuelve con CSS (`:has`) y no leyendo la ruta porque este layout es de
 * servidor: mirar el pathname lo volvería cliente y arrastraría con él toda la
 * barra de métricas, que hoy se arma en el servidor.
 *
 * La navegación cambia de lado según el ancho: carril a la izquierda en
 * escritorio, barra al pie en el teléfono. Por eso el hueco que se le aparta
 * también cambia —`md:pl-16` de un lado, `--barra-movil` del otro—, y por eso
 * la M sube aquí en el teléfono: en el carril no cabe, porque el carril no
 * está.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <Navegacion />
      <div className="cascaron md:pl-16">
        {/* Las métricas vivas viajan con el scroll: siempre a la vista. */}
        <header className="sticky top-0 z-30 shrink-0 border-b border-white/[0.06]
          bg-surface-sunk/70 backdrop-blur-xl">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 md:gap-4 md:px-8">
            <MenuMovil />
            <BarraMetricas />
            <span className="hidden text-xs text-ink-mute md:block">Envíos MAF</span>
          </div>
        </header>
        <main className="lienzo mx-auto max-w-7xl px-4 py-6 md:px-8 md:py-8">{children}</main>
      </div>
    </div>
  );
}
