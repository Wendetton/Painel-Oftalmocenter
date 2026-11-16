/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // Painéis desativados (Recepção e Consultório não são mais usados).
  // Quem ainda tiver a URL antiga salva cai na página inicial, que não
  // consulta a API do ProDoctor.
  async redirects() {
    return [
      { source: "/recepcao", destination: "/", permanent: false },
      { source: "/consultorio", destination: "/", permanent: false },
    ];
  },
};

export default nextConfig;
