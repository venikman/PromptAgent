# Lyra Amber UI Preset

This preset matches the PromptAgent UI styling: Radix Lyra, gray base color,
amber accents, radius none, and Noto Sans with Tailwind CSS v4.

## Apply in another project

```bash
# From this repo

deno run -A scripts/apply-ui-preset.ts --target /path/to/your/project
```

Defaults:
- CSS target: `src/styles.css`
- Components config: `components.json`

Override paths if needed:

```bash
deno run -A scripts/apply-ui-preset.ts \
  --target /path/to/your/project \
  --css src/styles.css \
  --components components.json
```

Install dependencies if missing:

```bash
npm install -D shadcn tw-animate-css tailwindcss
npm install @fontsource/noto-sans
```

## Files

- `styles.css`: Tailwind v4 + theme tokens
- `components.json`: shadcn config (radix-lyra, gray)
- `preset.json`: shadcn init payload (host it if you want `--preset <url>`)
