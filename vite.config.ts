import { resolve } from "node:path";
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";

const EMPTY_DTS = "export {}";
const DTS_REPLACEMENTS: Array<[suffix: string, content: string]> = [
  ["dist/index.d.ts", "export * from './src/index';\n"],
  [
    "dist/react.d.ts",
    [
      'import type { UseSmartMessagingOptions, UseSmartMessagingResult } from "./index";',
      'export * from "./index";',
      'export type { UseSmartMessagingOptions, UseSmartMessagingResult } from "./index";',
      "export declare function useSmartMessaging(",
      "  options: UseSmartMessagingOptions,",
      "): UseSmartMessagingResult;",
      "",
    ].join("\n"),
  ],
];

export default defineConfig({
  resolve: {
    alias: {
      "sdc-smart-web-messaging": resolve(__dirname, "vendor/sdc-smart-web-messaging/src/index.ts"),
    },
  },
  plugins: [
    dts({
      rollupTypes: true,
      beforeWriteFile: (filePath, content) => {
        const replacement = DTS_REPLACEMENTS.find(([suffix]) => filePath.endsWith(suffix));
        if (replacement && content.trim() === EMPTY_DTS) {
          return { filePath, content: replacement[1] };
        }
      },
    }),
  ],
  build: {
    lib: {
      entry: {
        index: resolve(__dirname, "src/index.ts"),
        react: resolve(__dirname, "src/react.ts"),
      },
      name: "SdcSmartWebMessagingClient",
      formats: ["es"],
      fileName: (_format, entryName) => `${entryName}.js`,
    },
    rollupOptions: {
      external: ["react"],
    },
  },
});
