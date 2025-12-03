/**
 * Offscreen render target for GPU picking
 * Renders object IDs to an r32uint texture for mouse picking
 */
export class PickingRenderTarget {
    private device: GPUDevice;
    private pickingTexture: GPUTexture | undefined;
    private pickingTextureView: GPUTextureView | undefined;
    private width: number = 0;
    private height: number = 0;

    constructor() {
        this.device = null as any; // Will be set in init
    }

    public init(device: GPUDevice): void {
        this.device = device;
    }

    /**
     * Create or recreate picking texture with new dimensions
     */
    public createTarget(width: number, height: number): void {
        // Destroy old texture if it exists
        if (this.pickingTexture) {
            this.pickingTexture.destroy();
        }

        this.width = width;
        this.height = height;

        // Create picking texture (r32uint - single channel 32-bit unsigned integer)
        this.pickingTexture = this.device.createTexture({
            label: 'picking texture',
            size: { width, height },
            format: 'r32uint',
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
        });

        this.pickingTextureView = this.pickingTexture.createView({
            label: 'picking texture view',
        });
    }

    public getPickingTextureView(): GPUTextureView {
        if (!this.pickingTextureView) {
            throw new Error("Picking render target not initialized");
        }
        return this.pickingTextureView;
    }

    public getWidth(): number {
        return this.width;
    }

    public getHeight(): number {
        return this.height;
    }

    /**
     * Read the object ID at the given pixel coordinates
     * @param x Screen X coordinate
     * @param y Screen Y coordinate
     * @returns Object ID (0 = no object, 1-6 = face widget IDs)
     */
    public async readPixel(x: number, y: number): Promise<number> {
        if (!this.pickingTexture) {
            throw new Error("Picking render target not initialized");
        }

        // Clamp coordinates to texture bounds
        const clampedX = Math.floor(Math.max(0, Math.min(x, this.width - 1)));
        const clampedY = Math.floor(Math.max(0, Math.min(y, this.height - 1)));

        // WebGPU requires bytesPerRow to be a multiple of 256
        // For r32uint (4 bytes/pixel), we need to copy at least 64 pixels
        const bytesPerPixel = 4;
        const minPixelsPerRow = 256 / bytesPerPixel; // 64 pixels
        const copyWidth = Math.min(minPixelsPerRow, this.width);
        const copyHeight = 1;
        const bufferSize = minPixelsPerRow * bytesPerPixel; // 256 bytes minimum

        // Calculate starting X position for the copy to include our target pixel
        // Try to center the target pixel in the strip, but adjust for edges
        const copyStartX = Math.max(0, Math.min(clampedX - Math.floor(copyWidth / 2), this.width - copyWidth));

        // Create staging buffer for a horizontal strip
        const stagingBuffer = this.device.createBuffer({
            label: 'picking readback staging buffer',
            size: bufferSize,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
        });

        // Create command encoder for the copy operation
        const commandEncoder = this.device.createCommandEncoder({
            label: 'picking readback encoder',
        });

        // Copy a 64-pixel horizontal strip that includes our target pixel
        commandEncoder.copyTextureToBuffer(
            {
                texture: this.pickingTexture,
                origin: { x: copyStartX, y: clampedY, z: 0 },
            },
            {
                buffer: stagingBuffer,
                bytesPerRow: 256,
                rowsPerImage: copyHeight,
            },
            {
                width: copyWidth,
                height: copyHeight,
                depthOrArrayLayers: 1,
            }
        );

        this.device.queue.submit([commandEncoder.finish()]);

        // Wait for GPU to complete and map buffer
        await stagingBuffer.mapAsync(GPUMapMode.READ);
        const data = new Uint32Array(stagingBuffer.getMappedRange());

        // Index into the buffer using offset from copy start
        const bufferIndex = clampedX - copyStartX;
        const objectId = data[bufferIndex];

        stagingBuffer.unmap();
        stagingBuffer.destroy();

        return objectId;
    }
}
