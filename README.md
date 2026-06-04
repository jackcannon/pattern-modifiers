# Pattern Modifiers

![logo](public/logo.svg)

Web app for generating STL files of 3D patterns and dynamic shapes for use as modifiers in slicer software (e.g. Bambu Studio, PrusaSlicer).

The project is in early development. The current UI provides a sidebar of dimension controls and a 3D preview panel; geometry generation and STL export are not implemented yet.

## How it works

- React + TypeScript app built with [Vite](https://vitejs.dev)
- Sidebar controls are driven by a [Zod](https://zod.dev) schema and rendered with [MUI](https://mui.com) sliders
- Form state is synced to the URL query string so settings can be shared and restored with browser back/forward
- 3D preview uses [React Three Fiber](https://docs.pmnd.rs/react-three-fiber) (empty scene for now)

The overall layout and form patterns are based on [BoxBuilder](https://github.com/jackcannon/boxbuilder).

## Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| Width     | 330 mm  | Width of the pattern modifier |
| Height    | 325 mm  | Height of the pattern modifier |
| Depth     | 320 mm  | Depth of the pattern modifier |
| Overflow  | 1 mm    | How far the pattern extends beyond model bounds |

## Setup

Requires [Bun](https://bun.sh).

```bash
git clone https://github.com/jackcannon/pattern-modifiers.git
cd pattern-modifiers
bun install
bun run dev
```

Open [http://localhost:5173](http://localhost:5173).

## Scripts

| Command         | Description                    |
|-----------------|--------------------------------|
| `bun run dev`   | Start the Vite dev server      |
| `bun run build` | Type-check and production build |
| `bun run preview` | Serve the production build locally |

## Deployment

The app is set up for static deployment on [Dokku](https://dokku.com) using custom buildpacks (Bun build + nginx). Relevant files:

- `.buildpacks` — env, Bun, and nginx buildpacks
- `.dokku.env` — sets `NGINX_ROOT='dist'`
- `.static` — marks the app as a static site

Build output goes to `dist/`. Push to your Dokku remote to deploy:

```bash
git push <dokku-remote> master
```

## Project structure

```
src/
├── App.tsx              # Layout: sidebar + 3D view
├── useHistoryDoc.ts     # Form state + URL/history sync
├── form/                # Schema, form config, slider inputs
├── sidebar/             # Logo, form, footer
└── render/              # React Three Fiber canvas
public/
└── logo.svg             # App logo and favicon source
```
