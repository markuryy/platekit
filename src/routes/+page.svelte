<script lang="ts">
	import Canvas from '$lib/components/Canvas.svelte';
	import type { Layer } from '$lib/types';
	import { Button } from '$lib/components/ui/button';
	import { Separator } from '$lib/components/ui/separator';
	import { createCutLayerFromPrint } from '$lib/tracing';

	let selectedSheet: 'us-letter' | 'a5' = $state('us-letter');
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

	function handleOffsetChange(layerId: string, offset: number) {
		handleLayerUpdate(layerId, { offset });
	}

</script>

<div class="flex flex-col h-screen bg-background">
	<!-- Top Toolbar -->
	<header class="border-b bg-background px-4 py-2">
		<div class="flex items-center justify-between">
			<div class="flex items-center gap-6">
				<h1 class="text-lg font-semibold">PlateKit</h1>
				
				<Separator orientation="vertical" class="h-6" />
				
				<!-- Sheet Size Controls -->
				<div class="flex items-center gap-2">
					<span class="text-sm font-medium">Sheet:</span>
					<Button 
						variant={selectedSheet === 'us-letter' ? 'default' : 'outline'}
						size="sm"
						onclick={() => selectedSheet = 'us-letter'}
					>
						Letter
					</Button>
					<Button 
						variant={selectedSheet === 'a5' ? 'default' : 'outline'}
						size="sm"
						onclick={() => selectedSheet = 'a5'}
					>
						A5
					</Button>
				</div>

			</div>

			<div class="flex items-center gap-2">
				<Button variant="outline" size="sm">Export</Button>
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
				onViewportScaleChange={handleViewportScaleChange}
				onLayerAdd={handleLayerAdd}
				onLayerUpdate={handleLayerUpdate}
				onSelectionChange={handleSelectionChange}
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
												min="0" 
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
				{selectedSheet === 'us-letter' ? 'US Letter (8.5" × 11")' : 'A5'} 
				• Zoom: {Math.round(currentViewportScale * 100)}%
			</span>
			<span>Ready</span>
		</div>
	</footer>
</div>
