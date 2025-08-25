import type { VectorPath, TraceParameters, Layer } from './types';
import cvReadyPromise from '@techstark/opencv-js';

// Basic OpenCV interface for the methods we use
interface OpenCVMat {
	delete(): void;
	copyTo(dst: OpenCVMat): void;
	data32S: Int32Array;
}

interface OpenCVMatVector {
	size(): number;
	get(index: number): OpenCVMat;
	delete(): void;
}

interface OpenCV {
	matFromImageData(imageData: ImageData): OpenCVMat;
	split(src: OpenCVMat, dst: OpenCVMatVector): void;
	threshold(src: OpenCVMat, dst: OpenCVMat, thresh: number, maxval: number, type: number): void;
	findContours(image: OpenCVMat, contours: OpenCVMatVector, hierarchy: OpenCVMat, mode: number, method: number): void;
	contourArea(contour: OpenCVMat): number;
	approxPolyDP(curve: OpenCVMat, approxCurve: OpenCVMat, epsilon: number, closed: boolean): void;
	matFromArray(rows: number, cols: number, type: number, array: Int32Array): OpenCVMat;
	Mat: new () => OpenCVMat;
	MatVector: new () => OpenCVMatVector;
	THRESH_BINARY: number;
	RETR_EXTERNAL: number;
	CHAIN_APPROX_SIMPLE: number;
	CV_32SC2: number;
}

let cv: OpenCV | null = null;

// Initialize OpenCV when first needed
async function getOpenCV(): Promise<OpenCV> {
	if (!cv) {
		cv = await cvReadyPromise as OpenCV;
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
	threshold: 128, // Alpha threshold (0-255)
	smoothing: 2.0, // Additional smoothing factor
	pointReduction: 0.5 // Point reduction tolerance
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
function contourToVectorPath(contour: OpenCVMat, id: string): VectorPath {
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
 * Reduce points by removing duplicates and points that are very close together
 */
export function reducePoints(path: VectorPath, tolerance: number = 0.5): VectorPath {
	if (path.points.length <= 2) {
		return path;
	}
	
	const reducedPoints: { x: number; y: number }[] = [];
	const points = path.points;
	
	// Always keep the first point
	reducedPoints.push(points[0]);
	
	for (let i = 1; i < points.length; i++) {
		const current = points[i];
		const previous = reducedPoints[reducedPoints.length - 1];
		
		// Calculate distance between current and previous kept point
		const dx = current.x - previous.x;
		const dy = current.y - previous.y;
		const distance = Math.sqrt(dx * dx + dy * dy);
		
		// Only keep the point if it's far enough from the previous kept point
		if (distance >= tolerance) {
			reducedPoints.push(current);
		}
	}
	
	// For closed paths, check if the last point is too close to the first
	if (path.closed && reducedPoints.length > 2) {
		const first = reducedPoints[0];
		const last = reducedPoints[reducedPoints.length - 1];
		const dx = last.x - first.x;
		const dy = last.y - first.y;
		const distance = Math.sqrt(dx * dx + dy * dy);
		
		// Remove the last point if it's too close to the first
		if (distance < tolerance) {
			reducedPoints.pop();
		}
	}
	
	// Ensure we have at least 3 points for a valid path
	if (reducedPoints.length < 3) {
		return path; // Return original if reduction would make it invalid
	}
	
	return {
		...path,
		points: reducedPoints
	};
}

/**
 * Offset a vector path outward by a given distance using smooth arc joins
 * Creates die-cut style outlines similar to Illustrator's Offset Path tool
 */
export function offsetVectorPath(path: VectorPath, offsetDistance: number): VectorPath {
	if (path.points.length < 3 || offsetDistance === 0) {
		return path;
	}

	const points = path.points;
	
	// Determine winding direction using shoelace formula
	let signedArea = 0;
	for (let i = 0; i < points.length; i++) {
		const j = (i + 1) % points.length;
		signedArea += (points[j].x - points[i].x) * (points[j].y + points[i].y);
	}
	
	// In screen coordinates, positive area = clockwise, negative = counterclockwise
	// For outward offset: clockwise needs positive offset, counterclockwise needs negative
	const isClockwise = signedArea > 0;
	const direction = isClockwise ? 1 : -1;
	
	// Generate offset segments for each edge
	const offsetSegments: { start: { x: number; y: number }; end: { x: number; y: number } }[] = [];
	
	for (let i = 0; i < points.length; i++) {
		const current = points[i];
		const next = points[(i + 1) % points.length];
		
		// Calculate edge vector
		const edge = { x: next.x - current.x, y: next.y - current.y };
		const edgeLen = Math.sqrt(edge.x * edge.x + edge.y * edge.y);
		
		if (edgeLen < 1e-6) continue; // Skip degenerate edges
		
		// Normalize edge vector
		const unit = { x: edge.x / edgeLen, y: edge.y / edgeLen };
		
		// Calculate normal (perpendicular) vector pointing outward
		const normal = { x: -unit.y * direction, y: unit.x * direction };
		
		// Create offset segment
		offsetSegments.push({
			start: {
				x: current.x + normal.x * offsetDistance,
				y: current.y + normal.y * offsetDistance
			},
			end: {
				x: next.x + normal.x * offsetDistance,
				y: next.y + normal.y * offsetDistance
			}
		});
	}
	
	if (offsetSegments.length === 0) return path;
	
	// Connect offset segments with smooth joins
	const offsetPoints: { x: number; y: number }[] = [];
	
	for (let i = 0; i < offsetSegments.length; i++) {
		const currentSeg = offsetSegments[i];
		const nextSeg = offsetSegments[(i + 1) % offsetSegments.length];
		
		// Add the start point of the current segment
		offsetPoints.push(currentSeg.start);
		
		// Calculate intersection of current and next segments
		const intersection = lineIntersection(
			currentSeg.start, currentSeg.end,
			nextSeg.start, nextSeg.end
		);
		
		if (intersection) {
			// Check if intersection is reasonable (not too far from original vertices)
			const originalVertex = points[(i + 1) % points.length];
			const distToOriginal = Math.sqrt(
				Math.pow(intersection.x - originalVertex.x, 2) + 
				Math.pow(intersection.y - originalVertex.y, 2)
			);
			
			// Use intersection if it's reasonable, otherwise use arc join
			const maxDistance = offsetDistance * 3; // Reasonable limit
			if (distToOriginal <= maxDistance) {
				offsetPoints.push(intersection);
			} else {
				// Use arc join for sharp corners
				const arcPoints = createArcJoin(
					currentSeg.end, nextSeg.start,
					points[(i + 1) % points.length],
					offsetDistance
				);
				offsetPoints.push(...arcPoints);
			}
		} else {
			// Segments are parallel or don't intersect, connect with arc
			const arcPoints = createArcJoin(
				currentSeg.end, nextSeg.start,
				points[(i + 1) % points.length],
				offsetDistance
			);
			offsetPoints.push(...arcPoints);
		}
	}
	
	// Apply smoothing to reduce sharp angles
	const smoothedPoints = smoothOffsetPath(offsetPoints, offsetDistance * 0.1);
	
	return {
		...path,
		points: smoothedPoints
	};
}

/**
 * Find intersection point of two lines defined by two points each
 */
function lineIntersection(
	p1: { x: number; y: number }, p2: { x: number; y: number },
	p3: { x: number; y: number }, p4: { x: number; y: number }
): { x: number; y: number } | null {
	const denom = (p1.x - p2.x) * (p3.y - p4.y) - (p1.y - p2.y) * (p3.x - p4.x);
	
	if (Math.abs(denom) < 1e-10) {
		return null; // Lines are parallel
	}
	
	const t = ((p1.x - p3.x) * (p3.y - p4.y) - (p1.y - p3.y) * (p3.x - p4.x)) / denom;
	
	return {
		x: p1.x + t * (p2.x - p1.x),
		y: p1.y + t * (p2.y - p1.y)
	};
}

/**
 * Create smooth arc join between two offset segments
 */
function createArcJoin(
	end1: { x: number; y: number },
	start2: { x: number; y: number },
	center: { x: number; y: number },
	radius: number
): { x: number; y: number }[] {
	// Calculate angles from center to the two points
	const angle1 = Math.atan2(end1.y - center.y, end1.x - center.x);
	const angle2 = Math.atan2(start2.y - center.y, start2.x - center.x);
	
	let deltaAngle = angle2 - angle1;
	
	// Ensure we take the shorter arc
	if (deltaAngle > Math.PI) {
		deltaAngle -= 2 * Math.PI;
	} else if (deltaAngle < -Math.PI) {
		deltaAngle += 2 * Math.PI;
	}
	
	// Only create arc points if the angle is significant
	if (Math.abs(deltaAngle) < 0.1) {
		return [end1]; // Too small, just use the point
	}
	
	const arcPoints: { x: number; y: number }[] = [];
	const steps = Math.max(2, Math.ceil(Math.abs(deltaAngle) * 3)); // More steps for larger angles
	
	for (let i = 1; i < steps; i++) {
		const t = i / steps;
		const angle = angle1 + deltaAngle * t;
		arcPoints.push({
			x: center.x + Math.cos(angle) * radius,
			y: center.y + Math.sin(angle) * radius
		});
	}
	
	return arcPoints;
}

/**
 * Apply smoothing to offset path to reduce jagged edges
 */
function smoothOffsetPath(points: { x: number; y: number }[], _tolerance: number): { x: number; y: number }[] {
	if (points.length < 3) return points;
	
	const smoothed: { x: number; y: number }[] = [];
	const smoothingFactor = 0.3; // How much to smooth (0 = no smoothing, 1 = maximum)
	
	for (let i = 0; i < points.length; i++) {
		const prev = points[(i - 1 + points.length) % points.length];
		const current = points[i];
		const next = points[(i + 1) % points.length];
		
		// Apply weighted averaging for smoothing
		const smoothedX = current.x + (prev.x + next.x - 2 * current.x) * smoothingFactor * 0.5;
		const smoothedY = current.y + (prev.y + next.y - 2 * current.y) * smoothingFactor * 0.5;
		
		smoothed.push({ x: smoothedX, y: smoothedY });
	}
	
	return smoothed;
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
		
		// Apply initial smoothing if enabled
		if (params.opticurve && params.opttolerance > 0) {
			contours = await smoothContours(contours, params.opttolerance);
		}
		
		// Apply additional smoothing if specified
		if (params.smoothing > 0) {
			contours = await smoothContours(contours, params.smoothing);
		}
		
		// Apply point reduction to remove very close points
		if (params.pointReduction > 0) {
			contours = contours.map(path => reducePoints(path, params.pointReduction));
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
		traceParameters: { ...DEFAULT_TRACE_PARAMETERS, ...printLayer.traceParameters },
		zIndex: printLayer.zIndex + 0.1 // Place slightly above the original
	};
	
	return cutLayer;
}