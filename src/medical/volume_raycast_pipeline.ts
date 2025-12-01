/**
 * Volume Rendering Pipeline with Bricking Acceleration
 */

export interface VolumeUniforms {
  modelMatrix: Float32Array;
  viewMatrix: Float32Array;
  projectionMatrix: Float32Array;
  cameraPosition: Float32Array;
  numSlices: number;
  stepSize: number;
  densityScale: number;
  inverseModelMatrix: Float32Array;
  windowCenter: number;
  windowWidth: number;
  voxelSpacing: Float32Array;
  toggleGradient: number;
  volumeWidth: number;
  volumeHeight: number;
  volumeDepth: number;
  chunkSize: number;
  numChunksX: number;
  numChunksY: number;
  numChunksZ: number;
  // NEW PARAMETERS
  ambient: number;
  densityForMarchSpaceSkipping: number;
  skipMultiplier: number;
  subtleSurfaceThreshold: number;
  surfaceThreshold: number;
  maxSteps: number;
  minGradientMagnitude: number;
  accumulatedThreshold: number;
  transmittanceThreshold: number;
  // CUTTING CUBE BOUNDS
  xmin: number;
  xmax: number;
  ymin: number;
  ymax: number;
  zmin: number;
  zmax: number;
}

export class VolumeRenderPipeline {
  private device: GPUDevice;
  private pipeline: GPURenderPipeline;
  private bindGroup: GPUBindGroup;
  private bindGroupLayout!: GPUBindGroupLayout;
  private uniformBuffer: GPUBuffer;
  private uniformData: Float32Array;
  private accelerationTexture: GPUTexture;
  private volumeTextureView: GPUTextureView;
  private gradientTextureView: GPUTextureView;
  private sampler: GPUSampler;
  private lassoMaskTextureView!: GPUTextureView;

  constructor(
    device: GPUDevice,
    volumeTexture: GPUTexture,
    canvasFormat: GPUTextureFormat,
    shaderCode: string,
    gradientTexture: GPUTexture,
    chunkMinMaxData: Float32Array,
    numChunksX: number,
    numChunksY: number,
    numChunksZ: number
  ) {
    this.device = device;
    this.uniformData = new Float32Array(128);

    // Create uniform buffer (increased size for chunk params)
    this.uniformBuffer = device.createBuffer({
      size: 512,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // Create 3D acceleration texture from chunk min/max data
    this.accelerationTexture = this.createAccelerationTexture(
      chunkMinMaxData,
      numChunksX,
      numChunksY,
      numChunksZ
    );

    // Store texture views
    this.volumeTextureView = volumeTexture.createView();
    this.gradientTextureView = gradientTexture.createView();

    // Create sampler
    this.sampler = device.createSampler({
      magFilter: 'linear',
      minFilter: 'linear',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge',
    });

    // Create dummy lasso mask texture (all visible)
    this.lassoMaskTextureView = this.createDummyMaskTexture();

    // Create shader module
    const shaderModule = device.createShaderModule({
      code: shaderCode,
    });

    // Create bind group layout
    this.bindGroupLayout = device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: 'uniform' },
        },
        {
          binding: 1,
          visibility: GPUShaderStage.FRAGMENT,
          texture: {
            sampleType: 'float',
            viewDimension: '2d-array',
          },
        },
        {
          binding: 2,
          visibility: GPUShaderStage.FRAGMENT,
          sampler: { type: 'filtering' },
        },
        {
          binding: 3,
          visibility: GPUShaderStage.FRAGMENT,
          texture: {
            sampleType: 'float',
            viewDimension: '2d-array'
          }
        },
        {
          binding: 4,
          visibility: GPUShaderStage.FRAGMENT,
          texture: {
            sampleType: 'unfilterable-float',
            viewDimension: '3d'
          }
        },
        {
          binding: 5,
          visibility: GPUShaderStage.FRAGMENT,
          texture: {
            sampleType: 'uint',
            viewDimension: '3d'
          }
        }
      ],
    });

    // Create bind group
    this.bindGroup = device.createBindGroup({
      layout: this.bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.uniformBuffer } },
        { binding: 1, resource: this.volumeTextureView },
        { binding: 2, resource: this.sampler },
        { binding: 3, resource: this.gradientTextureView },
        { binding: 4, resource: this.accelerationTexture.createView() },
        { binding: 5, resource: this.lassoMaskTextureView }
      ],
    });

    // Create pipeline layout
    const pipelineLayout = device.createPipelineLayout({
      bindGroupLayouts: [this.bindGroupLayout],
    });

    // Create render pipeline
    this.pipeline = device.createRenderPipeline({
      layout: pipelineLayout,
      vertex: {
        module: shaderModule,
        entryPoint: 'vertexMain',
        buffers: [{
          arrayStride: 32,
          attributes: [
            {
              shaderLocation: 0,
              offset: 0,
              format: 'float32x3',
            },
            {
              shaderLocation: 1,
              offset: 12,
              format: 'float32x3',
            },
            {
              shaderLocation: 2,
              offset: 24,
              format: 'float32x2',
            },
          ],
        }],
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
        cullMode: 'none',
      },
      depthStencil: {
        depthWriteEnabled: false,  // Volume rendering doesn't have meaningful depth
        depthCompare: 'greater',
        format: 'depth24plus',
      },
    });
  }

  /**
   * Create 3D texture for acceleration structure
   * Format: RG32Float (min, max per chunk)
   */
  private createAccelerationTexture(
    chunkData: Float32Array,
    width: number,
    height: number,
    depth: number
  ): GPUTexture {
    const texture = this.device.createTexture({
      size: { width, height, depthOrArrayLayers: depth },
      dimension: '3d',
      format: 'rg32float',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });

    // Upload data
    this.device.queue.writeTexture(
      { texture },
      chunkData.buffer,
      {
        bytesPerRow: width * 8, // 2 floats * 4 bytes
        rowsPerImage: height,
      },
      { width, height, depthOrArrayLayers: depth }
    );

    return texture;
  }

  /**
   * Convert TypeScript uniforms to buffer data
   */
  private uniformsToBuffer(uniforms: VolumeUniforms): Float32Array {
    const data = new Float32Array(128);

    data.set(uniforms.modelMatrix, 0);
    data.set(uniforms.viewMatrix, 16);
    data.set(uniforms.projectionMatrix, 32);

    data[48] = uniforms.cameraPosition[0];
    data[49] = uniforms.cameraPosition[1];
    data[50] = uniforms.cameraPosition[2];

    data[52] = uniforms.numSlices;
    data[53] = uniforms.stepSize;
    data[54] = uniforms.densityScale;

    data.set(uniforms.inverseModelMatrix, 56);

    data[72] = uniforms.windowCenter;
    data[73] = uniforms.windowWidth;

    data[76] = uniforms.voxelSpacing[0];
    data[77] = uniforms.voxelSpacing[1];
    data[78] = uniforms.voxelSpacing[2];

    const uint32View = new Uint32Array(data.buffer);
    uint32View[80] = uniforms.toggleGradient;
    uint32View[81] = uniforms.volumeWidth;
    uint32View[82] = uniforms.volumeHeight;
    uint32View[83] = uniforms.volumeDepth;

    uint32View[84] = uniforms.chunkSize;
    uint32View[85] = uniforms.numChunksX;
    uint32View[86] = uniforms.numChunksY;
    uint32View[87] = uniforms.numChunksZ;

    // NEW PARAMETERS
    data[88] = uniforms.ambient;
    data[89] = uniforms.densityForMarchSpaceSkipping;
    data[90] = uniforms.skipMultiplier;
    data[91] = uniforms.subtleSurfaceThreshold;

    data[92] = uniforms.surfaceThreshold;

    uint32View[93] = uniforms.maxSteps;
    data[94] = uniforms.minGradientMagnitude;
    data[95] = uniforms.accumulatedThreshold;

    data[96] = uniforms.transmittanceThreshold;

    // CUTTING CUBE BOUNDS
    data[100] = uniforms.xmin;
    data[101] = uniforms.xmax;
    data[102] = uniforms.ymin;
    data[103] = uniforms.ymax;
    data[104] = uniforms.zmin;
    data[105] = uniforms.zmax;

    return data;
  }

  /**
   * Update uniforms before rendering
   */
  public updateUniforms(uniforms: VolumeUniforms): void {
    this.uniformData = this.uniformsToBuffer(uniforms);
    this.device.queue.writeBuffer(this.uniformBuffer, 0, this.uniformData.buffer);
  }

  /**
   * Render the volume cube
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

  /**
   * Create a dummy 1x1x1 mask texture (all voxels visible)
   */
  private createDummyMaskTexture(): GPUTextureView {
    const dummyTexture = this.device.createTexture({
      size: { width: 1, height: 1, depthOrArrayLayers: 1 },
      dimension: '3d',
      format: 'r8uint',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
      label: 'Dummy Lasso Mask'
    });

    // Fill with 1 (all visible)
    this.device.queue.writeTexture(
      { texture: dummyTexture },
      new Uint8Array([1]),
      { bytesPerRow: 1, rowsPerImage: 1 },
      { width: 1, height: 1, depthOrArrayLayers: 1 }
    );

    return dummyTexture.createView();
  }

  /**
   * Update the lasso mask texture (recreates bind group)
   */
  public setMaskTexture(maskTextureView: GPUTextureView): void {
    this.lassoMaskTextureView = maskTextureView;

    // Recreate bind group with new mask texture
    this.bindGroup = this.device.createBindGroup({
      layout: this.bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.uniformBuffer } },
        { binding: 1, resource: this.volumeTextureView },
        { binding: 2, resource: this.sampler },
        { binding: 3, resource: this.gradientTextureView },
        { binding: 4, resource: this.accelerationTexture.createView() },
        { binding: 5, resource: this.lassoMaskTextureView }
      ],
    });
  }
}