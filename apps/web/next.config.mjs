/** @type {import('next').NextConfig} */
export default {
  output: 'export',
  // Optional: Change the output directory `out` -> `dist`
  distDir: 'dist',
  experimental: { typedRoutes: false },
  transpilePackages: ['@app/shared'],
};
