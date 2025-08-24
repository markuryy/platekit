PlateKit - make sticker sheets with ease in your browser

# PlateKit - Vinyl Sticker Layout Tool - Feature Design Sheet

## Core Features

### 1. Canvas & Layout
- **Fixed-size canvases** (US Letter and A5 presets)
- **Accurate export scaling** to real physical dimensions

### 2. Image Handling
- **Drag & drop** image import
- **Drag images around** the canvas (like Microsoft figma)
- **Remove backgrounds** from images

### 3. Vector Processing
- **Extract outer contour vectors** for cutting paths
- **Generate alignment marks** for printer and plotter registration

### 4. Export
- **Print-ready output** with cut paths
- **Vinyl plotter compatible** files

---

*Simple workflow: Drop images → Position → Remove backgrounds → Generate cut paths → Export with alignment marks*

sveltekit bun app

to run dev server:

```zsh
bun run dev
```

to add shadcn-svelte components:

```zsh
bun x shadcn-svelte@latest add button
```

The command above will add the Button component to your project. You can then import it like this:

```svelte
<script lang="ts">
 import { Button } from "$lib/components/ui/button/index.js";
</script>
 
<Button>Click me</Button>
```