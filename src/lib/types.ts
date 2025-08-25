export interface VectorPath {
	id: string;
	points: { x: number; y: number }[];
	closed: boolean;
	holes?: VectorPath[]; // Inner paths for complex shapes
}

export interface TraceParameters {
	turdsize: number; // Minimum path area (default: 2)
	turnpolicy: 'black' | 'white' | 'left' | 'right' | 'minority' | 'majority'; // Turn policy (default: 'minority')
	alphamax: number; // Corner threshold (default: 1)
	opticurve: boolean; // Enable curve optimization (default: true)
	opttolerance: number; // Curve optimization tolerance (default: 0.2)
	threshold: number; // Threshold for binarization (0-255, default: 128)
	smoothing: number; // Additional smoothing factor (0-10, default: 2)
	pointReduction: number; // Point reduction tolerance (0-5, default: 0.5)
}

export interface Layer {
	id: string;
	name: string;
	type: 'print' | 'cut';
	visible: boolean;
	image?: HTMLImageElement;
	vectorPaths?: VectorPath[]; // Only present when type is 'cut'
	traceParameters?: TraceParameters;
	offset?: number; // Offset distance for vinyl cutting
	x: number;
	y: number;
	width: number;
	height: number;
	rotation: number; // degrees
	scaleX: number;
	scaleY: number;
	opacity: number; // 0-1
	zIndex: number;
}

export interface Transform {
	x: number;
	y: number;
	width: number;
	height: number;
	rotation: number;
	scaleX: number;
	scaleY: number;
}

export interface SelectionState {
	selectedLayerIds: string[];
	isTransforming: boolean;
	transformType: 'move' | 'resize' | 'rotate' | null;
	transformHandle: string | null;
}

export type PageSize = 'us-letter' | 'a4' | 'a5';

export interface PageSizeInfo {
	name: string;
	width: number; // in points (72 DPI)
	height: number; // in points (72 DPI)
	displaySize: string;
}

// Project serialization types
export interface SerializableLayer {
	id: string;
	name: string;
	type: 'print' | 'cut';
	visible: boolean;
	imageData?: string; // Base64 encoded image data
	vectorPaths?: VectorPath[];
	traceParameters?: TraceParameters;
	offset?: number;
	x: number;
	y: number;
	width: number;
	height: number;
	rotation: number;
	scaleX: number;
	scaleY: number;
	opacity: number;
	zIndex: number;
}

export interface ProjectMetadata {
	name: string;
	version: string;
	created: string; // ISO date string
	modified: string; // ISO date string
	pageSize: PageSize;
}

export interface CanvasState {
	zoom: number;
	selectedLayerId: string | null;
}

export interface PlateKitProject {
	version: string;
	metadata: ProjectMetadata;
	layers: SerializableLayer[];
	canvasState: CanvasState;
}