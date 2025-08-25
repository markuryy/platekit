import type { Layer, PageSize } from './types';
import { getPageSizeInfo } from './page-sizes';
import { jsPDF } from 'jspdf';

export interface ExportOptions {
	pageSize: PageSize;
	layers: Layer[];
	dpi?: number; // For raster exports
}

/**
 * Export layers as a PDF
 * Creates a PDF with the canvas rendered at the specified DPI
 */
export async function exportToPDF(options: ExportOptions): Promise<Blob> {
	const { pageSize, layers, dpi = 300 } = options;
	const pageInfo = getPageSizeInfo(pageSize);
	
	// Calculate scale factor from 72 DPI (points) to target DPI
	const scaleFactor = dpi / 72;
	const canvasWidth = pageInfo.width * scaleFactor;
	const canvasHeight = pageInfo.height * scaleFactor;
	
	// Create off-screen canvas for high-resolution rendering
	const canvas = document.createElement('canvas');
	canvas.width = canvasWidth;
	canvas.height = canvasHeight;
	const ctx = canvas.getContext('2d');
	
	if (!ctx) {
		throw new Error('Unable to create canvas context for PDF export');
	}
	
	// Set white background
	ctx.fillStyle = '#ffffff';
	ctx.fillRect(0, 0, canvasWidth, canvasHeight);
	
	// Sort layers by zIndex and render only visible print layers
	const visiblePrintLayers = layers
		.filter(layer => layer.visible && layer.type === 'print' && layer.image)
		.sort((a, b) => a.zIndex - b.zIndex);
	
	for (const layer of visiblePrintLayers) {
		if (!layer.image) continue;
		
		ctx.save();
		
		// Set opacity
		ctx.globalAlpha = layer.opacity;
		
		// Calculate scaled dimensions
		const scaledX = layer.x * scaleFactor;
		const scaledY = layer.y * scaleFactor;
		const scaledWidth = layer.width * scaleFactor;
		const scaledHeight = layer.height * scaleFactor;
		
		// Apply transforms (rotation, scaling)
		const centerX = scaledX + scaledWidth / 2;
		const centerY = scaledY + scaledHeight / 2;
		
		ctx.translate(centerX, centerY);
		ctx.rotate((layer.rotation * Math.PI) / 180);
		ctx.scale(layer.scaleX, layer.scaleY);
		ctx.translate(-scaledWidth / 2, -scaledHeight / 2);
		
		// Draw image
		ctx.drawImage(layer.image, 0, 0, scaledWidth, scaledHeight);
		
		ctx.restore();
	}
	
	// Create PDF with exact page dimensions
	const pdf = new jsPDF({
		orientation: 'portrait',
		unit: 'pt',
		format: [pageInfo.width, pageInfo.height]
	});
	
	// Convert canvas to image data and add to PDF
	const imgData = canvas.toDataURL('image/png', 1.0);
	pdf.addImage(imgData, 'PNG', 0, 0, pageInfo.width, pageInfo.height);
	
	// Return PDF as blob
	return pdf.output('blob');
}

/**
 * Export layers as an SVG
 * Creates an SVG with only vector cut paths (no raster images)
 */
export function exportToSVG(options: ExportOptions): string {
	const { pageSize, layers } = options;
	const pageInfo = getPageSizeInfo(pageSize);
	
	let svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
     width="${pageInfo.width}pt" height="${pageInfo.height}pt"
     viewBox="0 0 ${pageInfo.width} ${pageInfo.height}">
  <rect x="0" y="0" width="${pageInfo.width}" height="${pageInfo.height}" fill="white"/>
`;
	
	// Sort layers by zIndex and filter to only cut layers
	const cutLayers = [...layers]
		.filter(layer => layer.visible && layer.type === 'cut' && layer.vectorPaths)
		.sort((a, b) => a.zIndex - b.zIndex);
	
	for (const layer of cutLayers) {
		if (!layer.vectorPaths) continue;
		
		// Add vector paths group
		svg += `  <g transform="translate(${layer.x} ${layer.y}) rotate(${layer.rotation} ${layer.width/2} ${layer.height/2}) scale(${layer.scaleX} ${layer.scaleY})" opacity="${layer.opacity}">
`;
		
		for (const path of layer.vectorPaths) {
			if (path.points.length < 2) continue;
			
			let pathData = '';
			const scaledPoints = path.points.map(point => ({
				x: (point.x / (layer.image?.naturalWidth || 1)) * layer.width,
				y: (point.y / (layer.image?.naturalHeight || 1)) * layer.height
			}));
			
			if (scaledPoints.length > 0) {
				pathData = `M ${scaledPoints[0].x} ${scaledPoints[0].y}`;
				for (let i = 1; i < scaledPoints.length; i++) {
					pathData += ` L ${scaledPoints[i].x} ${scaledPoints[i].y}`;
				}
				if (path.closed) {
					pathData += ' Z';
				}
			}
			
			// Export as solid black stroke for cutting
			svg += `    <path d="${pathData}" stroke="#000000" stroke-width="0.5" fill="none"/>
`;
		}
		
		svg += `  </g>
`;
	}
	
	svg += '</svg>';
	return svg;
}

/**
 * Download a blob as a file
 */
export function downloadBlob(blob: Blob, filename: string): void {
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	URL.revokeObjectURL(url);
}

/**
 * Download SVG as a file
 */
export function downloadSVG(svg: string, filename: string): void {
	const blob = new Blob([svg], { type: 'image/svg+xml' });
	downloadBlob(blob, filename);
}