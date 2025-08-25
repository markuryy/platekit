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
			const unionResult = result.unite(paperPaths[i]) as paper.Path;
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
				if (child instanceof paperScope!.Path) {
					resultPaths.push(paperPathToVectorPath(child as paper.Path, `united-${i}-${crypto.randomUUID()}`));
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