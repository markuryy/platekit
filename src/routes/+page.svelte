<script lang="ts">
	import Canvas from '$lib/components/Canvas.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Separator } from '$lib/components/ui/separator';

	let selectedSheet: 'us-letter' | 'a5' = $state('us-letter');
	let canvasScale = $state(0.5);
	let currentViewportScale = $state(0.5);

	function handleViewportScaleChange(scale: number) {
		currentViewportScale = scale;
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
				<Button variant="outline" size="sm">Import Images</Button>
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
				onViewportScaleChange={handleViewportScaleChange}
			/>
		</main>

		<!-- Right Sidebar - Layers -->
		<aside class="w-80 border-l bg-background flex flex-col">
			<div class="p-4 border-b">
				<h2 class="font-semibold text-sm">Layers</h2>
			</div>
			
			<!-- Layer List -->
			<div class="flex-1 overflow-auto">
				<div class="p-2 space-y-1">
					<!-- Mock layers for layout -->
					<div class="p-2 rounded hover:bg-muted/50 cursor-pointer border border-transparent hover:border-border">
						<div class="flex items-center justify-between">
							<div class="flex items-center gap-2">
								<div class="w-3 h-3 bg-blue-500 rounded-sm"></div>
								<span class="text-sm">Sticker 1</span>
							</div>
							<div class="flex items-center gap-1">
								<span class="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded">Print</span>
								<button class="text-muted-foreground hover:text-foreground">
									<svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
										<path d="M10 12a2 2 0 100-4 2 2 0 000 4z"></path>
										<path fill-rule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clip-rule="evenodd"></path>
									</svg>
								</button>
							</div>
						</div>
					</div>

					<div class="p-2 rounded hover:bg-muted/50 cursor-pointer border border-transparent hover:border-border">
						<div class="flex items-center justify-between">
							<div class="flex items-center gap-2">
								<div class="w-3 h-3 bg-red-500 rounded-sm"></div>
								<span class="text-sm">Cut Path 1</span>
							</div>
							<div class="flex items-center gap-1">
								<span class="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded">Cut</span>
								<button class="text-muted-foreground hover:text-foreground">
									<svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
										<path d="M10 12a2 2 0 100-4 2 2 0 000 4z"></path>
										<path fill-rule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clip-rule="evenodd"></path>
									</svg>
								</button>
							</div>
						</div>
					</div>

					<div class="p-2 rounded hover:bg-muted/50 cursor-pointer border border-transparent hover:border-border bg-muted/30 border-border">
						<div class="flex items-center justify-between">
							<div class="flex items-center gap-2">
								<div class="w-3 h-3 bg-purple-500 rounded-sm"></div>
								<span class="text-sm font-medium">Sticker 2</span>
							</div>
							<div class="flex items-center gap-1">
								<span class="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded">Print</span>
								<button class="text-muted-foreground hover:text-foreground">
									<svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
										<path d="M10 12a2 2 0 100-4 2 2 0 000 4z"></path>
										<path fill-rule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clip-rule="evenodd"></path>
									</svg>
								</button>
							</div>
						</div>
					</div>
				</div>
			</div>

			<!-- Layer Actions -->
			<div class="p-4 border-t space-y-2">
				<Button variant="outline" size="sm" class="w-full justify-start">
					<svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path>
					</svg>
					Add Layer
				</Button>
				<div class="flex gap-2">
					<Button variant="outline" size="sm" class="flex-1">
						Duplicate
					</Button>
					<Button variant="outline" size="sm" class="flex-1">
						Delete
					</Button>
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
