/** @type {import('next').NextConfig} */
const nextConfig = {
    output: "standalone",
  
    // Fix Vercel build failing on missing @typescript-eslint rule definitions
    eslint: {
      ignoreDuringBuilds: true,
    },
  
    webpack: (config, { isServer }) => {
      if (isServer) {
        // Prevent pdfkit/fontkit from being bundled by Next.js.
        // They must run as native Node modules at runtime.
        config.externals = config.externals || [];
  
        // Keep existing externals behavior and add ours.
        config.externals.push({
          pdfkit: "commonjs pdfkit",
          fontkit: "commonjs fontkit",
        });
      }
  
      return config;
    },
  };
  
  export default nextConfig;
  