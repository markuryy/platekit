<script lang="ts">
	import { onMount } from 'svelte';

	interface CanvasProps {
		width?: number;
		height?: number;
		sheetSize?: 'us-letter' | 'a5';
		scale?: number;
		onViewportScaleChange?: (scale: number) => void;
	}

	let {
		width = 800,
		height = 600,
		sheetSize = 'us-letter',
		scale = 1,
		onViewportScaleChange
	}: CanvasProps = $props();

	// Viewport state for pan and zoom
	let viewportScale = $state(scale);
	let viewportX = $state(0);
	let viewportY = $state(0);
	let isDragging = $state(false);
	let lastMouseX = $state(0);
	let lastMouseY = $state(0);

	let canvasElement: HTMLCanvasElement;
	let context: CanvasRenderingContext2D | null = null;

	// Sheet dimensions in points (72 DPI)
	const SHEET_DIMENSIONS = {
		'us-letter': { width: 612, height: 792 }, // 8.5" x 11"
		'a5': { width: 420, height: 595 } // A5 dimensions
	};

	const sheetDimensions = $derived(SHEET_DIMENSIONS[sheetSize]);
	const scaledWidth = $derived(sheetDimensions.width * viewportScale);
	const scaledHeight = $derived(sheetDimensions.height * viewportScale);

	function initializeCanvas() {
		if (!canvasElement) return;
		
		context = canvasElement.getContext('2d');
		if (!context) return;

		// Get parent container size
		const container = canvasElement.parentElement;
		if (!container) return;

		const containerRect = container.getBoundingClientRect();
		canvasElement.width = containerRect.width;
		canvasElement.height = containerRect.height;

		// Center the sheet initially
		viewportX = (canvasElement.width - scaledWidth) / 2;
		viewportY = (canvasElement.height - scaledHeight) / 2;

		// Clear and draw sheet background
		drawSheet();
	}

	function handleResize() {
		if (canvasElement) {
			initializeCanvas();
		}
	}

	function drawSheet() {
		if (!context) return;

		// Clear entire canvas
		context.clearRect(0, 0, canvasElement.width, canvasElement.height);

		// Save context and apply viewport transform
		context.save();
		context.translate(viewportX, viewportY);

		// Draw white background
		context.fillStyle = '#ffffff';
		context.fillRect(0, 0, scaledWidth, scaledHeight);

		// Draw border
		context.strokeStyle = '#e5e7eb';
		context.lineWidth = 2;
		context.strokeRect(1, 1, scaledWidth - 2, scaledHeight - 2);

		// Draw grid lines for alignment (light gray)
		context.strokeStyle = '#f3f4f6';
		context.lineWidth = 1;
		
		const gridSpacing = 20 * viewportScale;
		
		// Vertical lines
		for (let x = gridSpacing; x < scaledWidth; x += gridSpacing) {
			context.beginPath();
			context.moveTo(x, 0);
			context.lineTo(x, scaledHeight);
			context.stroke();
		}
		
		// Horizontal lines
		for (let y = gridSpacing; y < scaledHeight; y += gridSpacing) {
			context.beginPath();
			context.moveTo(0, y);
			context.lineTo(scaledWidth, y);
			context.stroke();
		}

		// Restore context
		context.restore();
	}

	// Mouse event handlers for pan and zoom
	function handleWheel(event: WheelEvent) {
		event.preventDefault();
		
		const zoomFactor = 1.1;
		const rect = canvasElement.getBoundingClientRect();
		const mouseX = event.clientX - rect.left;
		const mouseY = event.clientY - rect.top;

		// Calculate zoom
		const oldScale = viewportScale;
		if (event.deltaY < 0) {
			viewportScale = Math.min(viewportScale * zoomFactor, 3);
		} else {
			viewportScale = Math.max(viewportScale / zoomFactor, 0.1);
		}

		// Adjust pan to zoom around mouse position
		const scaleChange = viewportScale / oldScale;
		viewportX = mouseX - (mouseX - viewportX) * scaleChange;
		viewportY = mouseY - (mouseY - viewportY) * scaleChange;

		// Notify parent of scale change
		onViewportScaleChange?.(viewportScale);

		drawSheet();
	}

	function handleMouseDown(event: MouseEvent) {
		// Pan with middle mouse button or ctrl+left click
		if (event.button === 1 || (event.button === 0 && event.ctrlKey)) {
			event.preventDefault();
			console.log('Starting drag', { button: event.button, ctrlKey: event.ctrlKey });
			isDragging = true;
			lastMouseX = event.clientX;
			lastMouseY = event.clientY;
			canvasElement.style.cursor = 'grabbing';
			
			// Add global listeners for drag operation
			document.addEventListener('mousemove', handleGlobalMouseMove);
			document.addEventListener('mouseup', handleGlobalMouseUp);
		}
	}

	function handleGlobalMouseMove(event: MouseEvent) {
		if (isDragging) {
			const deltaX = event.clientX - lastMouseX;
			const deltaY = event.clientY - lastMouseY;
			
			viewportX += deltaX;
			viewportY += deltaY;
			
			lastMouseX = event.clientX;
			lastMouseY = event.clientY;
			
			console.log('Dragging', { deltaX, deltaY, viewportX, viewportY });
			drawSheet();
		}
	}

	function handleGlobalMouseUp() {
		if (isDragging) {
			isDragging = false;
			canvasElement.style.cursor = 'default';
			
			// Remove global listeners
			document.removeEventListener('mousemove', handleGlobalMouseMove);
			document.removeEventListener('mouseup', handleGlobalMouseUp);
		}
	}

	// Reset viewport when scale prop changes
	$effect(() => {
		viewportScale = scale;
		viewportX = 0;
		viewportY = 0;
	});

	onMount(() => {
		initializeCanvas();
		
		// Add resize observer to handle window/container resize
		const resizeObserver = new ResizeObserver(() => {
			handleResize();
		});
		
		if (canvasElement.parentElement) {
			resizeObserver.observe(canvasElement.parentElement);
		}
		
		return () => {
			resizeObserver.disconnect();
		};
	});

	// Re-draw when scale changes
	$effect(() => {
		if (canvasElement && context) {
			drawSheet();
		}
	});
</script>

<canvas
	bind:this={canvasElement}
	class="w-full h-full bg-gray-50 block"
	onwheel={handleWheel}
	onmousedown={handleMouseDown}
	oncontextmenu={(e) => e.preventDefault()}
></canvas>