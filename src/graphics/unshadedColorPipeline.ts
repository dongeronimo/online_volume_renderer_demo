import type GraphicsContext from "./graphicsContext";
import { mat4, vec4 } from "gl-matrix";

/**
 * Pipeline for rendering unshaded, solid-color meshes
 * Used for UI widgets and interaction handles
 */
interface WidgetResources {
    uniformBuffer: GPUBuffer;
    bindGroup: GPUBindGroup;
}

export class UnshadedColorPipeline {
    private device: GPUDevice;
    private pipeline: GPURenderPipeline;
    private bindGroupLayout: GPUBindGroupLayout;
    private widgetPool: WidgetResources[] = [];
    private maxWidgets: number = 6; // 6 face widgets

    constructor(ctx: GraphicsContext, shaderCode: string, format: GPUTextureFormat) {
        this.device = ctx.Device();

        // Create shader module
        const shaderModule = this.device.createShaderModule({
            label: 'unshaded color shader',
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

        // Create pool of uniform buffers and bind groups for widgets
        for (let i = 0; i < this.maxWidgets; i++) {
            const uniformBuffer = this.device.createBuffer({
                label: `widget uniform buffer ${i}`,
                size: 144 * 4, // viewProjection + model + color
                usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            });

            const bindGroup = this.device.createBindGroup({
                label: `widget bind group ${i}`,
                layout: this.bindGroupLayout,
                entries: [{
                    binding: 0,
                    resource: { buffer: uniformBuffer }
                }]
            });

            this.widgetPool.push({ uniformBuffer, bindGroup });
        }

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
     * Update and render a widget
     * @param widgetIndex Index of the widget (0-5 for face widgets)
     * @param viewProjection View-projection matrix
     * @param model Model matrix
     * @param color Widget color
     * @param passEncoder Render pass encoder
     * @param vertexBuffer Vertex buffer
     * @param indexBuffer Index buffer
     * @param indexCount Number of indices
     */
    public renderWidget(
        widgetIndex: number,
        viewProjection: mat4,
        model: mat4,
        color: vec4,
        passEncoder: GPURenderPassEncoder,
        vertexBuffer: GPUBuffer,
        indexBuffer: GPUBuffer,
        indexCount: number
    ): void {
        if (widgetIndex < 0 || widgetIndex >= this.maxWidgets) {
            console.error(`Widget index ${widgetIndex} out of range [0, ${this.maxWidgets})`);
            return;
        }

        const widget = this.widgetPool[widgetIndex];

        // Update uniform buffer for this widget
        const data = new Float32Array(36); // 2 matrices * 16 + 1 vec4
        data.set(viewProjection, 0);
        data.set(model, 16);
        data.set(color, 32);
        this.device.queue.writeBuffer(widget.uniformBuffer, 0, data.buffer);

        // Render with this widget's bind group
        passEncoder.setPipeline(this.pipeline);
        passEncoder.setBindGroup(0, widget.bindGroup);
        passEncoder.setVertexBuffer(0, vertexBuffer);
        passEncoder.setIndexBuffer(indexBuffer, 'uint16');
        passEncoder.drawIndexed(indexCount);
    }
}
