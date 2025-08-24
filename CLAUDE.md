# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

PlateKit is a vinyl sticker layout tool built with SvelteKit that allows users to create sticker sheets in their browser. The application focuses on drag-and-drop image handling, background removal, vector processing for cutting paths, and export functionality for both printing and vinyl plotting.

## Development Commands

- **Start dev server**: `bun run dev`
- **Build project**: `bun run build` 
- **Preview build**: `bun run preview`
- **Type checking**: `bun run check`
- **Watch mode type checking**: `bun run check:watch`
- **Linting**: `bun run lint`
- **Add shadcn-svelte components**: `bun x shadcn-svelte@latest add [component-name]`

## Architecture & Tech Stack

### Core Technologies
- **SvelteKit**: Full-stack framework with Svelte 5 (using new runes syntax)
- **Bun**: Runtime and package manager
- **TypeScript**: Strict type checking enabled
- **Tailwind CSS**: Styling with Tailwind CSS v4 and various plugins
- **shadcn-svelte**: UI component library for consistent design system

### Project Structure
```
src/
├── lib/
│   ├── components/ui/    # shadcn-svelte components
│   ├── hooks/            # Custom hooks
│   ├── assets/           # Static assets like favicon
│   └── utils.ts          # Utility functions (cn helper, type utilities)
├── routes/               # SvelteKit file-based routing
└── app.html              # HTML template
```

### Key Configuration
- **ESLint**: Modern flat config with TypeScript and Svelte support
- **Components**: shadcn-svelte configured with slate base color
- **Path aliases**: `$lib` for src/lib, configured in both SvelteKit and shadcn-svelte
- **Tailwind**: Integrated via Vite plugin with forms, typography, and animation extensions

## Component Patterns

### shadcn-svelte Components
- Components use Svelte 5 runes syntax (`$props()`, `$bindable()`)
- Tailwind variants with `tailwind-variants` library for consistent styling
- Type-safe props with TypeScript interfaces extending HTML element attributes
- Support for both button and anchor elements where applicable
- Import components from `$lib/components/ui/[component]/index.js`

### Utility Functions
- `cn()`: Tailwind class merging utility using clsx and tailwind-merge
- Type helpers for element refs and removing child props from component interfaces

## Core Features (from README)

1. **Canvas & Layout**: Fixed-size canvases (US Letter, A5) with accurate export scaling
2. **Image Handling**: Drag & drop import, positioning, background removal  
3. **Vector Processing**: Extract outer contour vectors, generate alignment marks
4. **Export**: Print-ready output with cut paths, vinyl plotter compatible files

The workflow is: Drop images → Position → Remove backgrounds → Generate cut paths → Export with alignment marks