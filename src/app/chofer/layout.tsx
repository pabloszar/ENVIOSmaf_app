/**
 * El cascarón del chofer.
 *
 * Nada del de admin: ni carril de iconos, ni barra de métricas, ni las seis
 * secciones. Aquí solo hay dos pantallas —lo de hoy y lo de antes— y quien las
 * abre lo hace de pie junto a la camioneta, con una mano, con sol en la
 * pantalla y a veces sin señal.
 *
 * De ahí sale todo lo demás: los botones son grandes porque se tocan con el
 * pulgar, el texto es grande porque se lee de reojo, y el alto es el de la
 * ventana para que la lista corra por dentro y no se pierda el encabezado que
 * dice de qué viaje se trata.
 */
export default function ChoferLayout({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-dvh flex-col bg-surface-sunk text-ink">{children}</div>;
}
