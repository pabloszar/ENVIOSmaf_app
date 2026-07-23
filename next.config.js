/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
};

// Nota: el proyecto NO puede vivir en una ruta con acentos. Webpack falla al
// resolver sus propios módulos ("Cannot find module caniuse-lite/...") cuando
// alguna carpeta del path tiene í, ó, etc. Los espacios sí son inofensivos.

module.exports = nextConfig;
