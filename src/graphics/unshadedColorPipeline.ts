import type GraphicsContext from "./graphicsContext";
import { mat4, vec4 } from "gl-matrix";

/**
 * Pipeline for rendering unshaded, solid-color meshes
 * Used for UI widgets and interaction handles
 */
export class UnshadedColorPipeline {
    private device: GPUDevice;
    private pipeline: GPURenderPipeline;
    private currentBindGroup: GPUBindGroup | undefined;
    private uniformBuffer: GPUBuffer;
    private bindGroupLayout: GPUBindGroupLayout;

    constructor(ctx: GraphicsContext, shaderCode: string, format: GPUTextureFormat) {
        this.device = ctx.Device();

        // Create uniform buffer (viewProjection + model + color = 64 + 64 + 16 = 144 floats)
        this.uniformBuffer = this.device.createBuffer({
            size: 144 * 4, // 36 mat4x4 + vec4
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        // Create shader module
        const shaderModule = this.device.createShaderModule({
            code: shaderCode,
        });

        // Create bind group layout
        this.bindGroupLayout = this.device.createBindGroupLayout({
            label: 'unshaded color bind group layout',
            entries: [{
                binding: 0,
                visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                buffer: { type: 'uniform' }
            }]
        });

        // Don't create bind group here - create it per-draw

        // Create pipeline layout
        const pipelineLayout = this.device.createPipelineLayout({
            label: 'unshaded color pipeline layout',
            bindGroupLayouts: [this.bindGroupLayout]
        });

        // Create render pipeline
        this.pipeline = this.device.createRenderPipeline({
            label: 'unshaded color pipeline',
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
                }],
            },
            primitive: {
                topology: 'triangle-list',
                cullMode: 'back',
                frontFace: 'ccw',
            },
            depthStencil: {
                depthWriteEnabled: false,  // Don't write depth - render on top
                depthCompare: 'always',     // Always pass depth test
                format: 'depth24plus',
            },
        });
    }

    /**
     * Update uniforms with viewProjection, model matrix, and color
     */
    public updateUniforms(viewProjection: mat4, model: mat4, color: vec4): void {
        const data = new Float32Array(36); // 2 matrices * 16 + 1 vec4

        // Copy viewProjection matrix
        data.set(viewProjection, 0);

        // Copy model matrix
        data.set(model, 16);

        // Copy color
        data.set(color, 32);

        this.device.queue.writeBuffer(this.uniformBuffer, 0, data.buffer);

        // Create a new bind group for this draw with the updated buffer
        this.currentBindGroup = this.device.createBindGroup({
            layout: this.bindGroupLayout,
            entries: [{
                binding: 0,
                resource: { buffer: this.uniformBuffer }
            }]
        });
    }

    /**
     * Render a mesh with the current uniforms
     */
    public render(
        passEncoder: GPURenderPassEncoder,
        vertexBuffer: GPUBuffer,
        indexBuffer: GPUBuffer,
        indexCount: number
    ): void {
        if (!this.currentBindGroup) {
            console.error("updateUniforms must be called before render");
            return;
        }

        passEncoder.setPipeline(this.pipeline);
        passEncoder.setBindGroup(0, this.currentBindGroup);
        passEncoder.setVertexBuffer(0, vertexBuffer);
        passEncoder.setIndexBuffer(indexBuffer, 'uint16');
        passEncoder.drawIndexed(indexCount);
    }
}
