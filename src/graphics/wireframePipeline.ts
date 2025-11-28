import type GraphicsContext from "./graphicsContext";
import { mat4, vec4 } from "gl-matrix";

/**
 * Pipeline for rendering wireframe meshes using barycentric coordinates
 *
 * DESIGN RATIONALE:
 * This pipeline uses a specialized shader that renders triangle edges as wireframes
 * without requiring edge indices. It works with standard indexed triangle meshes.
 *
 * USAGE:
 * - Cutting cube: render as opaque wireframe
 * - Unselected widgets: render as opaque wireframe (for outline)
 * - Widget transparency: can also render semi-transparent for layering effects
 *
 * RESOURCE POOLING:
 * Like UnshadedColorPipeline, this pre-allocates uniform buffers and bind groups
 * to avoid allocations during render loop. Each widget gets its own resources.
 */
interface WireframeResources {
    uniformBuffer: GPUBuffer;
    bindGroup: GPUBindGroup;
}

export class WireframePipeline {
    private device: GPUDevice;
    private pipeline: GPURenderPipeline;
    private bindGroupLayout: GPUBindGroupLayout;
    private resourcePool: WireframeResources[] = [];
    private maxObjects: number = 7; // 1 cutting cube + 6 face widgets

    constructor(ctx: GraphicsContext, shaderCode: string, format: GPUTextureFormat) {
        this.device = ctx.Device();

        // Create shader module
        const shaderModule = this.device.createShaderModule({
            label: 'wireframe shader',
            code: shaderCode,
        });

        // Create bind group layout
        // Same layout as UnshadedColorPipeline: single uniform buffer with matrices + color
        this.bindGroupLayout = this.device.createBindGroupLayout({
            label: 'wireframe bind group layout',
            entries: [{
                binding: 0,
                visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                buffer: { type: 'uniform' }
            }]
        });

        // Create pool of uniform buffers and bind groups
        // REASONING: Pre-allocate to avoid allocations in render loop
        // Each object (cutting cube or widget) gets dedicated resources
        for (let i = 0; i < this.maxObjects; i++) {
            const uniformBuffer = this.device.createBuffer({
                label: `wireframe uniform buffer ${i}`,
                size: 144 * 4, // viewProjection (64B) + model (64B) + color (16B) = 144 floats
                usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            });

            const bindGroup = this.device.createBindGroup({
                label: `wireframe bind group ${i}`,
                layout: this.bindGroupLayout,
                entries: [{
                    binding: 0,
                    resource: { buffer: uniformBuffer }
                }]
            });

            this.resourcePool.push({ uniformBuffer, bindGroup });
        }

        // Create pipeline layout
        const pipelineLayout = this.device.createPipelineLayout({
            label: 'wireframe pipeline layout',
            bindGroupLayouts: [this.bindGroupLayout]
        });

        // Create render pipeline
        this.pipeline = this.device.createRenderPipeline({
            label: 'wireframe pipeline',
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
                        // NOTE: Wireframe shader doesn't use normal or uv, but we keep
                        // the vertex format compatible with our standard meshes
                        {
                            shaderLocation: 1,
                            offset: 12,
                            format: 'float32x3', // normal (unused)
                        },
                        {
                            shaderLocation: 2,
                            offset: 24,
                            format: 'float32x2', // uv (unused)
                        },
                    ],
                }],
            },
            fragment: {
                module: shaderModule,
                entryPoint: 'fs_main',
                targets: [{
                    format: format,
                    // Enable alpha blending for semi-transparent wireframes
                    // REASONING: Allows rendering translucent wireframe overlays
                    // when needed (though most wireframes will be fully opaque)
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
                depthWriteEnabled: false,  // Don't write depth - render on top like widgets
                depthCompare: 'always',     // Always pass depth test to overlay on geometry
                format: 'depth24plus',
            },
        });
    }

    /**
     * Render an object with wireframe
     *
     * @param objectIndex Index for resource pooling (0 = cutting cube, 1-6 = widgets)
     * @param viewProjection Combined view-projection matrix
     * @param model Model matrix for positioning/scaling
     * @param color Wireframe line color (RGBA, alpha supported)
     * @param passEncoder Render pass encoder
     * @param vertexBuffer Mesh vertex buffer
     * @param indexBuffer Mesh index buffer (triangle indices)
     * @param indexCount Number of indices to draw
     */
    public renderWireframe(
        objectIndex: number,
        viewProjection: mat4,
        model: mat4,
        color: vec4,
        passEncoder: GPURenderPassEncoder,
        vertexBuffer: GPUBuffer,
        indexBuffer: GPUBuffer,
        indexCount: number
    ): void {
        if (objectIndex < 0 || objectIndex >= this.maxObjects) {
            console.error(`Wireframe object index ${objectIndex} out of range [0, ${this.maxObjects})`);
            return;
        }

        const resources = this.resourcePool[objectIndex];

        // DEBUG: Log the color being set
        console.log(`[Wireframe ${objectIndex}] Color:`, color);

        // Update uniform buffer
        // Layout matches shader: viewProjection (mat4) + model (mat4) + color (vec4)
        const data = new Float32Array(36); // 16 + 16 + 4 = 36 floats
        data.set(viewProjection, 0);       // Offset 0: mat4x4<f32> (16 floats)
        data.set(model, 16);                // Offset 16: mat4x4<f32> (16 floats)
        data.set(color, 32);                // Offset 32: vec4<f32> (4 floats)

        // DEBUG: Verify color was written correctly
        console.log(`[Wireframe ${objectIndex}] Buffer color:`, data[32], data[33], data[34], data[35]);

        this.device.queue.writeBuffer(resources.uniformBuffer, 0, data.buffer);

        // Issue draw call
        passEncoder.setPipeline(this.pipeline);
        passEncoder.setBindGroup(0, resources.bindGroup);
        passEncoder.setVertexBuffer(0, vertexBuffer);
        passEncoder.setIndexBuffer(indexBuffer, 'uint16');
        passEncoder.drawIndexed(indexCount);
    }
}
