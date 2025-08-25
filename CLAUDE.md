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
- **jsPDF**: PDF generation library for high-quality raster exports
- **Paper.js**: Vector graphics library for path operations and tracing

### Project Structure
```
src/
├── lib/
│   ├── components/
│   │   ├── ui/           # shadcn-svelte components (button, menubar, etc.)
│   │   └── Canvas.svelte # Main canvas component with drag/drop, layer management
│   ├── export.ts         # PDF and SVG export functions
│   ├── page-sizes.ts     # Page size definitions (US Letter, A4, A5)
│   ├── tracing.ts        # Image tracing and vector generation
│   ├── pathfinder.ts     # Vector path operations (union, offset, etc.)
│   ├── types.ts          # TypeScript type definitions
│   └── utils.ts          # Utility functions (cn helper, type utilities)
├── routes/
│   └── +page.svelte      # Main application with menubar toolbar
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
- Page size management with `getPageSizeInfo()` for consistent dimensions
- Export utilities for PDF (raster) and SVG (vector) generation

## Core Features (from README)

1. **Canvas & Layout**: Fixed-size canvases (US Letter, A4, A5) with accurate export scaling
2. **Image Handling**: Drag & drop import, positioning, layer management with z-index
3. **Vector Processing**: Image tracing to extract contour vectors, offset tools for vinyl cutting
4. **Layer System**: Print layers (raster images) and Cut layers (vector paths) with visibility controls
5. **Export**: 
   - **PDF Export**: High-resolution raster output (300 DPI) for printing
   - **SVG Export**: Pure vector cut paths for vinyl plotters (no raster data)
6. **Toolbar**: Professional menubar with File menu (export options) and Page Size selection

The workflow is: Drop images → Position/scale → Generate cut paths → Adjust offsets → Export for print (PDF) and cutting (SVG)

## Current Implementation Status

### Completed Features
- **Responsive Canvas**: Pan, zoom, drag-and-drop image import
- **Layer Management**: Print/Cut layer system with visibility toggles, z-index controls
- **Image Tracing**: Convert raster images to vector cut paths using potrace
- **Vector Tools**: Offset adjustment for vinyl cutting tolerances
- **Shape Consolidation**: Union multiple vector contours with interactive selection
- **Professional Toolbar**: Menubar with File and Page Size menus
- **Export System**: 
  - PDF export (300 DPI raster for printing)
  - SVG export (pure vector paths for cutting)
- **Multi-format Support**: US Letter, A4, and A5 page sizes
- **Transform Tools**: Move, resize, rotate layers with handles

### Key Data Structures
```typescript
interface Layer {
  id: string;
  name: string;
  type: 'print' | 'cut';
  visible: boolean;
  image?: HTMLImageElement;
  vectorPaths?: VectorPath[];    // Only for cut layers
  offset?: number;               // Offset in mm for cutting
  x, y, width, height: number;   // Position and size
  rotation: number;              // In degrees
  scaleX, scaleY: number;        // Transform scaling
  opacity: number;               // 0-1
  zIndex: number;                // Layer order
}

interface VectorPath {
  id: string;
  points: { x: number; y: number }[];
  closed: boolean;
  holes?: VectorPath[];          // For complex shapes
}
```

### Page Size System
- All dimensions stored in points (72 DPI) for consistent scaling
- Canvas renders with viewport scaling for display
- Export functions handle DPI conversion (300 DPI for PDF, vector for SVG)
- Status bar shows current page size and zoom level

### Future Considerations
- Import/Save project functionality (serializable format)
- Additional vector operations (subtract, intersect, exclude)
- Custom page size support
- Batch export capabilities