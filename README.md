# PlateKit

Vinyl sticker sheet layout tool for the browser.

## Features

Drop images onto canvas. Position and scale them. Generate vector cut paths from images. Export to PDF for printing or SVG for vinyl plotters.

### Canvas
- Fixed page sizes (US Letter, A4, A5)
- Drag and drop image import
- Layer management with print/cut layer types
- Transform tools for positioning and scaling
- Client-side AI background removal with WebGPU acceleration

### Vector Processing
- Image tracing to extract cut contours
- Offset adjustment for cutting tolerances
- Shape consolidation for multiple contours
- Registration marks for alignment

### Export
- PDF export at 300 DPI for printing
- SVG export with vector paths only for cutting

## Usage

To run the development server:

```bash
bun run dev
```

To build the project:

```bash
bun run build
```

Workflow: Drop images → Remove background → Position → Generate cut paths → Adjust offsets → Add registration marks → Export

Known issues:
- Offset tool cannot reliably shrink
- Remove background has no loading state
- Missing keyboard shortcuts
- Missing multi-selection
- Uses Imperial units internally
- No ability to save state between sessions
- No ability to save session as a file
- Zoom percentage does not consider monitor DPI, thus the zoom % is rather arbitary.
- SVG exports contain the solid white page background
- No context menus