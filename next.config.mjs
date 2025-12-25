// next.config.mjs

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",

  // Fix Vercel build failing on missing @typescript-eslint rule definitions
  eslint: {
    ignoreDuringBuilds: true,
  },

  /**
   * Ensure public/fonts/*.ttf are included in the serverless/standalone bundle
   * (output file tracing), so runtime fs reads like:
   *   process.cwd() + "/public/fonts/Inter-Regular.ttf"
   * will work on Vercel / serverless.
   */
  experimental: {
    outputFileTracingIncludes: {
      // Include fonts for all route handlers/pages
      "/*": ["./public/fonts/**/*"],
    },
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
