/**
 * CTF Volume Rendering Pipeline for WebGPU
 * Uses color transfer function instead of window/level
 */

export interface CTFVolumeUniforms {
  modelMatrix: Float32Array;
  viewMatrix: Float32Array;
  projectionMatrix: Float32Array;
  cameraPosition: Float32Array;
  numSlices: number;
  stepSize: number;
  densityScale: number;
  inverseModelMatrix: Float32Array;
  voxelSpacing: Float32Array;
  toggleGradient: number;
  volumeWidth: number;
  volumeHeight: number;
  volumeDepth: number;
  // CUTTING CUBE BOUNDS
  xmin: number;
  xmax: number;
  ymin: number;
  ymax: number;
  zmin: number;
  zmax: number;
}

export class VolumeRenderPipelineCTF {
  private device: GPUDevice;
  private pipeline: GPURenderPipeline;
  private bindGroup: GPUBindGroup;
  private uniformBuffer: GPUBuffer;
  private uniformData: Float32Array;
  private ctfTexture: GPUTexture;
  
  constructor(
    device: GPUDevice,
    volumeTexture: GPUTexture,
    canvasFormat: GPUTextureFormat,
    shaderCode: string,
    gradientTexture: GPUTexture
  ) {
    this.device = device;
    this.uniformData = new Float32Array(120);

    // Create uniform buffer
    this.uniformBuffer = device.createBuffer({
      size: 480, 
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // Create hardcoded CTF texture (1D, 256 entries)
    this.ctfTexture = this.createHardcodedCTF(device);

    // Create sampler
    const sampler = device.createSampler({
      magFilter: 'linear',
      minFilter: 'linear',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge',
    });

    // Create shader module
    const shaderModule = device.createShaderModule({
      code: shaderCode,
    });
    
    // Create bind group layout
    const bindGroupLayout = device.createBindGroupLayout({
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
            viewDimension: '1d',
          },
        },
      ],
    });
    
    // Create bind group
    this.bindGroup = device.createBindGroup({
      layout: bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.uniformBuffer } },
        { binding: 1, resource: volumeTexture.createView() },
        { binding: 2, resource: sampler },
        { binding: 3, resource: gradientTexture.createView() },
        { binding: 4, resource: this.ctfTexture.createView() },
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
        depthWriteEnabled: true,
        depthCompare: 'greater',
        format: 'depth24plus',
      },
    });
  }

/**
 * CTF optimized for reference step size = 0.006 (your LQ step size)
 * 
 * Design philosophy:
 * - Tune opacity values while looking at LQ mode
 * - What you see in LQ is exactly what the CTF values represent
 * - HQ mode automatically scales to look identical (just smoother)
 * 
 * Opacity interpretation:
 * - 0.1 = "10% opaque after traveling one LQ step (0.006 units)"
 * - 0.5 = "50% opaque after one LQ step"
 * - 1.0 = "fully opaque after one LQ step"
 */
private createHardcodedCTF(device: GPUDevice): GPUTexture {
  const ctfData = new Float32Array(256 * 4);
  
  for (let i = 0; i < 256; i++) {
    const hu = -1024 + (i / 255) * 4095;
    
    let r = 0, g = 0, b = 0, a = 0;
    
    // Opacity values tuned for stepSize=0.006 (LQ mode)
    // Tune these while running in LQ mode to get desired appearance
    
    // AIR & FAT: Completely transparent (< -20 HU)
    if (hu < -20) {
      a = 0.0;
    }
    // SOFT TISSUE: Nearly invisible (-20 to 80 HU)
    // Liver parenchyma is around 40-60 HU
    else if (hu < 80) {
      r = 0.2;
      g = 0.15;
      b = 0.1;
      a = 0.01; // Very subtle - allows seeing through tissue
    }
    // ENHANCED VESSELS START: Bright orange (80 to 150 HU)
    // Portal vein, hepatic vessels with IV contrast
    else if (hu < 150) {
      const t = (hu - 80) / 70.0;
      r = 1.0;
      g = 0.4 + 0.2 * t;
      b = 0.0;
      // Cubic ramp for sharper vessel definition
      a = 0.10 + 0.30 * (t * t * t); // 0.10 to 0.40
    }
    // STRONG VESSELS: Yellow-orange (150 to 280 HU)
    // Arterial phase, strongly enhanced vessels
    else if (hu < 280) {
      const t = (hu - 150) / 130.0;
      r = 1.0;
      g = 0.6 + 0.3 * t;
      b = 0.2 * t;
      a = 0.40 + 0.30 * t; // 0.40 to 0.70
    }
    // BONE TRANSITION: Yellow-white (280 to 500 HU)
    else if (hu < 500) {
      const t = (hu - 280) / 220.0;
      r = 1.0;
      g = 0.9 + 0.1 * t;
      b = 0.4 + 0.6 * t;
      a = 0.70 + 0.20 * t; // 0.70 to 0.90
    }
    // DENSE BONE: Nearly opaque white (500+ HU)
    else {
      r = 1.0;
      g = 1.0;
      b = 1.0;
      a = 0.90 + Math.min((hu - 500) / 2500.0 * 0.10, 0.10); // 0.90 to 1.00
    }
    
    ctfData[i * 4 + 0] = r;
    ctfData[i * 4 + 1] = g;
    ctfData[i * 4 + 2] = b;
    ctfData[i * 4 + 3] = a;
  }
  
  const texture = device.createTexture({
    size: [256, 1, 1],
    format: 'rgba32float',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    dimension: '1d',
  });
  
  device.queue.writeTexture(
    { texture },
    ctfData.buffer,
    { bytesPerRow: 256 * 16 },
    [256, 1, 1]
  );
  
  return texture;
}

/**
 * TUNING WORKFLOW:
 * 
 * 1. Set your app to LQ mode (stepSize = 0.006)
 * 2. Adjust CTF opacity values above
 * 3. Reload and view - what you see is what those values mean
 * 4. Too dark? Increase opacity values (e.g., vessels 0.10-0.40 → 0.20-0.60)
 * 5. Too bright/opaque? Decrease opacity values
 * 6. Once LQ looks good, switch to HQ - should look identical!
 * 
 * OPACITY GRADIENT BENEFITS:
 * 
 * With standard [0,1] opacity range:
 * - Tissue (0.01) → Vessel (0.40): Δα = 0.39 (LARGE gradient)
 * - Vessel (0.40) → Bone (0.70): Δα = 0.30 (MEDIUM gradient)
 * - Bone interior (0.90) → Bone (0.90): Δα = 0.0 (NO gradient)
 * 
 * You can now compute opacity gradients and threshold them:
 * - gradient > 0.20: Strong visual boundary (apply full lighting)
 * - gradient > 0.10: Moderate boundary (apply partial lighting)
 * - gradient < 0.10: Interior (no lighting)
 * 
 * This enables using HU gradients selectively based on opacity changes!
 */

  private uniformsToBuffer(uniforms: CTFVolumeUniforms): Float32Array {
    const data = new Float32Array(120); 

    data.set(uniforms.modelMatrix, 0);        // 0-15
    data.set(uniforms.viewMatrix, 16);        // 16-31
    data.set(uniforms.projectionMatrix, 32);  // 32-47

    data[48] = uniforms.cameraPosition[0];
    data[49] = uniforms.cameraPosition[1];
    data[50] = uniforms.cameraPosition[2];

    data[52] = uniforms.numSlices;
    data[53] = uniforms.stepSize;
    data[54] = uniforms.densityScale;

    data.set(uniforms.inverseModelMatrix, 56); // 56-71

    data[76] = uniforms.voxelSpacing[0];
    data[77] = uniforms.voxelSpacing[1];
    data[78] = uniforms.voxelSpacing[2];

    const uint32View = new Uint32Array(data.buffer);
    uint32View[80] = uniforms.toggleGradient;
    uint32View[81] = uniforms.volumeWidth;
    uint32View[82] = uniforms.volumeHeight;
    uint32View[83] = uniforms.volumeDepth;

    // CUTTING CUBE BOUNDS
    data[84] = uniforms.xmin;
    data[85] = uniforms.xmax;
    data[86] = uniforms.ymin;
    data[87] = uniforms.ymax;
    data[88] = uniforms.zmin;
    data[89] = uniforms.zmax;

    return data;
  }

  public updateUniforms(uniforms: CTFVolumeUniforms): void {
    this.uniformData = this.uniformsToBuffer(uniforms);
    this.device.queue.writeBuffer(this.uniformBuffer, 0, this.uniformData.buffer);
  }

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