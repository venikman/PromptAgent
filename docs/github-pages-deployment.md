# GitHub Pages Deployment Guide

## How GitHub Pages Works

GitHub Pages is a static site hosting service that takes files from a repository and publishes them as a website.

```
┌─────────────────────────────────────────────────────────────────┐
│                        Your Repository                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   main branch                                                   │
│   ├── src/              (source code)                          │
│   ├── explain/          (Vite app)                             │
│   │   ├── src/                                                 │
│   │   ├── dist/         ◄── Built output                       │
│   │   └── vite.config.ts                                       │
│   └── ...                                                       │
│                                                                 │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                    GitHub Actions                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   1. Checkout code                                              │
│   2. Install dependencies (bun install)                         │
│   3. Build static files (bun run build)                         │
│   4. Upload dist/ as artifact                                   │
│   5. Deploy to GitHub Pages                                     │
│                                                                 │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                    GitHub Pages CDN                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   https://venikman.github.io/PromptAgent/                       │
│                                                                 │
│   Serves static files globally via CDN                          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## URL Structure

```
Repository:     github.com/venikman/PromptAgent
                            │         │
                            ▼         ▼
GitHub Pages:   venikman.github.io/PromptAgent/
                    │                  │
                    │                  └── Base path (repo name)
                    └── User/Org subdomain
```

## Why Base Path Matters

When deploying to GitHub Pages, your app runs at `/PromptAgent/`, not `/`:

```
Root domain:     venikman.github.io/
                        │
                        ├── /PromptAgent/           ◄── Your app
                        ├── /other-repo/            ◄── Another repo
                        └── /yet-another-repo/      ◄── Another repo
```

### Without base path configured:
```html
<!-- Browser requests -->
<script src="/assets/main.js">     →  venikman.github.io/assets/main.js
                                                            │
                                                            └── 404 Not Found!
```

### With base path `/PromptAgent/`:
```html
<!-- Browser requests -->
<script src="/PromptAgent/assets/main.js">  →  venikman.github.io/PromptAgent/assets/main.js
                                                                              │
                                                                              └── Found!
```

## Vite Configuration

```typescript
// vite.config.ts
export default defineConfig({
  base: '/PromptAgent/',  // Matches repository name
  plugins: [react()],
})
```

## Deployment Methods

### Method 1: GitHub Actions (Recommended)

```
Push to main  →  Trigger workflow  →  Build  →  Deploy
     │                  │               │          │
     │                  │               │          └── Automatic
     │                  │               └── bun run build
     │                  └── .github/workflows/deploy.yml
     └── git push origin main
```

### Method 2: Deploy from Branch

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  main branch │ ──► │ Build locally│ ──► │  gh-pages    │
│  (source)    │     │              │     │  branch      │
└──────────────┘     └──────────────┘     └──────────────┘
                                                 │
                                                 ▼
                                          GitHub Pages
                                          serves this branch
```

## Manual Deployment Steps

1. **Build the app:**
   ```bash
   cd explain
   bun run build
   ```

2. **The `dist/` folder contains:**
   ```
   dist/
   ├── index.html
   ├── assets/
   │   ├── index-[hash].js
   │   └── index-[hash].css
   └── ...
   ```

3. **Deploy using `gh-pages` package or GitHub Actions**

## Repository Settings

To enable GitHub Pages:

```
Repository → Settings → Pages
                          │
                          ├── Source: GitHub Actions
                          │   (or Deploy from branch: gh-pages)
                          │
                          └── Click Save
```

## Summary Flow

```
┌────────────┐    ┌────────────┐    ┌────────────┐    ┌────────────┐
│   Code     │    │   Build    │    │   Deploy   │    │   Live     │
│   Change   │ ─► │   Process  │ ─► │   to CDN   │ ─► │   Site     │
└────────────┘    └────────────┘    └────────────┘    └────────────┘
     │                  │                 │                 │
     │                  │                 │                 │
  git push         vite build      upload artifact    accessible at
  origin main      → dist/         → GitHub Pages     github.io URL
```
