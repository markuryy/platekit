import type { PageSize, PageSizeInfo } from './types';

export const PAGE_SIZES: Record<PageSize, PageSizeInfo> = {
	'us-letter': {
		name: 'US Letter',
		width: 612, // 8.5" at 72 DPI
		height: 792, // 11" at 72 DPI
		displaySize: '8.5" × 11"'
	},
	'a4': {
		name: 'A4',
		width: 595, // 8.27" at 72 DPI
		height: 842, // 11.69" at 72 DPI
		displaySize: '8.27" × 11.69"'
	},
	'a5': {
		name: 'A5',
		width: 420, // 5.83" at 72 DPI
		height: 595, // 8.27" at 72 DPI
		displaySize: '5.83" × 8.27"'
	}
};

export function getPageSizeInfo(pageSize: PageSize): PageSizeInfo {
	return PAGE_SIZES[pageSize];
}