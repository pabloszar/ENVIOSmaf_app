-- Reinicia el contador de folios de rutas.
--
-- Se borraron las rutas de la 42 en adelante (las que venían del histórico y
-- que a partir de ahora se capturan a mano). El `serial` de `rutas.folio` no
-- retrocede solo: seguiría en 49 y la siguiente ruta nacería como folio 50.
--
-- Esta línea lo deja apuntando al último folio que sí existe, de modo que la
-- próxima ruta que crees tome el número que sigue. Es segura de correr varias
-- veces: siempre se apoya en el máximo real de la tabla.

select setval(
  pg_get_serial_sequence('rutas', 'folio'),
  coalesce((select max(folio) from rutas), 0),
  true   -- true = el siguiente valor será max+1
);

-- Comprobación: debe decir 41 y 42.
select
  (select max(folio) from rutas) as ultimo_folio,
  currval(pg_get_serial_sequence('rutas', 'folio')) + 1 as proximo_folio;
