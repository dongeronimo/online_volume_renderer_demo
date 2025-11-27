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
            size: { width, height },
            format: 'r32uint',
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
        });

        this.pickingTextureView = this.pickingTexture.createView();
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

        // Create staging buffer to read back the pixel
        const bytesPerPixel = 4; // r32uint = 4 bytes
        const stagingBuffer = this.device.createBuffer({
            size: bytesPerPixel,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
        });

        // Create command encoder for the copy operation
        const commandEncoder = this.device.createCommandEncoder();

        // Copy single pixel from texture to buffer
        commandEncoder.copyTextureToBuffer(
            {
                texture: this.pickingTexture,
                origin: { x: clampedX, y: clampedY, z: 0 },
            },
            {
                buffer: stagingBuffer,
                bytesPerRow: bytesPerPixel,
                rowsPerImage: 1,
            },
            {
                width: 1,
                height: 1,
                depthOrArrayLayers: 1,
            }
        );

        this.device.queue.submit([commandEncoder.finish()]);

        // Wait for GPU to complete and map buffer
        await stagingBuffer.mapAsync(GPUMapMode.READ);
        const data = new Uint32Array(stagingBuffer.getMappedRange());
        const objectId = data[0];

        stagingBuffer.unmap();
        stagingBuffer.destroy();

        return objectId;
    }
}
