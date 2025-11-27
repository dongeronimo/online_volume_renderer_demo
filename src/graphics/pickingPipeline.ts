import type GraphicsContext from "./graphicsContext";
import { mat4 } from "gl-matrix";

/**
 * Pipeline for GPU picking - renders object IDs to r32uint texture
 */
interface PickingResources {
    uniformBuffer: GPUBuffer;
    bindGroup: GPUBindGroup;
}

export class PickingPipeline {
    private device: GPUDevice;
    private pipeline: GPURenderPipeline;
    private bindGroupLayout: GPUBindGroupLayout;
    private pickingPool: PickingResources[] = [];
    private maxObjects: number = 6; // 6 face widgets

    constructor(ctx: GraphicsContext, shaderCode: string) {
        this.device = ctx.Device();

        // Create shader module
        const shaderModule = this.device.createShaderModule({
            code: shaderCode,
        });

        // Create bind group layout
        this.bindGroupLayout = this.device.createBindGroupLayout({
            label: 'picking bind group layout',
            entries: [{
                binding: 0,
                visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                buffer: { type: 'uniform' }
            }]
        });

        // Create pool of uniform buffers and bind groups
        for (let i = 0; i < this.maxObjects; i++) {
            const uniformBuffer = this.device.createBuffer({
                size: 144, // viewProjection + model + objectId + padding = 64 + 64 + 16
                usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            });

            const bindGroup = this.device.createBindGroup({
                layout: this.bindGroupLayout,
                entries: [{
                    binding: 0,
                    resource: { buffer: uniformBuffer }
                }]
            });

            this.pickingPool.push({ uniformBuffer, bindGroup });
        }

        // Create pipeline layout
        const pipelineLayout = this.device.createPipelineLayout({
            label: 'picking pipeline layout',
            bindGroupLayouts: [this.bindGroupLayout]
        });

        // Create render pipeline
        this.pipeline = this.device.createRenderPipeline({
            label: 'picking pipeline',
            layout: pipelineLayout,
            vertex: {
                module: shaderModule,
                entryPoint: 'vs_main',
                buffers: [{
                    arrayStride: 32, // position + normal + uv
                    stepMode: 'vertex',
                    attributes: [
                        {
                            shaderLocation: 0,
                            offset: 0,
                            format: 'float32x3', // position
                        },
                        {
                            shaderLocation: 1,
                            offset: 12,
                            format: 'float32x3', // normal
                        },
                        {
                            shaderLocation: 2,
                            offset: 24,
                            format: 'float32x2', // uv
                        },
                    ],
                }],
            },
            fragment: {
                module: shaderModule,
                entryPoint: 'fs_main',
                targets: [{
                    format: 'r32uint', // Single channel unsigned integer
                }],
            },
            primitive: {
                topology: 'triangle-list',
                cullMode: 'back',
                frontFace: 'ccw',
            },
            // No depth testing for picking - render all objects
        });
    }

    /**
     * Render an object for picking
     * @param objectIndex Index of the object (0-5 for face widgets)
     * @param objectId ID to write for this object (1-6, 0 is reserved for background)
     * @param viewProjection View-projection matrix
     * @param model Model matrix
     * @param passEncoder Render pass encoder
     * @param vertexBuffer Vertex buffer
     * @param indexBuffer Index buffer
     * @param indexCount Number of indices
     */
    public renderObject(
        objectIndex: number,
        objectId: number,
        viewProjection: mat4,
        model: mat4,
        passEncoder: GPURenderPassEncoder,
        vertexBuffer: GPUBuffer,
        indexBuffer: GPUBuffer,
        indexCount: number
    ): void {
        if (objectIndex < 0 || objectIndex >= this.maxObjects) {
            console.error(`Object index ${objectIndex} out of range [0, ${this.maxObjects})`);
            return;
        }

        const resources = this.pickingPool[objectIndex];

        // Update uniform buffer for this object
        const data = new Float32Array(36); // 32 floats for matrices + 4 for objectId + padding
        data.set(viewProjection, 0);   // Offset 0-15
        data.set(model, 16);            // Offset 16-31

        const uint32View = new Uint32Array(data.buffer);
        uint32View[32] = objectId;      // Offset 32 (u32)
        // Padding at 33, 34, 35 automatically set to 0

        this.device.queue.writeBuffer(resources.uniformBuffer, 0, data.buffer);

        // Render with this object's bind group
        passEncoder.setPipeline(this.pipeline);
        passEncoder.setBindGroup(0, resources.bindGroup);
        passEncoder.setVertexBuffer(0, vertexBuffer);
        passEncoder.setIndexBuffer(indexBuffer, 'uint16');
        passEncoder.drawIndexed(indexCount);
    }
}
