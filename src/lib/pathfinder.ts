import paper from 'paper';
import type { VectorPath } from './types';

// Initialize paper.js scope
let paperScope: paper.PaperScope | null = null;

/**
 * Initialize paper.js with a virtual canvas
 * Call this before using any pathfinder operations
 */
export function initializePaper(): void {
	if (paperScope) return;
	
	// Create a virtual canvas for paper.js calculations
	const canvas = document.createElement('canvas');
	paperScope = new paper.PaperScope();
	paperScope.setup(canvas);
}

/**
 * Convert VectorPath to paper.js Path
 */
function vectorPathToPaperPath(vectorPath: VectorPath): paper.Path {
	if (!paperScope) throw new Error('Paper.js not initialized');
	
	const path = new paperScope.Path();
	
	if (vectorPath.points.length === 0) return path;
	
	// Move to first point
	path.moveTo(new paperScope.Point(vectorPath.points[0].x, vectorPath.points[0].y));
	
	// Add lines to subsequent points
	for (let i = 1; i < vectorPath.points.length; i++) {
		const point = vectorPath.points[i];
		path.lineTo(new paperScope.Point(point.x, point.y));
	}
	
	// Close path if specified
	if (vectorPath.closed) {
		path.closePath();
	}
	
	return path;
}

/**
 * Convert paper.js Path back to VectorPath
 */
function paperPathToVectorPath(paperPath: paper.Path, id: string): VectorPath {
	if (!paperScope) throw new Error('Paper.js not initialized');
	
	const points: { x: number; y: number }[] = [];
	
	// Check if segments exists and is iterable
	if (paperPath.segments && paperPath.segments.length > 0) {
		for (let i = 0; i < paperPath.segments.length; i++) {
			const segment = paperPath.segments[i];
			if (segment && segment.point) {
				points.push({
					x: segment.point.x,
					y: segment.point.y
				});
			}
		}
	} else if (paperPath.curves && paperPath.curves.length > 0) {
		// Fallback to curves if segments aren't available
		for (let i = 0; i < paperPath.curves.length; i++) {
			const curve = paperPath.curves[i];
			if (curve && curve.point1) {
				points.push({
					x: curve.point1.x,
					y: curve.point1.y
				});
			}
		}
		// Add the last point
		const lastCurve = paperPath.curves[paperPath.curves.length - 1];
		if (lastCurve && lastCurve.point2) {
			points.push({
				x: lastCurve.point2.x,
				y: lastCurve.point2.y
			});
		}
	}
	
	return {
		id,
		points,
		closed: paperPath.closed || false
	};
}

/**
 * Unite (merge) multiple paths into one or more shapes
 * Equivalent to Illustrator's Pathfinder Unite
 */
export function unite(paths: VectorPath[]): VectorPath[] {
	initializePaper();
	if (!paperScope || paths.length === 0) return [];
	
	try {
		const paperPaths = paths.map(path => vectorPathToPaperPath(path));
		
		let result = paperPaths[0];
		for (let i = 1; i < paperPaths.length; i++) {
			const unionResult = result.unite(paperPaths[i]);
			result.remove();
			paperPaths[i].remove();
			result = unionResult;
		}
		
		// Handle both single path and compound path results
		const resultPaths: VectorPath[] = [];
		if (result.children && result.children.length > 0) {
			// Compound path with multiple children
			for (let i = 0; i < result.children.length; i++) {
				const child = result.children[i];
				if (child instanceof paperScope.Path) {
					resultPaths.push(paperPathToVectorPath(child, `united-${i}-${crypto.randomUUID()}`));
				}
			}
		} else {
			// Single path
			resultPaths.push(paperPathToVectorPath(result, `united-${crypto.randomUUID()}`));
		}
		
		result.remove();
		return resultPaths;
	} catch (error) {
		console.error('Unite operation failed:', error);
		return [];
	}
}

/**
 * Subtract one path from another
 * Equivalent to Illustrator's Pathfinder Minus Front
 */
export function subtract(basePath: VectorPath, subtractPath: VectorPath): VectorPath | null {
	initializePaper();
	if (!paperScope) return null;
	
	try {
		const paperBase = vectorPathToPaperPath(basePath);
		const paperSubtract = vectorPathToPaperPath(subtractPath);
		
		const result = paperBase.subtract(paperSubtract);
		
		paperBase.remove();
		paperSubtract.remove();
		
		if (!result) return null;
		
		const resultPath = paperPathToVectorPath(result, `subtracted-${crypto.randomUUID()}`);
		result.remove();
		
		return resultPath;
	} catch (error) {
		console.error('Subtract operation failed:', error);
		return null;
	}
}

/**
 * Find intersection of two paths
 * Equivalent to Illustrator's Pathfinder Intersect
 */
export function intersect(path1: VectorPath, path2: VectorPath): VectorPath | null {
	initializePaper();
	if (!paperScope) return null;
	
	try {
		const paperPath1 = vectorPathToPaperPath(path1);
		const paperPath2 = vectorPathToPaperPath(path2);
		
		const result = paperPath1.intersect(paperPath2);
		
		paperPath1.remove();
		paperPath2.remove();
		
		if (!result) return null;
		
		const resultPath = paperPathToVectorPath(result, `intersected-${crypto.randomUUID()}`);
		result.remove();
		
		return resultPath;
	} catch (error) {
		console.error('Intersect operation failed:', error);
		return null;
	}
}

/**
 * Exclude overlapping areas from paths
 * Equivalent to Illustrator's Pathfinder Exclude
 */
export function exclude(path1: VectorPath, path2: VectorPath): VectorPath | null {
	initializePaper();
	if (!paperScope) return null;
	
	try {
		const paperPath1 = vectorPathToPaperPath(path1);
		const paperPath2 = vectorPathToPaperPath(path2);
		
		const result = paperPath1.exclude(paperPath2);
		
		paperPath1.remove();
		paperPath2.remove();
		
		if (!result) return null;
		
		const resultPath = paperPathToVectorPath(result, `excluded-${crypto.randomUUID()}`);
		result.remove();
		
		return resultPath;
	} catch (error) {
		console.error('Exclude operation failed:', error);
		return null;
	}
}

/**
 * Divide paths (split paths at intersections)
 * Equivalent to Illustrator's Pathfinder Divide
 */
export function divide(paths: VectorPath[]): VectorPath[] {
	initializePaper();
	if (!paperScope || paths.length < 2) return paths;
	
	try {
		const paperPaths = paths.map(path => vectorPathToPaperPath(path));
		
		// Get all intersection results
		const results: paper.Path[] = [];
		
		for (let i = 0; i < paperPaths.length; i++) {
			for (let j = i + 1; j < paperPaths.length; j++) {
				const path1 = paperPaths[i];
				const path2 = paperPaths[j];
				
				// Create all possible combinations of operations
				const intersectResult = path1.intersect(path2);
				const subtract1Result = path1.subtract(path2);
				const subtract2Result = path2.subtract(path1);
				
				if (intersectResult && intersectResult.area > 0.1) {
					results.push(intersectResult);
				}
				if (subtract1Result && subtract1Result.area > 0.1) {
					results.push(subtract1Result);
				}
				if (subtract2Result && subtract2Result.area > 0.1) {
					results.push(subtract2Result);
				}
			}
		}
		
		// Clean up input paths
		paperPaths.forEach(path => path.remove());
		
		// Convert results back to VectorPaths
		const resultPaths = results.map((result, index) => {
			const vectorPath = paperPathToVectorPath(result, `divided-${index}-${crypto.randomUUID()}`);
			result.remove();
			return vectorPath;
		});
		
		return resultPaths.length > 0 ? resultPaths : paths;
	} catch (error) {
		console.error('Divide operation failed:', error);
		return paths;
	}
}

/**
 * Create an enhanced offset that handles self-intersections
 * Uses paper.js's robust offsetting and boolean operations
 */
export function enhancedOffset(path: VectorPath, distance: number): VectorPath | null {
	initializePaper();
	if (!paperScope) return null;
	
	try {
		const paperPath = vectorPathToPaperPath(path);
		
		// Use paper.js offset which handles self-intersections better
		const offsetResult = paperPath.offset(distance);
		paperPath.remove();
		
		if (!offsetResult) return null;
		
		// If we have multiple paths from offset, unite them
		let finalResult: paper.Path;
		if (Array.isArray(offsetResult)) {
			if (offsetResult.length === 0) return null;
			finalResult = offsetResult[0];
			for (let i = 1; i < offsetResult.length; i++) {
				const united = finalResult.unite(offsetResult[i]);
				finalResult.remove();
				offsetResult[i].remove();
				finalResult = united;
			}
		} else {
			finalResult = offsetResult;
		}
		
		const resultPath = paperPathToVectorPath(finalResult, `enhanced-offset-${crypto.randomUUID()}`);
		finalResult.remove();
		
		return resultPath;
	} catch (error) {
		console.error('Enhanced offset operation failed:', error);
		return null;
	}
}

/**
 * Cleanup paper.js scope (call when done with pathfinder operations)
 */
export function cleanupPaper(): void {
	if (paperScope) {
		paperScope.clear();
		paperScope = null;
	}
}