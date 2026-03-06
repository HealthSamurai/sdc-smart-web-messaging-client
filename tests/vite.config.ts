import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  root: resolve(__dirname, "harness"),
  resolve: {
    alias: {
      "sdc-smart-web-messaging-client/react": resolve(__dirname, "../src/react.ts"),
      "sdc-smart-web-messaging-client": resolve(__dirname, "../src/index.ts"),
      "sdc-smart-web-messaging": resolve(
        __dirname,
        "../vendor/sdc-smart-web-messaging/src/index.ts",
      ),
    },
  },
  server: {
    fs: {
      allow: [resolve(__dirname, "..")],
    },
  },
});
