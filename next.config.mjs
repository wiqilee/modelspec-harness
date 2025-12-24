/** @type {import('next').NextConfig} */
const nextConfig = {
    output: "standalone",
  
    webpack: (config, { isServer }) => {
      if (isServer) {
        // 🚨 CRITICAL:
        // Prevent pdfkit (and fontkit) from being bundled by Next.js.
        // They MUST run as native Node modules, otherwise Helvetica.afm errors happen.
        config.externals = config.externals || [];
        config.externals.push({
          pdfkit: "commonjs pdfkit",
          fontkit: "commonjs fontkit",
        });
      }
  
      return config;
    },
  };
  
  export default nextConfig;
  