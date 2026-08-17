import { build } from "esbuild";

// bufferutil and utf-8-validate are optional ws speedups resolved at runtime
await build({
    entryPoints: ["server/index.ts"],
    bundle: true,
    platform: "node",
    target: "node22",
    format: "esm",
    outfile: "dist-server/index.mjs",
    external: ["bufferutil", "utf-8-validate"],
    banner: {
        js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
    },
});
