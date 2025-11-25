/**
 * Simple fullscreen quad pipeline that renders a texture to screen
 */

export class FullscreenQuadPipeline {
  private device: GPUDevice;
  private pipeline: GPURenderPipeline;
  private bindGroup: GPUBindGroup;
  private sampler: GPUSampler;

  constructor(device: GPUDevice, canvasFormat: GPUTextureFormat) {
    this.device = device;

    // Create sampler
    this.sampler = device.createSampler({
      magFilter: 'linear',
      minFilter: 'linear',
    });

    // Shader code - simple passthrough
    const shaderCode = `
      struct VertexOutput {
        @builtin(position) position: vec4<f32>,
        @location(0) uv: vec2<f32>,
      }

      @vertex
      fn vertexMain(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
        var output: VertexOutput;
        
        // Generate fullscreen triangle
        let x = f32((vertexIndex << 1u) & 2u);
        let y = f32(vertexIndex & 2u);
        
        output.position = vec4<f32>(x * 2.0 - 1.0, 1.0 - y * 2.0, 0.0, 1.0);
        output.uv = vec2<f32>(x, y);
        
        return output;
      }

      @group(0) @binding(0) var textureSampler: sampler;
      @group(0) @binding(1) var inputTexture: texture_2d<f32>;

      @fragment
      fn fragmentMain(input: VertexOutput) -> @location(0) vec4<f32> {
        return textureSample(inputTexture, textureSampler, input.uv);
      }
    `;

    const shaderModule = device.createShaderModule({
      code: shaderCode,
    });

    // Create bind group layout
    const bindGroupLayout = device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.FRAGMENT,
          sampler: { type: 'filtering' },
        },
        {
          binding: 1,
          visibility: GPUShaderStage.FRAGMENT,
          texture: { sampleType: 'float' },
        },
      ],
    });

    // Create pipeline layout
    const pipelineLayout = device.createPipelineLayout({
      bindGroupLayouts: [bindGroupLayout],
    });

    // Create render pipeline
    this.pipeline = device.createRenderPipeline({
      layout: pipelineLayout,
      vertex: {
        module: shaderModule,
        entryPoint: 'vertexMain',
      },
      fragment: {
        module: shaderModule,
        entryPoint: 'fragmentMain',
        targets: [{
          format: canvasFormat,
        }],
      },
      primitive: {
        topology: 'triangle-list',
      },
    });

    // Create initial bind group (will be updated when texture changes)
    this.bindGroup = device.createBindGroup({
      layout: bindGroupLayout,
      entries: [
        { binding: 0, resource: this.sampler },
        { binding: 1, resource: device.createTexture({
          size: { width: 1, height: 1 },
          format: canvasFormat,
          usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT,
        }).createView() },
      ],
    });
  }

  // private bindGroupMap:Map<GPUTextureView, GPUBindGroup> = new Map(); 
  /**
   * Update the texture to render
   */
  public setTexture(textureView: GPUTextureView): void {
    this.bindGroup = this.device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: this.sampler },
        { binding: 1, resource: textureView },
      ],
    });
  }

  /**
   * Render the fullscreen quad
   */
  public render(passEncoder: GPURenderPassEncoder): void {
    passEncoder.setPipeline(this.pipeline);
    passEncoder.setBindGroup(0, this.bindGroup);
    passEncoder.draw(3, 1, 0, 0); // Draw single triangle covering screen
  }
}