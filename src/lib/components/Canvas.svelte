<script lang="ts">
	import { onMount } from 'svelte';
	import type { Layer, SelectionState, VectorPath } from '$lib/types';
	import { offsetVectorPath, reducePoints } from '$lib/tracing';
	import { unite } from '$lib/pathfinder';

	interface CanvasProps {
		sheetSize?: 'us-letter' | 'a5';
		scale?: number;
		layers?: Layer[];
		selectedLayerIds?: string[];
		isShapeToolActive?: boolean;
		onViewportScaleChange?: (scale: number) => void;
		onLayerAdd?: (layer: Layer) => void;
		onLayerUpdate?: (layerId: string, updates: Partial<Layer>) => void;
		onSelectionChange?: (selectedIds: string[]) => void;
		onShapeSelection?: (selectionBox: {x: number, y: number, width: number, height: number}) => void;
	}

	let {
		sheetSize = 'us-letter',
		scale = 1,
		layers = [] as Layer[],
		selectedLayerIds = [] as string[],
		isShapeToolActive = false,
		onViewportScaleChange,
		onLayerAdd,
		onLayerUpdate,
		onSelectionChange,
		onShapeSelection
	}: CanvasProps = $props();

	// Viewport state for pan and zoom
	let viewportScale = $state(scale);
	let viewportX = $state(0);
	let viewportY = $state(0);
	let isDragging = $state(false);
	let lastMouseX = $state(0);
	let lastMouseY = $state(0);

	// Drag and drop state
	let isDragOver = $state(false);

	// Selection and transform state
	let selectionState = $state<SelectionState>({
		selectedLayerIds: [],
		isTransforming: false,
		transformType: null,
		transformHandle: null
	});

	// Layer interaction state
	let isDraggingLayer = $state(false);
	let dragOffset = $state({ x: 0, y: 0 });
	let layerDragStartPos = $state({ x: 0, y: 0 });
	let isResizing = $state(false);
	let resizeHandle = $state<string | null>(null);
	let isRotating = $state(false);
	let rotationStartAngle = $state(0);
	let layerStartTransform = $state({ x: 0, y: 0, width: 0, height: 0, rotation: 0 });

	// Shape tool state
	let isShapeBuilding = $state(false);
	let shapeBuildPath = $state<{x: number, y: number}[]>([]);
	let highlightedContours = $state<Set<number>>(new Set());

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

	/**
	 * Draw vector paths as dashed strokes
	 * Now uses direct coordinate mapping from image coordinates to layer dimensions
	 */
	function drawVectorPaths(context: CanvasRenderingContext2D, vectorPaths: VectorPath[], layerWidth: number, layerHeight: number, imageWidth: number, imageHeight: number) {
		// Set up stroke style for cut lines
		context.strokeStyle = '#ef4444'; // Red color for cut lines
		context.lineWidth = 2;
		context.setLineDash([5, 5]); // Dashed line
		context.lineCap = 'round';
		context.lineJoin = 'round';
		
		vectorPaths.forEach(path => {
			if (path.points.length < 2) return;
			
			context.beginPath();
			
			// Scale points directly from image coordinates to layer dimensions
			// This maintains the proper alignment with the image
			const scaledPoints = path.points.map(point => ({
				x: (point.x / imageWidth) * layerWidth,
				y: (point.y / imageHeight) * layerHeight
			}));
			
			// Move to first point
			context.moveTo(scaledPoints[0].x, scaledPoints[0].y);
			
			// Draw lines to subsequent points
			for (let i = 1; i < scaledPoints.length; i++) {
				context.lineTo(scaledPoints[i].x, scaledPoints[i].y);
			}
			
			// Close path if specified
			if (path.closed) {
				context.closePath();
			}
			
			context.stroke();
		});
		
		// Reset line dash
		context.setLineDash([]);
	}

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

		// Draw layers (sorted by zIndex)
		const sortedLayers = [...layers].sort((a, b) => a.zIndex - b.zIndex);
		sortedLayers.forEach(layer => {
			if (!layer.visible || !context) return;
			
			const layerX = layer.x * viewportScale;
			const layerY = layer.y * viewportScale;
			const layerWidth = layer.width * viewportScale;
			const layerHeight = layer.height * viewportScale;
			
			// Apply transforms
			context.save();
			
			// Set opacity
			context.globalAlpha = layer.opacity;
			
			// Apply rotation and scaling
			const centerX = layerX + layerWidth / 2;
			const centerY = layerY + layerHeight / 2;
			
			context.translate(centerX, centerY);
			context.rotate((layer.rotation * Math.PI) / 180);
			context.scale(layer.scaleX, layer.scaleY);
			context.translate(-layerWidth / 2, -layerHeight / 2);
			
			if (layer.type === 'print' && layer.image) {
				// Draw raster image
				context.drawImage(layer.image, 0, 0, layerWidth, layerHeight);
			} else if (layer.type === 'cut' && layer.vectorPaths && layer.image) {
				// Apply offset if specified and draw vector paths as dashed strokes
				let pathsToRender = layer.vectorPaths;
				if (layer.offset && layer.offset !== 0) {
					// Convert offset from mm to image pixels
					// At 72 DPI: 1 mm = 72/25.4 ≈ 2.83465 points
					// Scale to image resolution: points * (imageWidth / layerWidth)
					const mmToPoints = 72 / 25.4; // Convert mm to points (1mm = ~2.83 points)
					const imageScale = layer.image.naturalWidth / layer.width; // Scale factor from display to image pixels
					const offsetInImagePixels = layer.offset * mmToPoints * imageScale; // Preserve sign for inward/outward
					
					// Apply point reduction before offsetting for cleaner results
					const reducedPaths = layer.vectorPaths.map(path => 
						reducePoints(path, (layer.traceParameters?.pointReduction || 0.5) * imageScale)
					);
					pathsToRender = reducedPaths.map(path => offsetVectorPath(path, offsetInImagePixels));
				}
				drawVectorPaths(context, pathsToRender, layerWidth, layerHeight, layer.image.naturalWidth, layer.image.naturalHeight);
			}
			
			context.restore();
		});

		// Draw selection indicators
		selectionState.selectedLayerIds.forEach(layerId => {
			const layer = layers.find(l => l.id === layerId);
			if (!layer || !layer.visible || !context) return;
			
			const layerX = layer.x * viewportScale;
			const layerY = layer.y * viewportScale;
			const layerWidth = layer.width * viewportScale;
			const layerHeight = layer.height * viewportScale;
			
			// Draw selection rectangle
			context.strokeStyle = '#3b82f6';
			context.lineWidth = 2;
			context.setLineDash([5, 5]);
			context.strokeRect(layerX - 2, layerY - 2, layerWidth + 4, layerHeight + 4);
			context.setLineDash([]);
			
			// Draw resize handles (corners and edges)
			const handleSize = 8;
			const handles = [
				// Corners
				{ x: layerX - handleSize / 2, y: layerY - handleSize / 2 }, // top-left
				{ x: layerX + layerWidth - handleSize / 2, y: layerY - handleSize / 2 }, // top-right
				{ x: layerX - handleSize / 2, y: layerY + layerHeight - handleSize / 2 }, // bottom-left
				{ x: layerX + layerWidth - handleSize / 2, y: layerY + layerHeight - handleSize / 2 }, // bottom-right
				// Edges
				{ x: layerX + layerWidth / 2 - handleSize / 2, y: layerY - handleSize / 2 }, // top-center
				{ x: layerX + layerWidth / 2 - handleSize / 2, y: layerY + layerHeight - handleSize / 2 }, // bottom-center
				{ x: layerX - handleSize / 2, y: layerY + layerHeight / 2 - handleSize / 2 }, // left-center
				{ x: layerX + layerWidth - handleSize / 2, y: layerY + layerHeight / 2 - handleSize / 2 } // right-center
			];
			
			context.fillStyle = '#3b82f6';
			context.strokeStyle = '#ffffff';
			context.lineWidth = 2;
			
			handles.forEach(handle => {
				if (!context) return;
				context.fillRect(handle.x, handle.y, handleSize, handleSize);
				context.strokeRect(handle.x, handle.y, handleSize, handleSize);
			});
			
			// Draw rotation handle (above the top edge)
			const rotationHandleY = layerY - 30;
			const rotationHandleX = layerX + layerWidth / 2;
			
			// Draw connection line
			context.beginPath();
			context.moveTo(layerX + layerWidth / 2, layerY - handleSize / 2);
			context.lineTo(rotationHandleX, rotationHandleY + handleSize / 2);
			context.strokeStyle = '#3b82f6';
			context.lineWidth = 1;
			context.stroke();
			
			// Draw rotation handle
			context.beginPath();
			context.arc(rotationHandleX, rotationHandleY, handleSize / 2, 0, 2 * Math.PI);
			context.fillStyle = '#3b82f6';
			context.fill();
			context.strokeStyle = '#ffffff';
			context.lineWidth = 2;
			context.stroke();
		});

		// Draw drag over indication
		if (isDragOver) {
			context.strokeStyle = '#3b82f6';
			context.lineWidth = 3;
			context.setLineDash([10, 5]);
			context.strokeRect(5, 5, scaledWidth - 10, scaledHeight - 10);
			context.setLineDash([]);
		}

		// Draw shape builder path and highlights
		if (isShapeToolActive && selectedLayerIds.length > 0) {
			const selectedLayer = layers.find(l => l.id === selectedLayerIds[0]);
			if (selectedLayer && selectedLayer.type === 'cut' && selectedLayer.vectorPaths) {
				// Get the same offset paths used for hit detection
				let pathsToRender = selectedLayer.vectorPaths;
				if (selectedLayer.offset && selectedLayer.offset !== 0) {
					const mmToPoints = 72 / 25.4;
					const imageScale = selectedLayer.image?.naturalWidth ? selectedLayer.image.naturalWidth / selectedLayer.width : 1;
					const offsetInImagePixels = selectedLayer.offset * mmToPoints * imageScale; // Preserve sign
					
					pathsToRender = selectedLayer.vectorPaths.map(path => offsetVectorPath(path, offsetInImagePixels));
				}
				
				// Draw highlighted contours using the same coordinate system
				pathsToRender.forEach((contour, index) => {
					if (highlightedContours.has(index)) {
						context.fillStyle = 'rgba(16, 185, 129, 0.3)';
						context.strokeStyle = '#10b981';
						context.lineWidth = 3;
						
						// Draw filled contour using the SAME coordinate conversion as hit detection
						context.beginPath();
						const renderedPoints = contour.points.map(point => ({
							x: ((point.x / (selectedLayer.image?.naturalWidth || 1)) * selectedLayer.width + selectedLayer.x) * viewportScale,
							y: ((point.y / (selectedLayer.image?.naturalHeight || 1)) * selectedLayer.height + selectedLayer.y) * viewportScale
						}));
						
						if (renderedPoints.length > 0) {
							context.moveTo(renderedPoints[0].x, renderedPoints[0].y);
							for (let i = 1; i < renderedPoints.length; i++) {
								context.lineTo(renderedPoints[i].x, renderedPoints[i].y);
							}
							if (contour.closed) context.closePath();
						}
						
						context.fill();
						context.stroke();
					}
				});
			}
		}

		// Draw shape building path
		if (shapeBuildPath.length > 1) {
			context.strokeStyle = '#10b981';
			context.lineWidth = 3;
			context.lineCap = 'round';
			context.lineJoin = 'round';
			
			context.beginPath();
			const startPoint = shapeBuildPath[0];
			context.moveTo(startPoint.x * viewportScale, startPoint.y * viewportScale);
			
			for (let i = 1; i < shapeBuildPath.length; i++) {
				const point = shapeBuildPath[i];
				context.lineTo(point.x * viewportScale, point.y * viewportScale);
			}
			
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
			isDragging = true;
			lastMouseX = event.clientX;
			lastMouseY = event.clientY;
			canvasElement.style.cursor = 'grabbing';
			
			// Add global listeners for drag operation
			document.addEventListener('mousemove', handleGlobalMouseMove);
			document.addEventListener('mouseup', handleGlobalMouseUp);
			return;
		}

		// Handle shape tool
		if (event.button === 0 && isShapeToolActive) {
			const rect = canvasElement.getBoundingClientRect();
			const mouseX = event.clientX - rect.left;
			const mouseY = event.clientY - rect.top;
			
			// Convert to sheet coordinates
			const sheetX = (mouseX - viewportX) / viewportScale;
			const sheetY = (mouseY - viewportY) / viewportScale;
			
			isShapeBuilding = true;
			shapeBuildPath = [{ x: sheetX, y: sheetY }];
			highlightedContours = new Set();
			
			// Add global listeners for shape building
			document.addEventListener('mousemove', handleShapeBuildMouseMove);
			document.addEventListener('mouseup', handleShapeBuildMouseUp);
			return;
		}

		// Handle layer selection and dragging with left click
		if (event.button === 0) {
			const rect = canvasElement.getBoundingClientRect();
			const mouseX = event.clientX - rect.left;
			const mouseY = event.clientY - rect.top;
			
			// Convert to sheet coordinates
			const sheetX = (mouseX - viewportX) / viewportScale;
			const sheetY = (mouseY - viewportY) / viewportScale;
			
			// First check if we hit any handles on selected layers
			let hitHandle: string | null = null;
			let hitLayer: Layer | null = null;
			
			// Check handles on selected layers first
			for (const layerId of selectionState.selectedLayerIds) {
				const layer = layers.find(l => l.id === layerId);
				if (layer && layer.visible) {
					hitHandle = getHitHandle(sheetX, sheetY, layer);
					if (hitHandle) {
						hitLayer = layer;
						break;
					}
				}
			}
			
			if (hitHandle && hitLayer) {
				// Start handle interaction
				if (hitHandle === 'rotate') {
					isRotating = true;
					const centerX = hitLayer.x + hitLayer.width / 2;
					const centerY = hitLayer.y + hitLayer.height / 2;
					rotationStartAngle = Math.atan2(sheetY - centerY, sheetX - centerX) * (180 / Math.PI);
					layerStartTransform = {
						x: hitLayer.x,
						y: hitLayer.y,
						width: hitLayer.width,
						height: hitLayer.height,
						rotation: hitLayer.rotation
					};
				} else {
					isResizing = true;
					resizeHandle = hitHandle;
					layerStartTransform = {
						x: hitLayer.x,
						y: hitLayer.y,
						width: hitLayer.width,
						height: hitLayer.height,
						rotation: hitLayer.rotation
					};
					dragOffset.x = sheetX;
					dragOffset.y = sheetY;
				}
				
				selectionState.isTransforming = true;
				selectionState.transformType = hitHandle === 'rotate' ? 'rotate' : 'resize';
				selectionState.transformHandle = hitHandle;
				
				// Add global listeners for transform
				document.addEventListener('mousemove', handleTransformMouseMove);
				document.addEventListener('mouseup', handleTransformMouseUp);
			} else {
				// Hit test layers (reverse order to check top layers first)
				const clickedLayer = getHitLayer(sheetX, sheetY);
				
				if (clickedLayer) {
					// Start dragging layer
					isDraggingLayer = true;
					const layerCenterX = clickedLayer.x + clickedLayer.width / 2;
					const layerCenterY = clickedLayer.y + clickedLayer.height / 2;
					dragOffset.x = sheetX - layerCenterX;
					dragOffset.y = sheetY - layerCenterY;
					layerDragStartPos.x = clickedLayer.x;
					layerDragStartPos.y = clickedLayer.y;
					
					// Update selection
					if (!event.shiftKey) {
						selectionState.selectedLayerIds = [clickedLayer.id];
					} else {
						// Toggle selection with shift
						const isSelected = selectionState.selectedLayerIds.includes(clickedLayer.id);
						if (isSelected) {
							selectionState.selectedLayerIds = selectionState.selectedLayerIds.filter(id => id !== clickedLayer.id);
						} else {
							selectionState.selectedLayerIds = [...selectionState.selectedLayerIds, clickedLayer.id];
						}
					}
					
					onSelectionChange?.(selectionState.selectedLayerIds);
					
					// Add global listeners for layer drag
					document.addEventListener('mousemove', handleLayerMouseMove);
					document.addEventListener('mouseup', handleLayerMouseUp);
				} else {
					// Click on empty area - clear selection
					selectionState.selectedLayerIds = [];
					onSelectionChange?.([]);
				}
			}
			
			drawSheet();
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

	// Hit testing for layers
	function getHitLayer(sheetX: number, sheetY: number): Layer | null {
		// Sort layers by zIndex (descending) to check top layers first
		const sortedLayers = [...layers].sort((a, b) => b.zIndex - a.zIndex);
		
		for (const layer of sortedLayers) {
			if (!layer.visible || !layer.image) continue;
			
			// Simple bounding box hit test
			if (sheetX >= layer.x && sheetX <= layer.x + layer.width &&
				sheetY >= layer.y && sheetY <= layer.y + layer.height) {
				return layer;
			}
		}
		
		return null;
	}

	// Handle hit testing
	function getHitHandle(sheetX: number, sheetY: number, layer: Layer): string | null {
		const handleSize = 8 / viewportScale; // Convert to sheet coordinates
		const tolerance = handleSize;
		
		// Check rotation handle first (above the layer)
		const rotationHandleX = layer.x + layer.width / 2;
		const rotationHandleY = layer.y - 30 / viewportScale;
		
		if (Math.abs(sheetX - rotationHandleX) <= tolerance && Math.abs(sheetY - rotationHandleY) <= tolerance) {
			return 'rotate';
		}
		
		// Check resize handles
		const handles = [
			{ id: 'nw', x: layer.x, y: layer.y }, // top-left
			{ id: 'ne', x: layer.x + layer.width, y: layer.y }, // top-right
			{ id: 'sw', x: layer.x, y: layer.y + layer.height }, // bottom-left
			{ id: 'se', x: layer.x + layer.width, y: layer.y + layer.height }, // bottom-right
			{ id: 'n', x: layer.x + layer.width / 2, y: layer.y }, // top-center
			{ id: 's', x: layer.x + layer.width / 2, y: layer.y + layer.height }, // bottom-center
			{ id: 'w', x: layer.x, y: layer.y + layer.height / 2 }, // left-center
			{ id: 'e', x: layer.x + layer.width, y: layer.y + layer.height / 2 } // right-center
		];
		
		for (const handle of handles) {
			if (Math.abs(sheetX - handle.x) <= tolerance && Math.abs(sheetY - handle.y) <= tolerance) {
				return handle.id;
			}
		}
		
		return null;
	}

	// Layer dragging handlers
	function handleLayerMouseMove(event: MouseEvent) {
		if (!isDraggingLayer || selectionState.selectedLayerIds.length === 0) return;
		
		const rect = canvasElement.getBoundingClientRect();
		const mouseX = event.clientX - rect.left;
		const mouseY = event.clientY - rect.top;
		
		// Convert to sheet coordinates
		const sheetX = (mouseX - viewportX) / viewportScale;
		const sheetY = (mouseY - viewportY) / viewportScale;
		
		// Update position for all selected layers
		const deltaX = sheetX - dragOffset.x - (layerDragStartPos.x + layers.find(l => l.id === selectionState.selectedLayerIds[0])!.width / 2);
		const deltaY = sheetY - dragOffset.y - (layerDragStartPos.y + layers.find(l => l.id === selectionState.selectedLayerIds[0])!.height / 2);
		
		for (const layerId of selectionState.selectedLayerIds) {
			const layer = layers.find(l => l.id === layerId);
			if (layer) {
				const newX = Math.max(0, Math.min(layer.x + deltaX, sheetDimensions.width - layer.width));
				const newY = Math.max(0, Math.min(layer.y + deltaY, sheetDimensions.height - layer.height));
				
				onLayerUpdate?.(layerId, { x: newX, y: newY });
			}
		}
		
		// Update drag start position for next frame
		if (selectionState.selectedLayerIds.length > 0) {
			const firstLayer = layers.find(l => l.id === selectionState.selectedLayerIds[0]);
			if (firstLayer) {
				layerDragStartPos.x = firstLayer.x;
				layerDragStartPos.y = firstLayer.y;
			}
		}
		
		drawSheet();
	}

	function handleLayerMouseUp() {
		isDraggingLayer = false;
		
		// Remove global listeners
		document.removeEventListener('mousemove', handleLayerMouseMove);
		document.removeEventListener('mouseup', handleLayerMouseUp);
	}

	// Transform handlers
	function handleTransformMouseMove(event: MouseEvent) {
		if ((!isResizing && !isRotating) || selectionState.selectedLayerIds.length === 0) return;
		
		const rect = canvasElement.getBoundingClientRect();
		const mouseX = event.clientX - rect.left;
		const mouseY = event.clientY - rect.top;
		
		// Convert to sheet coordinates
		const sheetX = (mouseX - viewportX) / viewportScale;
		const sheetY = (mouseY - viewportY) / viewportScale;
		
		const layerId = selectionState.selectedLayerIds[0]; // Transform first selected layer
		const layer = layers.find(l => l.id === layerId);
		if (!layer) return;
		
		if (isRotating) {
			// Handle rotation
			const centerX = layerStartTransform.x + layerStartTransform.width / 2;
			const centerY = layerStartTransform.y + layerStartTransform.height / 2;
			const currentAngle = Math.atan2(sheetY - centerY, sheetX - centerX) * (180 / Math.PI);
			const deltaAngle = currentAngle - rotationStartAngle;
			
			// Snap to 15-degree increments if shift is held
			let newRotation = layerStartTransform.rotation + deltaAngle;
			if (event.shiftKey) {
				newRotation = Math.round(newRotation / 15) * 15;
			}
			
			onLayerUpdate?.(layerId, { rotation: newRotation });
		} else if (isResizing && resizeHandle) {
			// Handle resizing
			const deltaX = sheetX - dragOffset.x;
			const deltaY = sheetY - dragOffset.y;
			
			let newX = layerStartTransform.x;
			let newY = layerStartTransform.y;
			let newWidth = layerStartTransform.width;
			let newHeight = layerStartTransform.height;
			
			// Maintain aspect ratio if shift is held
			const maintainAspect = event.shiftKey;
			const aspectRatio = layerStartTransform.width / layerStartTransform.height;
			
			switch (resizeHandle) {
				case 'nw': // top-left
					newX = layerStartTransform.x + deltaX;
					newY = layerStartTransform.y + deltaY;
					newWidth = layerStartTransform.width - deltaX;
					newHeight = layerStartTransform.height - deltaY;
					if (maintainAspect) {
						const avgDelta = (deltaX + deltaY) / 2;
						newX = layerStartTransform.x + avgDelta;
						newY = layerStartTransform.y + avgDelta;
						newWidth = layerStartTransform.width - avgDelta;
						newHeight = newWidth / aspectRatio;
					}
					break;
				case 'ne': // top-right
					newY = layerStartTransform.y + deltaY;
					newWidth = layerStartTransform.width + deltaX;
					newHeight = layerStartTransform.height - deltaY;
					if (maintainAspect) {
						const avgDelta = (deltaX - deltaY) / 2;
						newWidth = layerStartTransform.width + avgDelta;
						newHeight = newWidth / aspectRatio;
						newY = layerStartTransform.y - (newHeight - layerStartTransform.height);
					}
					break;
				case 'sw': // bottom-left
					newX = layerStartTransform.x + deltaX;
					newWidth = layerStartTransform.width - deltaX;
					newHeight = layerStartTransform.height + deltaY;
					if (maintainAspect) {
						const avgDelta = (-deltaX + deltaY) / 2;
						newWidth = layerStartTransform.width + avgDelta;
						newHeight = newWidth / aspectRatio;
						newX = layerStartTransform.x - (newWidth - layerStartTransform.width);
					}
					break;
				case 'se': // bottom-right
					newWidth = layerStartTransform.width + deltaX;
					newHeight = layerStartTransform.height + deltaY;
					if (maintainAspect) {
						const avgDelta = (deltaX + deltaY) / 2;
						newWidth = layerStartTransform.width + avgDelta;
						newHeight = newWidth / aspectRatio;
					}
					break;
				case 'n': // top-center
					newY = layerStartTransform.y + deltaY;
					newHeight = layerStartTransform.height - deltaY;
					if (maintainAspect) {
						newWidth = newHeight * aspectRatio;
						newX = layerStartTransform.x - (newWidth - layerStartTransform.width) / 2;
					}
					break;
				case 's': // bottom-center
					newHeight = layerStartTransform.height + deltaY;
					if (maintainAspect) {
						newWidth = newHeight * aspectRatio;
						newX = layerStartTransform.x - (newWidth - layerStartTransform.width) / 2;
					}
					break;
				case 'w': // left-center
					newX = layerStartTransform.x + deltaX;
					newWidth = layerStartTransform.width - deltaX;
					if (maintainAspect) {
						newHeight = newWidth / aspectRatio;
						newY = layerStartTransform.y - (newHeight - layerStartTransform.height) / 2;
					}
					break;
				case 'e': // right-center
					newWidth = layerStartTransform.width + deltaX;
					if (maintainAspect) {
						newHeight = newWidth / aspectRatio;
						newY = layerStartTransform.y - (newHeight - layerStartTransform.height) / 2;
					}
					break;
			}
			
			// Ensure minimum size
			newWidth = Math.max(10, newWidth);
			newHeight = Math.max(10, newHeight);
			
			// Constrain to canvas bounds
			newX = Math.max(0, Math.min(newX, sheetDimensions.width - newWidth));
			newY = Math.max(0, Math.min(newY, sheetDimensions.height - newHeight));
			
			onLayerUpdate?.(layerId, { x: newX, y: newY, width: newWidth, height: newHeight });
		}
		
		drawSheet();
	}

	function handleTransformMouseUp() {
		isResizing = false;
		isRotating = false;
		resizeHandle = null;
		selectionState.isTransforming = false;
		selectionState.transformType = null;
		selectionState.transformHandle = null;
		
		// Remove global listeners
		document.removeEventListener('mousemove', handleTransformMouseMove);
		document.removeEventListener('mouseup', handleTransformMouseUp);
	}

	// Shape building handlers
	function handleShapeBuildMouseMove(event: MouseEvent) {
		if (!isShapeBuilding) return;
		
		const rect = canvasElement.getBoundingClientRect();
		const mouseX = event.clientX - rect.left;
		const mouseY = event.clientY - rect.top;
		
		// Convert to sheet coordinates
		const sheetX = (mouseX - viewportX) / viewportScale;
		const sheetY = (mouseY - viewportY) / viewportScale;
		
		// Add point to build path
		shapeBuildPath = [...shapeBuildPath, { x: sheetX, y: sheetY }];
		
		// Check which contours the path intersects
		updateHighlightedContours(sheetX, sheetY);
		
		drawSheet();
	}

	function handleShapeBuildMouseUp() {
		if (isShapeBuilding && highlightedContours.size > 1 && onShapeSelection) {
			// Convert highlighted contour indices to the selection format expected by consolidateSelectedShapes
			consolidateHighlightedContours();
		}
		
		isShapeBuilding = false;
		shapeBuildPath = [];
		highlightedContours = new Set();
		
		// Remove global listeners
		document.removeEventListener('mousemove', handleShapeBuildMouseMove);
		document.removeEventListener('mouseup', handleShapeBuildMouseUp);
		
		drawSheet();
	}

	// Check if a point is inside a contour using ray casting algorithm
	function pointInContour(point: {x: number, y: number}, contour: VectorPath, layer: Layer): boolean {
		if (contour.points.length < 3) return false;
		
		// Convert contour points to layer coordinates
		const layerPoints = contour.points.map(p => ({
			x: (p.x / (layer.image?.naturalWidth || 1)) * layer.width,
			y: (p.y / (layer.image?.naturalHeight || 1)) * layer.height
		}));
		
		let inside = false;
		for (let i = 0, j = layerPoints.length - 1; i < layerPoints.length; j = i++) {
			if (((layerPoints[i].y > point.y) !== (layerPoints[j].y > point.y)) &&
				(point.x < (layerPoints[j].x - layerPoints[i].x) * (point.y - layerPoints[i].y) / (layerPoints[j].y - layerPoints[i].y) + layerPoints[i].x)) {
				inside = !inside;
			}
		}
		return inside;
	}

	function updateHighlightedContours(sheetX: number, sheetY: number) {
		if (selectedLayerIds.length === 0) return;
		
		const layer = layers.find(l => l.id === selectedLayerIds[0]);
		if (!layer || layer.type !== 'cut' || !layer.vectorPaths) return;
		
		// Get the actual paths being rendered (with offset applied if present)
		let pathsToCheck = layer.vectorPaths;
		if (layer.offset && layer.offset !== 0) {
			// Convert offset from mm to image pixels (same as rendering)
			const mmToPoints = 72 / 25.4;
			const imageScale = layer.image?.naturalWidth ? layer.image.naturalWidth / layer.width : 1;
			const offsetInImagePixels = layer.offset * mmToPoints * imageScale; // Preserve sign
			
			pathsToCheck = layer.vectorPaths.map(path => offsetVectorPath(path, offsetInImagePixels));
		}
		
		console.log('Checking point:', { sheetX, sheetY });
		console.log('Layer bounds:', { x: layer.x, y: layer.y, w: layer.width, h: layer.height });
		console.log('Total contours:', pathsToCheck.length);
		
		// Check each contour and its self-intersections
		pathsToCheck.forEach((contour, index) => {
			const hitResults = checkPointInContourAndLoops({ x: sheetX, y: sheetY }, contour, layer);
			if (hitResults.inMainShape || hitResults.inLoop) {
				console.log(`Contour ${index}: HIT (main: ${hitResults.inMainShape}, loop: ${hitResults.inLoop})`);
				highlightedContours.add(index);
			} else {
				console.log(`Contour ${index}: miss`);
			}
		});
		
		console.log('Highlighted contours:', Array.from(highlightedContours));
	}

	// Enhanced hit detection that considers self-intersecting loops
	function checkPointInContourAndLoops(point: {x: number, y: number}, contour: VectorPath, layer: Layer): {inMainShape: boolean, inLoop: boolean} {
		if (contour.points.length < 3) return { inMainShape: false, inLoop: false };
		
		// Convert contour points to screen coordinates
		const renderedPoints = contour.points.map(p => ({
			x: (p.x / (layer.image?.naturalWidth || 1)) * layer.width + layer.x,
			y: (p.y / (layer.image?.naturalHeight || 1)) * layer.height + layer.y
		}));
		
		// Check if point is inside the main contour
		const inMainShape = pointInPolygon(point, renderedPoints);
		
		// Check for self-intersections and loops
		const inLoop = checkPointInSelfIntersectionLoops(point, renderedPoints);
		
		return { inMainShape, inLoop };
	}

	// Ray casting algorithm for polygon containment
	function pointInPolygon(point: {x: number, y: number}, polygon: {x: number, y: number}[]): boolean {
		let inside = false;
		for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
			if (((polygon[i].y > point.y) !== (polygon[j].y > point.y)) &&
				(point.x < (polygon[j].x - polygon[i].x) * (point.y - polygon[i].y) / (polygon[j].y - polygon[i].y) + polygon[i].x)) {
				inside = !inside;
			}
		}
		return inside;
	}

	// Check if point is inside any loops created by self-intersections
	function checkPointInSelfIntersectionLoops(point: {x: number, y: number}, renderedPoints: {x: number, y: number}[]): boolean {
		const intersections = findSelfIntersections(renderedPoints);
		
		if (intersections.length === 0) return false;
		
		// For each intersection, try to trace potential loops
		for (const intersection of intersections) {
			if (isPointInIntersectionLoop(point, intersection, renderedPoints)) {
				return true;
			}
		}
		
		return false;
	}

	// Find self-intersections in the path
	function findSelfIntersections(points: {x: number, y: number}[]): {x: number, y: number, seg1: number, seg2: number}[] {
		const intersections: {x: number, y: number, seg1: number, seg2: number}[] = [];
		
		for (let i = 0; i < points.length - 1; i++) {
			for (let j = i + 2; j < points.length - 1; j++) {
				// Don't check adjacent segments or the closing segment
				if (Math.abs(i - j) <= 1 || (i === 0 && j === points.length - 2)) continue;
				
				const intersection = lineSegmentIntersection(
					points[i], points[i + 1],
					points[j], points[j + 1]
				);
				
				if (intersection) {
					intersections.push({ ...intersection, seg1: i, seg2: j });
				}
			}
		}
		
		return intersections;
	}

	// Find intersection between two line segments
	function lineSegmentIntersection(
		p1: {x: number, y: number}, p2: {x: number, y: number},
		p3: {x: number, y: number}, p4: {x: number, y: number}
	): {x: number, y: number} | null {
		const denom = (p1.x - p2.x) * (p3.y - p4.y) - (p1.y - p2.y) * (p3.x - p4.x);
		
		if (Math.abs(denom) < 1e-10) return null; // Parallel lines
		
		const t = ((p1.x - p3.x) * (p3.y - p4.y) - (p1.y - p3.y) * (p3.x - p4.x)) / denom;
		const u = -((p1.x - p2.x) * (p1.y - p3.y) - (p1.y - p2.y) * (p1.x - p3.x)) / denom;
		
		// Check if intersection is within both line segments
		if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
			return {
				x: p1.x + t * (p2.x - p1.x),
				y: p1.y + t * (p2.y - p1.y)
			};
		}
		
		return null;
	}

	// Check if point is inside a loop formed by self-intersection
	function isPointInIntersectionLoop(
		point: {x: number, y: number}, 
		intersection: {x: number, y: number, seg1: number, seg2: number}, 
		points: {x: number, y: number}[]
	): boolean {
		// Create a sub-path from the intersection point around the loop
		const loopPoints: {x: number, y: number}[] = [];
		
		// Add intersection point
		loopPoints.push(intersection);
		
		// Add points from seg1+1 to seg2
		for (let i = intersection.seg1 + 1; i <= intersection.seg2; i++) {
			loopPoints.push(points[i]);
		}
		
		// Close the loop back to intersection
		loopPoints.push(intersection);
		
		// Check if point is inside this loop
		return pointInPolygon(point, loopPoints);
	}

	// Check if a point is inside a contour using the same coordinate system as rendering
	function pointInRenderedContour(point: {x: number, y: number}, contour: VectorPath, layer: Layer): boolean {
		if (contour.points.length < 3) return false;
		
		// Convert contour points to screen coordinates (same as drawVectorPaths)
		const renderedPoints = contour.points.map(p => ({
			x: (p.x / (layer.image?.naturalWidth || 1)) * layer.width + layer.x,
			y: (p.y / (layer.image?.naturalHeight || 1)) * layer.height + layer.y
		}));
		
		// Ray casting algorithm
		let inside = false;
		for (let i = 0, j = renderedPoints.length - 1; i < renderedPoints.length; j = i++) {
			if (((renderedPoints[i].y > point.y) !== (renderedPoints[j].y > point.y)) &&
				(point.x < (renderedPoints[j].x - renderedPoints[i].x) * (point.y - renderedPoints[i].y) / (renderedPoints[j].y - renderedPoints[i].y) + renderedPoints[i].x)) {
				inside = !inside;
			}
		}
		return inside;
	}

	function consolidateHighlightedContours() {
		if (!selectedLayerIds[0] || highlightedContours.size < 2) {
			console.log('Not enough contours to consolidate:', highlightedContours.size);
			return;
		}
		
		const layer = layers.find(l => l.id === selectedLayerIds[0]);
		if (!layer || layer.type !== 'cut' || !layer.vectorPaths) {
			console.log('Invalid layer for consolidation');
			return;
		}
		
		console.log('Consolidating contours:', Array.from(highlightedContours));
		
		// Get the same offset paths used for hit detection and highlighting
		let pathsToConsolidate = layer.vectorPaths;
		if (layer.offset && layer.offset !== 0) {
			const mmToPoints = 72 / 25.4;
			const imageScale = layer.image?.naturalWidth ? layer.image.naturalWidth / layer.width : 1;
			const offsetInImagePixels = layer.offset * mmToPoints * imageScale; // Preserve sign
			
			pathsToConsolidate = layer.vectorPaths.map(path => offsetVectorPath(path, offsetInImagePixels));
		}
		
		// Get the highlighted contours (using offset paths)
		const selectedContours = Array.from(highlightedContours).map(index => pathsToConsolidate[index]);
		const remainingContours = pathsToConsolidate.filter((_, index) => !highlightedContours.has(index));
		
		try {
			console.log('Uniting', selectedContours.length, 'contours');
			const unitedContours = unite(selectedContours);
			console.log('Unite result:', unitedContours.length, 'contours');
			
			const newContours = [...remainingContours, ...unitedContours];
			console.log('Final contour count:', newContours.length);
			
			// Update the layer with the consolidated paths and reset offset since we've baked it in
			onLayerUpdate?.(selectedLayerIds[0], { vectorPaths: newContours, offset: 0 });
		} catch (error) {
			console.error('Shape consolidation failed:', error);
		}
	}

	// Drag and drop event handlers
	function handleDragOver(event: DragEvent) {
		event.preventDefault();
		isDragOver = true;
		drawSheet();
	}

	function handleDragLeave(event: DragEvent) {
		event.preventDefault();
		isDragOver = false;
		drawSheet();
	}

	async function handleDrop(event: DragEvent) {
		event.preventDefault();
		isDragOver = false;

		const files = event.dataTransfer?.files;
		if (!files || files.length === 0) return;

		const rect = canvasElement.getBoundingClientRect();
		const dropX = event.clientX - rect.left;
		const dropY = event.clientY - rect.top;

		// Convert screen coordinates to sheet coordinates
		const sheetX = (dropX - viewportX) / viewportScale;
		const sheetY = (dropY - viewportY) / viewportScale;

		let layerIndex = 0;
		for (const file of Array.from(files)) {
			if (!file.type.startsWith('image/')) continue;

			try {
				const image = await loadImage(file);
				const layerId = crypto.randomUUID();
				
				// Calculate initial size - fit within 200 points but maintain aspect ratio
				const maxSize = 200;
				const aspectRatio = image.width / image.height;
				let width = maxSize;
				let height = maxSize;
				
				if (aspectRatio > 1) {
					height = maxSize / aspectRatio;
				} else {
					width = maxSize * aspectRatio;
				}

				// Stagger the position slightly for multiple drops
				const offsetX = layerIndex * 20;
				const offsetY = layerIndex * 20;

				const newLayer: Layer = {
					id: layerId,
					name: file.name.replace(/\.[^/.]+$/, ''), // Remove file extension
					type: 'print',
					visible: true,
					image,
					x: Math.max(0, Math.min(sheetX - width / 2 + offsetX, sheetDimensions.width - width)),
					y: Math.max(0, Math.min(sheetY - height / 2 + offsetY, sheetDimensions.height - height)),
					width,
					height,
					rotation: 0,
					scaleX: 1,
					scaleY: 1,
					opacity: 1,
					zIndex: layers.length + layerIndex
				};

				onLayerAdd?.(newLayer);
				layerIndex++;
			} catch (error) {
				console.error('Failed to load image:', error);
			}
		}

		drawSheet();
	}

	function loadImage(file: File): Promise<HTMLImageElement> {
		return new Promise((resolve, reject) => {
			const image = new Image();
			const url = URL.createObjectURL(file);

			image.onload = () => {
				URL.revokeObjectURL(url);
				resolve(image);
			};

			image.onerror = () => {
				URL.revokeObjectURL(url);
				reject(new Error('Failed to load image'));
			};

			image.src = url;
		});
	}

	// Reset viewport when scale prop changes
	$effect(() => {
		viewportScale = scale;
		viewportX = 0;
		viewportY = 0;
	});

	// Sync selection state with props
	$effect(() => {
		selectionState.selectedLayerIds = selectedLayerIds;
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

	// Re-draw when scale or layers change
	$effect(() => {
		if (canvasElement && context) {
			drawSheet();
		}
	});

	$effect(() => {
		// Redraw when layers change
		if (layers && canvasElement && context) {
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
	ondragover={handleDragOver}
	ondragleave={handleDragLeave}
	ondrop={handleDrop}
></canvas>