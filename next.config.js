/** @type {import('next').NextConfig} */
const isCapacitorBuild = process.env.CAPACITOR_BUILD === "1";

const nextConfig = {
  ...(isCapacitorBuild
    ? {
        output: "export",
        trailingSlash: true,
        images: { unoptimized: true },
      }
    : {
        allowedDevOrigins: ["192.168.1.118"],
        async headers() {
          return [
            {
              source: "/api/:path*",
              headers: [
                { key: "X-Content-Type-Options", value: "nosniff" },
                { key: "Cache-Control", value: "no-store" },
              ],
            },
          ];
        },
      }),
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

module.exports = nextConfig;
