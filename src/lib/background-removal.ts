import { AutoModel, AutoProcessor, env, RawImage } from '@huggingface/transformers';

env.allowLocalModels = false;
env.backends.onnx.wasm.proxy = true;

// Initialize GPU detection and model settings
let modelPromise: Promise<any> | null = null;
let processorPromise: Promise<any> | null = null;
let isInitialized = false;

async function initializeModel() {
	if (isInitialized) return;
	
	// Dynamic import to handle CommonJS module
	const { getGPUTier } = await import('detect-gpu');
	const gpuTier = await getGPUTier();
	const modelSettings: Parameters<typeof AutoModel.from_pretrained>[1] = {
		config: { model_type: 'custom' },
	};
	
	if (gpuTier?.fps && !gpuTier?.isMobile) {
		modelSettings.device = 'webgpu';
		modelSettings.dtype = 'fp32';
	}
	
	modelPromise = AutoModel.from_pretrained('briaai/RMBG-1.4', modelSettings);
	processorPromise = AutoProcessor.from_pretrained('briaai/RMBG-1.4', {
		config: {
			do_normalize: true,
			do_pad: false,
			do_rescale: true,
			do_resize: true,
			image_mean: [0.5, 0.5, 0.5],
			feature_extractor_type: 'ImageFeatureExtractor',
			image_std: [1, 1, 1],
			resample: 2,
			rescale_factor: 0.00392156862745098,
			size: { width: 1024, height: 1024 },
		},
	});
	
	isInitialized = true;
}

export async function removeBackground(image: HTMLImageElement): Promise<HTMLImageElement> {
	await initializeModel();
	
	if (!modelPromise || !processorPromise) {
		throw new Error('Model not initialized');
	}
	
	// Convert HTMLImageElement to canvas to get image data
	const inputCanvas = document.createElement('canvas');
	inputCanvas.width = image.naturalWidth;
	inputCanvas.height = image.naturalHeight;
	const inputCtx = inputCanvas.getContext('2d')!;
	inputCtx.drawImage(image, 0, 0);
	
	// Create RawImage from canvas data URL
	const rawImage = await RawImage.fromURL(inputCanvas.toDataURL());
	
	// Preprocess image
	const processor = await processorPromise;
	const { pixel_values } = await processor(rawImage);
	
	// Predict alpha matte
	const model = await modelPromise;
	const { output } = await model({ input: pixel_values });
	
	// Resize mask back to original size
	const mask = await RawImage.fromTensor(output[0].mul(255).to('uint8')).resize(
		rawImage.width,
		rawImage.height,
	);
	
	// Create new canvas for output
	const outputCanvas = document.createElement('canvas');
	outputCanvas.width = rawImage.width;
	outputCanvas.height = rawImage.height;
	const outputCtx = outputCanvas.getContext('2d')!;
	
	// Draw original image to output canvas
	outputCtx.drawImage(rawImage.toCanvas(), 0, 0);
	
	// Update alpha channel with mask
	const pixelData = outputCtx.getImageData(0, 0, rawImage.width, rawImage.height);
	for (let i = 0; i < mask.data.length; ++i) {
		pixelData.data[4 * i + 3] = mask.data[i];
	}
	outputCtx.putImageData(pixelData, 0, 0);
	
	// Convert canvas to HTMLImageElement
	const outputImage = new Image();
	return new Promise((resolve, reject) => {
		outputImage.onload = () => resolve(outputImage);
		outputImage.onerror = reject;
		outputImage.src = outputCanvas.toDataURL();
	});
}