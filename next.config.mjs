// next.config.mjs

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",

  // Fix Vercel build failing on missing @typescript-eslint rule definitions
  eslint: {
    ignoreDuringBuilds: true,
  },

  /**
   * Vercel/Serverless: ensure public/fonts/*.ttf is included in the output file trace
   * so fs reads like process.cwd() + "/public/fonts/Inter-Regular.ttf" work at runtime.
   *
   * Note: outputFileTracingIncludes requires Next 13.4+ and works with standalone output.
   * Local dev is not affected.
   */
  experimental: {
    outputFileTracingIncludes: {
      // include for everything (route handlers + pages)
      "/*": ["public/fonts/**/*.ttf", "public/fonts/**/*.otf"],
    },
  },

  webpack: (config, { isServer }) => {
    if (isServer) {
      // Prevent pdfkit/fontkit from being bundled by Next.js.
      // Keep them as runtime Node externals.
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
