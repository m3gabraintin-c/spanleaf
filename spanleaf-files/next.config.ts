import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  // Konva's Node build optionally requires "canvas". We only run it in the browser.
  turbopack: { resolveAlias: { canvas: { browser: "./src/lib/empty.ts" } } },
};

export default config;
