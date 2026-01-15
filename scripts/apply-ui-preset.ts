import { dirname, fromFileUrl, join, resolve } from "@std/path";

type Args = {
  target?: string;
  css?: string;
  components?: string;
};

const parseArgs = (args: string[]): Args => {
  const parsed: Args = {};
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (!arg) continue;
    if (arg === "--target") {
      parsed.target = args[i + 1];
      i += 1;
      continue;
    }
    if (arg === "--css") {
      parsed.css = args[i + 1];
      i += 1;
      continue;
    }
    if (arg === "--components") {
      parsed.components = args[i + 1];
      i += 1;
      continue;
    }
  }
  return parsed;
};

const args = parseArgs(Deno.args);

if (!args.target) {
  console.error(
    "Usage: deno run -A scripts/apply-ui-preset.ts --target <path> [--css src/styles.css] [--components components.json]",
  );
  Deno.exit(1);
}

const cssPath = args.css ?? "src/styles.css";
const componentsPath = args.components ?? "components.json";

const scriptDir = dirname(fromFileUrl(import.meta.url));
const presetDir = resolve(scriptDir, "..", "presets", "lyra-amber");
const presetStylesPath = join(presetDir, "styles.css");
const presetComponentsPath = join(presetDir, "components.json");

const targetRoot = resolve(args.target);
const targetStylesPath = resolve(targetRoot, cssPath);
const targetComponentsPath = resolve(targetRoot, componentsPath);

await Deno.mkdir(dirname(targetStylesPath), { recursive: true });
await Deno.mkdir(dirname(targetComponentsPath), { recursive: true });

const presetStyles = await Deno.readTextFile(presetStylesPath);
await Deno.writeTextFile(targetStylesPath, presetStyles);

const componentsRaw = await Deno.readTextFile(presetComponentsPath);
const componentsJson = JSON.parse(componentsRaw) as Record<string, unknown>;
const tailwind = (componentsJson.tailwind ?? {}) as Record<string, unknown>;
componentsJson.tailwind = { ...tailwind, css: cssPath };

await Deno.writeTextFile(
  targetComponentsPath,
  `${JSON.stringify(componentsJson, null, 2)}\n`,
);

console.log(`Applied Lyra/Amber preset to ${targetRoot}.`);
console.log("Install dependencies if missing:");
console.log("- npm install -D shadcn tw-animate-css tailwindcss");
console.log("- npm install @fontsource/noto-sans");
