export interface Layer {
	id: string;
	name: string;
	type: 'print' | 'cut';
	visible: boolean;
	image?: HTMLImageElement;
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