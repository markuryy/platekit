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