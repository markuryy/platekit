import type { Layer, PlateKitProject, SerializableLayer, ProjectMetadata, CanvasState, PageSize } from './types';

const PROJECT_VERSION = '1.0.0';

/**
 * Converts an HTMLImageElement to a base64 data URL
 */
function imageToBase64(image: HTMLImageElement): string {
	const canvas = document.createElement('canvas');
	canvas.width = image.naturalWidth;
	canvas.height = image.naturalHeight;
	
	const ctx = canvas.getContext('2d')!;
	ctx.drawImage(image, 0, 0);
	
	return canvas.toDataURL('image/png');
}

/**
 * Converts a base64 data URL back to an HTMLImageElement
 */
function base64ToImage(base64: string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const image = new Image();
		image.onload = () => resolve(image);
		image.onerror = () => reject(new Error('Failed to load image from base64'));
		image.src = base64;
	});
}

/**
 * Converts a Layer to a SerializableLayer
 */
function serializeLayer(layer: Layer): SerializableLayer {
	const serializable: SerializableLayer = {
		id: layer.id,
		name: layer.name,
		type: layer.type,
		visible: layer.visible,
		vectorPaths: layer.vectorPaths,
		traceParameters: layer.traceParameters,
		offset: layer.offset,
		x: layer.x,
		y: layer.y,
		width: layer.width,
		height: layer.height,
		rotation: layer.rotation,
		scaleX: layer.scaleX,
		scaleY: layer.scaleY,
		opacity: layer.opacity,
		zIndex: layer.zIndex
	};

	// Convert image to base64 if present
	if (layer.image) {
		serializable.imageData = imageToBase64(layer.image);
	}

	return serializable;
}

/**
 * Converts a SerializableLayer back to a Layer
 */
async function deserializeLayer(serializable: SerializableLayer): Promise<Layer> {
	const layer: Layer = {
		id: serializable.id,
		name: serializable.name,
		type: serializable.type,
		visible: serializable.visible,
		vectorPaths: serializable.vectorPaths,
		traceParameters: serializable.traceParameters,
		offset: serializable.offset,
		x: serializable.x,
		y: serializable.y,
		width: serializable.width,
		height: serializable.height,
		rotation: serializable.rotation,
		scaleX: serializable.scaleX,
		scaleY: serializable.scaleY,
		opacity: serializable.opacity,
		zIndex: serializable.zIndex
	};

	// Convert base64 back to image if present
	if (serializable.imageData) {
		layer.image = await base64ToImage(serializable.imageData);
	}

	return layer;
}

/**
 * Serializes the current project state to a PlateKitProject object
 */
export function serializeProject(
	layers: Layer[], 
	pageSize: PageSize,
	canvasState: CanvasState,
	projectName?: string
): PlateKitProject {
	const now = new Date().toISOString();
	
	const metadata: ProjectMetadata = {
		name: projectName || 'Untitled Project',
		version: PROJECT_VERSION,
		created: now,
		modified: now,
		pageSize
	};

	const serializedLayers = layers.map(serializeLayer);

	return {
		version: PROJECT_VERSION,
		metadata,
		layers: serializedLayers,
		canvasState
	};
}

/**
 * Deserializes a PlateKitProject object back to application state
 */
export async function deserializeProject(project: PlateKitProject): Promise<{
	layers: Layer[];
	pageSize: PageSize;
	canvasState: CanvasState;
	metadata: ProjectMetadata;
}> {
	// Version compatibility check
	if (project.version !== PROJECT_VERSION) {
		console.warn(`Project version ${project.version} may not be fully compatible with current version ${PROJECT_VERSION}`);
	}

	// Deserialize layers (with async image loading)
	const layers = await Promise.all(
		project.layers.map(deserializeLayer)
	);

	return {
		layers,
		pageSize: project.metadata.pageSize,
		canvasState: project.canvasState,
		metadata: project.metadata
	};
}

/**
 * Exports a project as a downloadable JSON file
 */
export function exportProjectFile(project: PlateKitProject): void {
	const jsonString = JSON.stringify(project, null, 2);
	const blob = new Blob([jsonString], { type: 'application/json' });
	
	const url = URL.createObjectURL(blob);
	const link = document.createElement('a');
	link.href = url;
	link.download = `${project.metadata.name.replace(/[^a-z0-9]/gi, '_')}.platekit`;
	
	document.body.appendChild(link);
	link.click();
	document.body.removeChild(link);
	
	URL.revokeObjectURL(url);
}

/**
 * Imports a project from a file
 */
export function importProjectFile(): Promise<PlateKitProject> {
	return new Promise((resolve, reject) => {
		const input = document.createElement('input');
		input.type = 'file';
		input.accept = '.platekit,.json';
		
		input.onchange = async (event) => {
			const file = (event.target as HTMLInputElement).files?.[0];
			if (!file) {
				reject(new Error('No file selected'));
				return;
			}

			try {
				const text = await file.text();
				const project = JSON.parse(text) as PlateKitProject;
				
				// Basic validation
				if (!project.version || !project.metadata || !project.layers) {
					throw new Error('Invalid project file format');
				}
				
				resolve(project);
			} catch (error) {
				reject(new Error(`Failed to parse project file: ${error}`));
			}
		};
		
		input.click();
	});
}

/**
 * Validates a project object structure
 */
export function validateProject(project: any): project is PlateKitProject {
	if (!project || typeof project !== 'object') {
		throw new Error('Project must be an object');
	}
	
	if (typeof project.version !== 'string') {
		throw new Error('Project version is missing or invalid');
	}
	
	if (!project.metadata || typeof project.metadata !== 'object') {
		throw new Error('Project metadata is missing or invalid');
	}
	
	if (typeof project.metadata.name !== 'string') {
		throw new Error('Project name is missing or invalid');
	}
	
	if (typeof project.metadata.pageSize !== 'string') {
		throw new Error('Project page size is missing or invalid');
	}
	
	if (!Array.isArray(project.layers)) {
		throw new Error('Project layers must be an array');
	}
	
	if (!project.canvasState || typeof project.canvasState !== 'object') {
		throw new Error('Project canvas state is missing or invalid');
	}
	
	// Validate each layer
	for (let i = 0; i < project.layers.length; i++) {
		const layer = project.layers[i];
		if (!layer || typeof layer !== 'object') {
			throw new Error(`Layer ${i} is invalid`);
		}
		
		if (typeof layer.id !== 'string' || layer.id.trim() === '') {
			throw new Error(`Layer ${i} has invalid ID`);
		}
		
		if (typeof layer.type !== 'string' || !['print', 'cut'].includes(layer.type)) {
			throw new Error(`Layer ${i} has invalid type`);
		}
	}
	
	return true;
}

/**
 * Enhanced error handling for project operations
 */
export class ProjectError extends Error {
	constructor(message: string, public readonly code: string) {
		super(message);
		this.name = 'ProjectError';
	}
}

/**
 * Safe wrapper for project serialization with enhanced error handling
 */
export function safeSerializeProject(
	layers: Layer[], 
	pageSize: PageSize,
	canvasState: CanvasState,
	projectName?: string
): { success: true; project: PlateKitProject } | { success: false; error: string } {
	try {
		const project = serializeProject(layers, pageSize, canvasState, projectName);
		return { success: true, project };
	} catch (error) {
		return { 
			success: false, 
			error: error instanceof Error ? error.message : 'Unknown serialization error'
		};
	}
}

/**
 * Safe wrapper for project deserialization with enhanced error handling
 */
export async function safeDeserializeProject(project: PlateKitProject): Promise<{
	success: true;
	data: {
		layers: Layer[];
		pageSize: PageSize;
		canvasState: CanvasState;
		metadata: ProjectMetadata;
	};
} | {
	success: false;
	error: string;
}> {
	try {
		const data = await deserializeProject(project);
		return { success: true, data };
	} catch (error) {
		return {
			success: false,
			error: error instanceof Error ? error.message : 'Unknown deserialization error'
		};
	}
}