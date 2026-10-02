/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  swcMinify: true,
  async redirects() {
    return [
      // корінь сайту → слайд-вхід (а не старий дашборд index.js)
      { source: '/', destination: '/layout.html', permanent: false },
    ]
  },
}
module.exports = nextConfig
