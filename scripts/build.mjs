import { build } from "esbuild";
import { chmodSync, rmSync } from "node:fs";
import { join } from "node:path";
import { readPackage, root } from "./artifacts.mjs";
import { parserWasmAssets } from "../src/lexers/wasm-assets.mjs";

readPackage();
rmSync(join(root, "dist"), { recursive: true, force: true });
const parserAssets = Object.fromEntries(Object.entries(parserWasmAssets()).map(([name, bytes]) => [
  name,
  bytes.toString("base64"),
]));
await build({
  absWorkingDir: root,
  entryPoints: { cli: "src/cli.mjs", runtime: "src/runtime.mjs" },
  outdir: "dist",
  outExtension: { ".js": ".mjs" },
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  legalComments: "inline",
  plugins: [{
    name: "inline-parser-wasm-assets",
    setup(buildApi) {
      buildApi.onLoad({ filter: /wasm-assets\.mjs$/ }, () => ({
        loader: "js",
        contents: `const encoded = ${JSON.stringify(parserAssets)};\nexport function parserWasmAssets() { return Object.fromEntries(Object.entries(encoded).map(([name, value]) => [name, Buffer.from(value, "base64")])); }\n`,
      }));
    },
  }],
  banner: { js: "// miku-repo-scale — Apache-2.0; see LICENSE and THIRD_PARTY_NOTICES.md in the source archive." },
  logLevel: "info",
});
chmodSync(join(root, "dist/cli.mjs"), 0o755);
