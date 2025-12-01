import { mat4 } from 'wgpu-matrix';

/**
 * WebGPU pipeline for rendering lasso polylines
 * Uses line-strip topology to draw smooth contours
 */
export class LassoRenderPipeline {
  private pipeline!: GPURenderPipeline;
  private uniformBuffer: GPUBuffer;
  private bindGroup!: GPUBindGroup;
  private vertexBuffer: GPUBuffer;
  private vertexCount: number = 0;
  private maxVertices: number = 1024; // Support up to 1024 points
  private initialized: boolean = false;

  constructor(
    private device: GPUDevice,
    private format: GPUTextureFormat
  ) {
    this.uniformBuffer = this.createUniformBuffer();
    this.vertexBuffer = this.createVertexBuffer();
  }

  /**
   * Initialize pipeline (async due to shader loading)
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    await this.createPipeline();
    this.initialized = true;

    console.log('Lasso render pipeline initialized');
  }

  private createUniformBuffer(): GPUBuffer {
    // Just need identity matrix since points are already in NDC
    const buffer = this.device.createBuffer({
      size: 64, // mat4x4<f32>
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      label: 'Lasso Uniform Buffer'
    });

    // Write identity matrix
    const identityMatrix = mat4.identity();
    this.device.queue.writeBuffer(buffer, 0, new Float32Array(identityMatrix));

    return buffer;
  }

  private createVertexBuffer(): GPUBuffer {
    return this.device.createBuffer({
      size: this.maxVertices * 2 * 4, // vec2<f32> per vertex
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      label: 'Lasso Vertex Buffer'
    });
  }

  private async createPipeline(): Promise<void> {
    const shaderCode = await fetch('/medical/lasso_draw.wgsl').then(r => r.text());
    const shaderModule = this.device.createShaderModule({
      code: shaderCode,
      label: 'Lasso Shader'
    });

    const bindGroupLayout = this.device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX,
          buffer: { type: 'uniform' }
        }
      ],
      label: 'Lasso Bind Group Layout'
    });

    this.bindGroup = this.device.createBindGroup({
      layout: bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.uniformBuffer } }
      ],
      label: 'Lasso Bind Group'
    });

    const pipelineLayout = this.device.createPipelineLayout({
      bindGroupLayouts: [bindGroupLayout],
      label: 'Lasso Pipeline Layout'
    });

    this.pipeline = this.device.createRenderPipeline({
      layout: pipelineLayout,
      vertex: {
        module: shaderModule,
        entryPoint: 'vertexMain',
        buffers: [
          {
            arrayStride: 8, // vec2<f32> = 2 * 4 bytes
            attributes: [
              {
                shaderLocation: 0,
                offset: 0,
                format: 'float32x2'
              }
            ]
          }
        ]
      },
      fragment: {
        module: shaderModule,
        entryPoint: 'fragmentMain',
        targets: [
          {
            format: this.format,
            blend: {
              color: {
                srcFactor: 'src-alpha',
                dstFactor: 'one-minus-src-alpha',
                operation: 'add'
              },
              alpha: {
                srcFactor: 'one',
                dstFactor: 'one-minus-src-alpha',
                operation: 'add'
              }
            }
          }
        ]
      },
      primitive: {
        topology: 'line-strip',
        stripIndexFormat: undefined
      },
      multisample: {
        count: 1
      },
      label: 'Lasso Render Pipeline'
    });
  }

  /**
   * Update the vertex buffer with new points
   * @param points Array of 2D points in NDC space
   */
  updatePoints(points: ReadonlyArray<readonly [number, number]>): void {
    if (points.length === 0) {
      this.vertexCount = 0;
      return;
    }

    // Clamp to max vertices
    const numPoints = Math.min(points.length, this.maxVertices);

    if (numPoints > this.maxVertices) {
      console.warn(`Lasso has ${points.length} points, clamping to ${this.maxVertices}`);
    }

    // Create flat array of vertex data
    const vertexData = new Float32Array(numPoints * 2);
    for (let i = 0; i < numPoints; i++) {
      vertexData[i * 2] = points[i][0];
      vertexData[i * 2 + 1] = points[i][1];
    }

    // Upload to GPU
    this.device.queue.writeBuffer(this.vertexBuffer, 0, vertexData);
    this.vertexCount = numPoints;
  }

  /**
   * Render the lasso to the given render pass
   */
  render(passEncoder: GPURenderPassEncoder): void {
    if (!this.initialized) {
      console.warn('Lasso pipeline not initialized, skipping render');
      return;
    }

    if (this.vertexCount === 0) {
      return; // Nothing to draw
    }

    passEncoder.setPipeline(this.pipeline);
    passEncoder.setBindGroup(0, this.bindGroup);
    passEncoder.setVertexBuffer(0, this.vertexBuffer);
    passEncoder.draw(this.vertexCount, 1, 0, 0);
  }

  /**
   * Cleanup GPU resources
   */
  destroy(): void {
    this.uniformBuffer.destroy();
    this.vertexBuffer.destroy();
  }
}
