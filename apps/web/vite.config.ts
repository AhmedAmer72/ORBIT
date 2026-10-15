import path from "node:path";
import { fileURLToPath } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const root = path.dirname(fileURLToPath(import.meta.url));

const optionalWalletStubs = {
  "@x402/evm/upto/client": path.resolve(root, "src/lib/empty.ts"),
  "@x402/evm/exact/client": path.resolve(root, "src/lib/empty.ts"),
  "@x402/core/client": path.resolve(root, "src/lib/empty.ts"),
  "@x402/svm/exact/client": path.resolve(root, "src/lib/empty.ts"),
  "@x402/evm": path.resolve(root, "src/lib/empty.ts"),
  "@react-native-async-storage/async-storage": path.resolve(root, "src/lib/empty.ts"),
  "pino-pretty": path.resolve(root, "src/lib/empty.ts"),
};

export default defineConfig({
  plugins: [react(), tailwindcss()],
  envDir: path.resolve(root, "../.."),
  envPrefix: ["VITE_", "NEXT_PUBLIC_"],
  resolve: {
    alias: {
      "@": path.resolve(root, "src"),
      ...optionalWalletStubs,
    },
  },
  server: {
    port: 3000,
  },
  build: {
    outDir: path.resolve(root, "dist"),
    emptyOutDir: true,
  },
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});
