import { context } from "esbuild";

const build = await context({
  entryPoints: ["main.ts"],
  outfile: "main.js",
  bundle: true,
  format: "cjs",
  platform: "browser",
  target: "es2020",
  external: ["obsidian", "electron", "@electron/remote"],
  logLevel: "info",
});

if (process.argv.includes("--watch")) {
  await build.watch();
} else {
  try {
    await build.rebuild();
  } finally {
    await build.dispose();
  }
}
