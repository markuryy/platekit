import type { VectorPath, TraceParameters, Layer } from './types';
import cvReadyPromise from '@techstark/opencv-js';

let cv: any = null;

// Initialize OpenCV when first needed
async function getOpenCV() {
	if (!cv) {
		cv = await cvReadyPromise;
	}
	return cv;
}

// Default trace parameters for alpha-based tracing
export const DEFAULT_TRACE_PARAMETERS: TraceParameters = {
	turdsize: 4, // Minimum contour area in pixels
	turnpolicy: 'minority', // Not used in alpha tracing but kept for compatibility
	alphamax: 1, // Not used in alpha tracing
	opticurve: true, // Enable curve smoothing
	opttolerance: 2.0, // Curve smoothing tolerance
	threshold: 128 // Alpha threshold (0-255)
};

/**
 * Convert HTMLImageElement to ImageData preserving alpha channel
 */
function imageToImageData(image: HTMLImageElement): ImageData {
	const canvas = document.createElement('canvas');
	const ctx = canvas.getContext('2d')!;
	
	canvas.width = image.naturalWidth;
	canvas.height = image.naturalHeight;
	
	// Draw image preserving alpha
	ctx.drawImage(image, 0, 0);
	
	return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

/**
 * Convert OpenCV contour points to our VectorPath format
 */
function contourToVectorPath(contour: any, id: string): VectorPath {
	const points: { x: number; y: number }[] = [];
	
	// Extract points from OpenCV contour
	for (let i = 0; i < contour.data32S.length; i += 2) {
		const x = contour.data32S[i];
		const y = contour.data32S[i + 1];
		points.push({ x, y });
	}
	
	return {
		id,
		points,
		closed: true
	};
}

/**
 * Find contours using OpenCV.js
 */
async function findContours(imageData: ImageData, minArea: number): Promise<VectorPath[]> {
	const cv = await getOpenCV();
	
	// Create OpenCV Mat from ImageData
	const src = cv.matFromImageData(imageData);
	const gray = new cv.Mat();
	const binary = new cv.Mat();
	const contours = new cv.MatVector();
	const hierarchy = new cv.Mat();
	
	try {
		// Convert to grayscale using alpha channel
		const channels = new cv.MatVector();
		cv.split(src, channels);
		const alpha = channels.get(3); // Get alpha channel
		alpha.copyTo(gray);
		
		// Apply threshold to create binary image
		cv.threshold(gray, binary, 127, 255, cv.THRESH_BINARY);
		
		// Find contours
		cv.findContours(binary, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
		
		const vectorPaths: VectorPath[] = [];
		
		// Convert each contour to VectorPath
		for (let i = 0; i < contours.size(); i++) {
			const contour = contours.get(i);
			
			// Filter by area
			const area = cv.contourArea(contour);
			if (area < minArea) continue;
			
			const vectorPath = contourToVectorPath(contour, `contour-${i}`);
			vectorPaths.push(vectorPath);
		}
		
		return vectorPaths;
		
	} finally {
		// Clean up OpenCV Mats
		src.delete();
		gray.delete();
		binary.delete();
		contours.delete();
		hierarchy.delete();
	}
}

/**
 * Smooth contours using OpenCV approximation
 */
async function smoothContours(vectorPaths: VectorPath[], tolerance: number): Promise<VectorPath[]> {
	if (tolerance <= 0) return vectorPaths;
	
	const cv = await getOpenCV();
	const smoothedPaths: VectorPath[] = [];
	
	for (const path of vectorPaths) {
		if (path.points.length < 3) {
			smoothedPaths.push(path);
			continue;
		}
		
		// Convert points to OpenCV format
		const pointData = new Int32Array(path.points.length * 2);
		for (let i = 0; i < path.points.length; i++) {
			pointData[i * 2] = Math.round(path.points[i].x);
			pointData[i * 2 + 1] = Math.round(path.points[i].y);
		}
		
		const contour = cv.matFromArray(path.points.length, 1, cv.CV_32SC2, pointData);
		const approx = new cv.Mat();
		
		try {
			// Approximate contour with fewer points
			cv.approxPolyDP(contour, approx, tolerance, true);
			
			// Convert back to our format
			const smoothedPoints: { x: number; y: number }[] = [];
			for (let i = 0; i < approx.data32S.length; i += 2) {
				smoothedPoints.push({
					x: approx.data32S[i],
					y: approx.data32S[i + 1]
				});
			}
			
			smoothedPaths.push({
				...path,
				points: smoothedPoints
			});
			
		} finally {
			contour.delete();
			approx.delete();
		}
	}
	
	return smoothedPaths;
}

/**
 * Offset a vector path outward by a given distance (for vinyl cutting gaps)
 * Uses improved parallel offset algorithm with proper winding detection
 */
export function offsetVectorPath(path: VectorPath, offsetDistance: number): VectorPath {
	if (path.points.length < 3 || offsetDistance === 0) {
		return path; // Can't offset with less than 3 points or zero distance
	}

	const offsetPoints: { x: number; y: number }[] = [];
	const points = path.points;
	
	// Determine if path is clockwise or counterclockwise using signed area
	let signedArea = 0;
	for (let i = 0; i < points.length; i++) {
		const curr = points[i];
		const next = points[(i + 1) % points.length];
		signedArea += (next.x - curr.x) * (next.y + curr.y);
	}
	
	// If positive, clockwise; if negative, counterclockwise
	const isClockwise = signedArea > 0;
	// For outward offset: invert direction for clockwise paths
	const offsetMultiplier = isClockwise ? -1 : 1;
	
	for (let i = 0; i < points.length; i++) {
		const prevIndex = (i - 1 + points.length) % points.length;
		const nextIndex = (i + 1) % points.length;
		
		const prev = points[prevIndex];
		const curr = points[i];
		const next = points[nextIndex];
		
		// Calculate vectors for adjacent segments
		const v1 = { x: curr.x - prev.x, y: curr.y - prev.y };
		const v2 = { x: next.x - curr.x, y: next.y - curr.y };
		
		// Normalize vectors
		const len1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y);
		const len2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y);
		
		if (len1 > 0) {
			v1.x /= len1;
			v1.y /= len1;
		}
		
		if (len2 > 0) {
			v2.x /= len2;
			v2.y /= len2;
		}
		
		// Calculate perpendicular vectors (normals)
		const n1 = { x: -v1.y * offsetMultiplier, y: v1.x * offsetMultiplier };
		const n2 = { x: -v2.y * offsetMultiplier, y: v2.x * offsetMultiplier };
		
		// Average the normals to get the offset direction
		let offsetDir = { x: (n1.x + n2.x) / 2, y: (n1.y + n2.y) / 2 };
		
		// Normalize the offset direction
		const offsetLen = Math.sqrt(offsetDir.x * offsetDir.x + offsetDir.y * offsetDir.y);
		if (offsetLen > 0) {
			offsetDir.x /= offsetLen;
			offsetDir.y /= offsetLen;
		}
		
		// Calculate the actual offset distance (compensate for angle)
		const dotProduct = n1.x * n2.x + n1.y * n2.y;
		const angle = Math.acos(Math.max(-1, Math.min(1, dotProduct)));
		const compensation = Math.sin(angle / 2);
		const actualOffset = compensation > 0.1 ? offsetDistance / compensation : offsetDistance;
		
		// Apply offset
		offsetPoints.push({
			x: curr.x + offsetDir.x * actualOffset,
			y: curr.y + offsetDir.y * actualOffset
		});
	}
	
	return {
		...path,
		points: offsetPoints
	};
}



/**
 * Trace an image using alpha channel to generate vector paths
 */
export async function traceImage(
	image: HTMLImageElement, 
	parameters: Partial<TraceParameters> = {}
): Promise<VectorPath[]> {
	const params = { ...DEFAULT_TRACE_PARAMETERS, ...parameters };
	
	try {
		// Convert image to ImageData preserving alpha
		const imageData = imageToImageData(image);
		
		// Find contours using OpenCV
		let contours = await findContours(imageData, params.turdsize);
		
		// Apply smoothing if enabled
		if (params.opticurve && params.opttolerance > 0) {
			contours = await smoothContours(contours, params.opttolerance);
		}
		
		return contours;
	} catch (error) {
		console.error('Alpha tracing failed:', error);
		throw new Error('Failed to trace image using alpha channel');
	}
}


/**
 * Create a new cut layer from a print layer
 */
export async function createCutLayerFromPrint(printLayer: Layer): Promise<Layer> {
	if (printLayer.type !== 'print' || !printLayer.image) {
		throw new Error('Can only create cut layers from print layers with images');
	}
	
	const vectorPaths = await traceImage(printLayer.image, printLayer.traceParameters);
	
	const cutLayer: Layer = {
		...printLayer,
		id: crypto.randomUUID(),
		name: `${printLayer.name} (Cut)`,
		type: 'cut',
		vectorPaths,
		traceParameters: printLayer.traceParameters || DEFAULT_TRACE_PARAMETERS,
		zIndex: printLayer.zIndex + 0.1 // Place slightly above the original
	};
	
	return cutLayer;
}