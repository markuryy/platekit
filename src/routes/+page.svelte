<script lang="ts">
	import Canvas from '$lib/components/Canvas.svelte';
	import type { Layer, PageSize, VectorPath } from '$lib/types';
	import { Button } from '$lib/components/ui/button';
	import { Separator } from '$lib/components/ui/separator';
	import * as Menubar from '$lib/components/ui/menubar';
	import { createCutLayerFromPrint } from '$lib/tracing';
	import { PAGE_SIZES } from '$lib/page-sizes';
	import { exportToPDF, exportToSVG, downloadBlob, downloadSVG } from '$lib/export';
	import { removeBackground } from '$lib/background-removal';
	import { serializeProject, deserializeProject, exportProjectFile, importProjectFile, validateProject } from '$lib/project';

	let selectedSheet: PageSize = $state('us-letter');
	let canvasScale = $state(0.5);
	let currentViewportScale = $state(0.5);
	let layers = $state<Layer[]>([]);
	let selectedLayerId = $state<string | null>(null);

	// Sorted layers for display (highest z-index first)
	const sortedLayers = $derived([...layers].sort((a, b) => b.zIndex - a.zIndex));

	function handleViewportScaleChange(scale: number) {
		currentViewportScale = scale;
	}

	function handleLayerAdd(layer: Layer) {
		layers = [...layers, layer];
		selectedLayerId = layer.id;
	}

	function handleLayerUpdate(layerId: string, updates: Partial<Layer>) {
		layers = layers.map(layer => 
			layer.id === layerId 
				? { ...layer, ...updates }
				: layer
		);
	}

	function handleSelectionChange(selectedIds: string[]) {
		selectedLayerId = selectedIds.length === 1 ? selectedIds[0] : null;
	}

	function toggleLayerVisibility(layerId: string) {
		layers = layers.map(layer => 
			layer.id === layerId 
				? { ...layer, visible: !layer.visible }
				: layer
		);
	}

	function selectLayer(layerId: string) {
		selectedLayerId = selectedLayerId === layerId ? null : layerId;
	}

	function deleteLayer(layerId: string) {
		layers = layers.filter(layer => layer.id !== layerId);
		if (selectedLayerId === layerId) {
			selectedLayerId = null;
		}
	}

	function moveLayerUp(layerId: string) {
		const layer = layers.find(l => l.id === layerId);
		if (!layer) return;
		
		// Find the layer directly above this one
		const layersAbove = layers.filter(l => l.zIndex > layer.zIndex);
		if (layersAbove.length === 0) return; // Already at top
		
		// Find the layer with the next highest z-index
		const nextLayer = layersAbove.reduce((prev, curr) => 
			curr.zIndex < prev.zIndex ? curr : prev
		);
		
		// Swap z-indices
		const tempZIndex = layer.zIndex;
		handleLayerUpdate(layerId, { zIndex: nextLayer.zIndex });
		handleLayerUpdate(nextLayer.id, { zIndex: tempZIndex });
	}

	function moveLayerDown(layerId: string) {
		const layer = layers.find(l => l.id === layerId);
		if (!layer) return;
		
		// Find the layer directly below this one
		const layersBelow = layers.filter(l => l.zIndex < layer.zIndex);
		if (layersBelow.length === 0) return; // Already at bottom
		
		// Find the layer with the next lowest z-index
		const nextLayer = layersBelow.reduce((prev, curr) => 
			curr.zIndex > prev.zIndex ? curr : prev
		);
		
		// Swap z-indices
		const tempZIndex = layer.zIndex;
		handleLayerUpdate(layerId, { zIndex: nextLayer.zIndex });
		handleLayerUpdate(nextLayer.id, { zIndex: tempZIndex });
	}

	async function generateOutline(layerId: string) {
		const layer = layers.find(l => l.id === layerId);
		if (!layer || layer.type !== 'print') return;
		
		try {
			const cutLayer = await createCutLayerFromPrint(layer);
			layers = [...layers, cutLayer];
			selectedLayerId = cutLayer.id;
		} catch (error) {
			console.error('Failed to generate outline:', error);
			// TODO: Show error message to user
		}
	}

	async function handleRemoveBackground(layerId: string) {
		const layer = layers.find(l => l.id === layerId);
		if (!layer || layer.type !== 'print' || !layer.image) return;
		
		try {
			const processedImage = await removeBackground(layer.image);
			handleLayerUpdate(layerId, { image: processedImage });
		} catch (error) {
			console.error('Failed to remove background:', error);
			// TODO: Show error message to user
		}
	}

	function handleOffsetChange(layerId: string, offset: number) {
		handleLayerUpdate(layerId, { offset });
	}

	// Shape consolidation tool
	let isShapeToolActive = $state(false);
	let shapeSelectionBox = $state<{x: number, y: number, width: number, height: number} | null>(null);

	function toggleShapeTool() {
		isShapeToolActive = !isShapeToolActive;
		if (!isShapeToolActive) {
			shapeSelectionBox = null;
		}
	}

	// Export functions
	async function handleExportRaster() {
		try {
			const pdfBlob = await exportToPDF({
				pageSize: selectedSheet,
				layers,
				dpi: 300
			});
			
			downloadBlob(pdfBlob, `platekit-${selectedSheet}-${Date.now()}.pdf`);
		} catch (error) {
			console.error('Failed to export raster:', error);
			// TODO: Show error message to user
		}
	}

	function handleExportVector() {
		try {
			const svg = exportToSVG({
				pageSize: selectedSheet,
				layers
			});
			
			downloadSVG(svg, `platekit-${selectedSheet}-${Date.now()}.svg`);
		} catch (error) {
			console.error('Failed to export vector:', error);
			// TODO: Show error message to user
		}
	}

	function handlePageSizeChange(newSize: PageSize) {
		selectedSheet = newSize;
	}

	// Project save/load functions
	async function handleSaveProject() {
		try {
			const canvasState = {
				zoom: currentViewportScale,
				selectedLayerId
			};
			
			const project = serializeProject(layers, selectedSheet, canvasState);
			exportProjectFile(project);
		} catch (error) {
			console.error('Failed to save project:', error);
			// TODO: Show error message to user
		}
	}

	async function handleLoadProject() {
		try {
			const project = await importProjectFile();
			
			if (!validateProject(project)) {
				throw new Error('Invalid project file format');
			}
			
			const { layers: newLayers, pageSize, canvasState, metadata } = await deserializeProject(project);
			
			// Update application state
			layers = newLayers;
			selectedSheet = pageSize;
			selectedLayerId = canvasState.selectedLayerId;
			// Note: We don't restore zoom level to avoid jarring user experience
			
			console.log(`Loaded project: ${metadata.name}`);
		} catch (error) {
			console.error('Failed to load project:', error);
			// TODO: Show error message to user
		}
	}

	// Registration marks creation
	function addRegistrationMarks() {
		const pageInfo = PAGE_SIZES[selectedSheet];
		const markSizeInMm = 5;
		const markSizeInPoints = (markSizeInMm / 25.4) * 72; // Convert mm to points (72 DPI)
		
		// Get highest z-index to put registration marks on top
		const maxZIndex = layers.length > 0 ? Math.max(...layers.map(l => l.zIndex)) : 0;
		
		// Create vector paths for the registration marks (black squares)
		const topLeftSquare: VectorPath = {
			id: crypto.randomUUID(),
			closed: true,
			points: [
				{ x: 0, y: 0 },
				{ x: markSizeInPoints, y: 0 },
				{ x: markSizeInPoints, y: markSizeInPoints },
				{ x: 0, y: markSizeInPoints }
			]
		};

		const bottomRightSquare: VectorPath = {
			id: crypto.randomUUID(),
			closed: true,
			points: [
				{ x: pageInfo.width - markSizeInPoints, y: pageInfo.height - markSizeInPoints },
				{ x: pageInfo.width, y: pageInfo.height - markSizeInPoints },
				{ x: pageInfo.width, y: pageInfo.height },
				{ x: pageInfo.width - markSizeInPoints, y: pageInfo.height }
			]
		};

		// Create vector (cut) layer
		const vectorLayer: Layer = {
			id: crypto.randomUUID(),
			name: 'Registration Marks (Vector)',
			type: 'cut',
			visible: true,
			vectorPaths: [topLeftSquare, bottomRightSquare],
			x: 0,
			y: 0,
			width: pageInfo.width,
			height: pageInfo.height,
			rotation: 0,
			scaleX: 1,
			scaleY: 1,
			opacity: 1,
			zIndex: maxZIndex + 2,
			offset: 0
		};

		// Create a canvas for the raster version
		const canvas = document.createElement('canvas');
		canvas.width = pageInfo.width;
		canvas.height = pageInfo.height;
		const ctx = canvas.getContext('2d')!;
		
		// Fill with transparent background
		ctx.clearRect(0, 0, canvas.width, canvas.height);
		
		// Draw black squares
		ctx.fillStyle = '#000000';
		
		// Top left square (exact corner)
		ctx.fillRect(0, 0, markSizeInPoints, markSizeInPoints);
		
		// Bottom right square (exact corner)
		ctx.fillRect(
			pageInfo.width - markSizeInPoints, 
			pageInfo.height - markSizeInPoints, 
			markSizeInPoints, 
			markSizeInPoints
		);

		// Convert canvas to image
		const img = new Image();
		img.onload = () => {
			// Create raster (print) layer
			const rasterLayer: Layer = {
				id: crypto.randomUUID(),
				name: 'Registration Marks (Print)',
				type: 'print',
				visible: true,
				image: img,
				x: 0,
				y: 0,
				width: pageInfo.width,
				height: pageInfo.height,
				rotation: 0,
				scaleX: 1,
				scaleY: 1,
				opacity: 1,
				zIndex: maxZIndex + 1
			};

			// Add both layers (vector goes on top)
			layers = [...layers, rasterLayer, vectorLayer];
		};
		
		img.src = canvas.toDataURL();
	}



</script>

<div class="flex flex-col h-screen bg-background">
	<!-- Top Toolbar -->
	<header class="border-b bg-background px-4 py-2">
		<div class="flex items-center justify-between">
			<div class="flex items-center gap-4">
				<h1 class="text-lg font-semibold">PlateKit</h1>
				
				<Separator orientation="vertical" class="h-6" />
				
				<Menubar.Root>
					<Menubar.Menu>
						<Menubar.Trigger>File</Menubar.Trigger>
						<Menubar.Content>
							<Menubar.Item onclick={handleExportRaster}>
								Export Raster (PDF)
							</Menubar.Item>
							<Menubar.Item onclick={handleExportVector}>
								Export Vector (SVG)
							</Menubar.Item>
							<Menubar.Separator />
							<Menubar.Item onclick={handleLoadProject}>
								Import Project...
							</Menubar.Item>
							<Menubar.Item onclick={handleSaveProject}>
								Save Project As...
							</Menubar.Item>
						</Menubar.Content>
					</Menubar.Menu>
					
					<Menubar.Menu>
						<Menubar.Trigger>Tools</Menubar.Trigger>
						<Menubar.Content>
							<Menubar.Item onclick={addRegistrationMarks}>
								Add Registration Marks
							</Menubar.Item>
						</Menubar.Content>
					</Menubar.Menu>
					
					<Menubar.Menu>
						<Menubar.Trigger>Page Size</Menubar.Trigger>
						<Menubar.Content>
							{#each Object.entries(PAGE_SIZES) as [key, info]}
								<Menubar.Item onclick={() => handlePageSizeChange(key as PageSize)}>
									<div class="flex items-center justify-between w-full">
										<span>{info.name}</span>
										<span class="text-xs text-muted-foreground ml-4">{info.displaySize}</span>
										{#if selectedSheet === key}
											<span class="ml-2">✓</span>
										{/if}
									</div>
								</Menubar.Item>
							{/each}
						</Menubar.Content>
					</Menubar.Menu>
				</Menubar.Root>
			</div>

			<div class="flex items-center gap-2">
				<!-- Space for future toolbar items -->
			</div>
		</div>
	</header>

	<!-- Main Content Area -->
	<div class="flex flex-1 overflow-hidden">
		<!-- Canvas Area -->
		<main class="flex-1 overflow-auto">
			<Canvas 
				sheetSize={selectedSheet} 
				scale={canvasScale}
				layers={layers}
				selectedLayerIds={selectedLayerId ? [selectedLayerId] : []}
				isShapeToolActive={isShapeToolActive}
				onViewportScaleChange={handleViewportScaleChange}
				onLayerAdd={handleLayerAdd}
				onLayerUpdate={handleLayerUpdate}
				onSelectionChange={handleSelectionChange}
				onShapeSelection={() => {}}
			/>
		</main>

		<!-- Right Sidebar -->
		<aside class="w-80 border-l bg-background flex flex-col">
			<!-- Layers Section (Top Half) -->
			<div class="flex-1 flex flex-col min-h-0">
				<div class="p-4 border-b">
					<h2 class="font-semibold text-sm">Layers</h2>
				</div>
				
				<!-- Layer List -->
				<div class="flex-1 overflow-auto">
					<div class="p-2 space-y-1">
						{#if layers.length === 0}
							<div class="p-4 text-center text-muted-foreground text-sm">
								<div class="mb-2">No layers yet</div>
								<div class="text-xs">Drag and drop images onto the canvas to create layers</div>
							</div>
						{/if}
						
						{#each sortedLayers as layer (layer.id)}
							<div
								role="button"
								tabindex="0"
								class="p-2 rounded hover:bg-muted/50 cursor-pointer border hover:border-border {selectedLayerId === layer.id ? 'bg-muted/30 border-border' : 'border-transparent'}"
								onclick={() => selectLayer(layer.id)}
								onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectLayer(layer.id); }}}
								aria-pressed={selectedLayerId === layer.id}
								aria-label="Select layer {layer.name}"
							>
								<div class="flex items-center justify-between">
									<div class="flex items-center gap-2 flex-1 min-w-0">
										<div class="w-3 h-3 rounded-sm flex-shrink-0 {layer.type === 'print' ? 'bg-green-500' : 'bg-red-500'}"></div>
										<span class="text-sm truncate" class:font-medium={selectedLayerId === layer.id} title={layer.name}>{layer.name}</span>
									</div>
									<div class="flex items-center gap-1">
										<span class="text-xs px-1.5 py-0.5 rounded {layer.type === 'print' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}">
											{layer.type === 'print' ? 'Print' : 'Cut'}
										</span>
										<button 
											class="text-muted-foreground hover:text-foreground"
											class:text-foreground={layer.visible}
											class:text-muted-foreground={!layer.visible}
											onclick={(e) => { e.stopPropagation(); toggleLayerVisibility(layer.id); }}
											aria-label={layer.visible ? 'Hide layer' : 'Show layer'}
										>
											{#if layer.visible}
												<svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
													<path d="M10 12a2 2 0 100-4 2 2 0 000 4z"></path>
													<path fill-rule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clip-rule="evenodd"></path>
												</svg>
											{:else}
												<svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
													<path fill-rule="evenodd" d="M3.707 2.293a1 1 0 00-1.414 1.414l14 14a1 1 0 001.414-1.414l-1.473-1.473A10.014 10.014 0 0019.542 10C18.268 5.943 14.478 3 10 3a9.958 9.958 0 00-4.512 1.074l-1.78-1.781zm4.261 4.26l1.514 1.515a2.003 2.003 0 012.45 2.45l1.514 1.514a4 4 0 00-5.478-5.478z" clip-rule="evenodd"></path>
													<path d="M12.454 16.697L9.75 13.992a4 4 0 01-3.742-3.741L2.335 6.578A9.98 9.98 0 00.458 10c1.274 4.057 5.065 7 9.542 7 .847 0 1.669-.105 2.454-.303z"></path>
												</svg>
											{/if}
										</button>
									</div>
								</div>
							</div>
						{/each}
					</div>
				</div>

				<!-- Basic Layer Actions -->
				<div class="p-4 border-t space-y-2">
					<div class="flex gap-2">
						<Button 
							variant="outline" 
							size="sm" 
							disabled={!selectedLayerId}
							onclick={() => selectedLayerId && moveLayerUp(selectedLayerId)}
							title="Move layer forward (towards top)"
						>
							↑
						</Button>
						<Button 
							variant="outline" 
							size="sm" 
							disabled={!selectedLayerId}
							onclick={() => selectedLayerId && moveLayerDown(selectedLayerId)}
							title="Move layer backward (towards bottom)"
						>
							↓
						</Button>
						<Button 
							variant="outline" 
							size="sm" 
							class="flex-1"
							disabled={!selectedLayerId}
							onclick={() => selectedLayerId && deleteLayer(selectedLayerId)}
						>
							Delete
						</Button>
					</div>
					<div class="text-xs text-muted-foreground text-center">
						{layers.length} layer{layers.length === 1 ? '' : 's'}
					</div>
				</div>
			</div>

			<!-- Contextual Actions Section (Bottom Half) -->
			<div class="flex-1 flex flex-col min-h-0 border-t">
				<div class="p-4 border-b">
					<h2 class="font-semibold text-sm">Actions</h2>
				</div>
				
				<div class="flex-1 overflow-auto p-4">
					{#if selectedLayerId}
						{@const selectedLayer = layers.find(l => l.id === selectedLayerId)}
						{#if selectedLayer}
							{#if selectedLayer.type === 'print'}
								<!-- Actions for print layers -->
								<div class="space-y-4">
									<div>
										<h3 class="text-sm font-medium mb-2">Print Layer Actions</h3>
										<div class="space-y-2">
											<Button 
												variant="outline" 
												size="sm"
												class="w-full"
												onclick={() => selectedLayerId && handleRemoveBackground(selectedLayerId)}
											>
												Remove Background
											</Button>
											<Button 
												variant="outline" 
												size="sm"
												class="w-full"
												onclick={() => selectedLayerId && generateOutline(selectedLayerId)}
											>
												Generate Outline
											</Button>
										</div>
									</div>
								</div>
							{:else if selectedLayer.type === 'cut'}
								<!-- Actions for cut layers -->
								<div class="space-y-4">
									<div>
										<h3 class="text-sm font-medium mb-2">Cut Layer Actions</h3>
										<div class="space-y-2">
											<label class="text-xs text-muted-foreground" for="offset-slider">
												Offset Distance (mm)
											</label>
											<input 
												id="offset-slider"
												type="range" 
												min="-5" 
												max="15" 
												step="0.1"
												value={selectedLayer.offset || 0}
												class="w-full"
												oninput={(e) => selectedLayerId && handleOffsetChange(selectedLayerId, parseFloat(e.currentTarget.value))}
											/>
											<div class="text-xs text-muted-foreground text-center">
												{(selectedLayer.offset || 0).toFixed(1)}mm
											</div>
										</div>
									</div>

									<!-- Shape Consolidation Tool -->
									<div>
										<h3 class="text-sm font-medium mb-2">Shape Tool</h3>
										<div class="text-xs text-muted-foreground mb-2">
											{selectedLayer.vectorPaths?.length || 0} contours in layer
										</div>
										<Button 
											variant={isShapeToolActive ? "default" : "outline"} 
											size="sm"
											class="w-full"
											disabled={!selectedLayer.vectorPaths || selectedLayer.vectorPaths.length < 2}
											onclick={() => toggleShapeTool()}
											title="Drag to select contours to consolidate"
										>
											{isShapeToolActive ? 'Exit Shape Tool' : 'Shape Tool'}
										</Button>
										{#if isShapeToolActive}
											<div class="text-xs text-muted-foreground mt-2 text-center">
												Drag across contours to unite them
											</div>
										{/if}
									</div>
								</div>
							{/if}
						{/if}
					{:else}
						<div class="text-center text-muted-foreground text-sm">
							Select a layer to see available actions
						</div>
					{/if}
				</div>
			</div>
		</aside>
	</div>

	<!-- Status Bar -->
	<footer class="border-t bg-muted/30 px-4 py-1">
		<div class="flex items-center justify-between text-xs text-muted-foreground">
			<span>
				{PAGE_SIZES[selectedSheet].name} ({PAGE_SIZES[selectedSheet].displaySize}) 
				• Zoom: {Math.round(currentViewportScale * 100)}%
			</span>
			<span>Ready</span>
		</div>
	</footer>
</div>
