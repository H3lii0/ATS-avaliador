import type { NextConfig } from "next";

const serverExternalPackages = process.env.VERCEL === "1" ? ["pdf-parse", "@napi-rs/canvas"] : [];

const scriptPolicy =
  process.env.NODE_ENV === "development"
    ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
    : "script-src 'self' 'unsafe-inline'";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  agentRules: false,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "base-uri 'self'",
              "font-src 'self' data:",
              "form-action 'self'",
              "frame-ancestors 'none'",
              "img-src 'self' data:",
              "object-src 'none'",
              scriptPolicy,
              "style-src 'self' 'unsafe-inline'",
              "connect-src 'self' ws: wss:",
            ].join("; "),
          },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
  turbopack: {
    root: process.cwd(),
  },
  serverExternalPackages,
  // Runtime imports are invisible to file tracing. Include canvas' JS files
  // and the installed Linux native binding as well as the PDF.js worker.
  outputFileTracingIncludes: {
    "/api/analisar": [
      "./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
      "./node_modules/@napi-rs/canvas/**/*",
      "./node_modules/@napi-rs/canvas-linux-*/**/*",
    ],
  },
};

export default nextConfig;
