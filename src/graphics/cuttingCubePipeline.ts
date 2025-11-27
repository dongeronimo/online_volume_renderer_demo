import type GraphicsContext from "./graphicsContext";
import { mat4 } from "gl-matrix";

/**
 * Pipeline for rendering the translucent cutting cube
 */
export class CuttingCubePipeline {
    private device: GPUDevice;
    private pipeline: GPURenderPipeline;
    private bindGroup: GPUBindGroup;
    private uniformBuffer: GPUBuffer;
    private bindGroupLayout: GPUBindGroupLayout;

    constructor(ctx: GraphicsContext, shaderCode: string, format: GPUTextureFormat) {
        this.device = ctx.Device();

        // Create uniform buffer (viewProjection + model matrix = 64 + 64 = 128 floats)
        this.uniformBuffer = this.device.createBuffer({
            size: 128 * 4, // 128 floats * 4 bytes
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        // Create shader module
        const shaderModule = this.device.createShaderModule({
            code: shaderCode,
        });

        // Create bind group layout
        this.bindGroupLayout = this.device.createBindGroupLayout({
            label: 'cutting cube bind group layout',
            entries: [{
                binding: 0,
                visibility: GPUShaderStage.VERTEX,
                buffer: { type: 'uniform' }
            }]
        });

        // Create bind group
        this.bindGroup = this.device.createBindGroup({
            layout: this.bindGroupLayout,
            entries: [{
                binding: 0,
                resource: { buffer: this.uniformBuffer }
            }]
        });

        // Create pipeline layout
        const pipelineLayout = this.device.createPipelineLayout({
            label: 'cutting cube pipeline layout',
            bindGroupLayouts: [this.bindGroupLayout]
        });

        // Create render pipeline
        this.pipeline = this.device.createRenderPipeline({
            label: 'cutting cube pipeline',
            layout: pipelineLayout,
            vertex: {
                module: shaderModule,
                entryPoint: 'vs_main',
                buffers: [{
                    arrayStride: 32, // 3*4 + 3*4 + 2*4 = 32 bytes (position, normal, uv)
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
                    format: format,
                    blend: {
                        color: {
                            srcFactor: 'src-alpha',
                            dstFactor: 'one-minus-src-alpha',
                            operation: 'add',
                        },
                        alpha: {
                            srcFactor: 'one',
                            dstFactor: 'one-minus-src-alpha',
                            operation: 'add',
                        },
                    },
                }],
            },
            primitive: {
                topology: 'triangle-list',
                cullMode: 'back',
                frontFace: 'ccw',
            },
            depthStencil: {
                depthWriteEnabled: false,  // Don't write depth - overlay on top
                depthCompare: 'always',     // Always pass depth test
                format: 'depth24plus',
            },
        });
    }

    /**
     * Update uniforms with viewProjection and model matrices
     */
    public updateUniforms(viewProjection: mat4, model: mat4): void {
        const data = new Float32Array(32); // 2 matrices * 16 floats

        // Copy viewProjection matrix
        data.set(viewProjection, 0);

        // Copy model matrix
        data.set(model, 16);

        this.device.queue.writeBuffer(this.uniformBuffer, 0, data.buffer);
    }

    /**
     * Render the cutting cube
     */
    public render(
        passEncoder: GPURenderPassEncoder,
        vertexBuffer: GPUBuffer,
        indexBuffer: GPUBuffer,
        indexCount: number
    ): void {
        passEncoder.setPipeline(this.pipeline);
        passEncoder.setBindGroup(0, this.bindGroup);
        passEncoder.setVertexBuffer(0, vertexBuffer);
        passEncoder.setIndexBuffer(indexBuffer, 'uint16');
        passEncoder.drawIndexed(indexCount);
    }
}
