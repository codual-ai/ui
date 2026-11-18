// A static export for GitHub Pages. The site lives at https://codual-ai.github.io/ui/, so pages and assets are
// served under /ui. For a custom domain at its root, build with SITE_BASE_PATH="" (see .github/workflows/site.yml).
import path from "node:path";

const basePath = process.env.SITE_BASE_PATH ?? "/ui";

/** @type {import('next').NextConfig} */
const config = {
  output: "export",
  basePath,
  trailingSlash: true,
  images: { unoptimized: true },
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
  reactStrictMode: true,
  // The pages read spec/, README.md and the spec parser in scripts/, outside site/.
  turbopack: { root: path.resolve(import.meta.dirname, "..") },
};

export default config;
