/**
 * Create a 3D texture suitable for storage (read/write in compute shaders)
 */
function createStorageTexture(
  device: GPUDevice,
  width: number,
  height: number,
  numSlices: number
): GPUTexture {
  return device.createTexture({
    size: {
      width: width,
      height: height,
      depthOrArrayLayers: numSlices
    },
    dimension: '2d',
    format: 'r32float',  // Use r32float for compute shader storage
    usage: 
      GPUTextureUsage.STORAGE_BINDING |      // For write access in compute shaders
      GPUTextureUsage.TEXTURE_BINDING |      // For read access in compute shaders
      GPUTextureUsage.COPY_SRC |             // Can be copied from
      GPUTextureUsage.COPY_DST,              // Can be copied to
  });
}

/**
 * Copy entire contents from one texture to another
 * Textures must have the same dimensions and format
 */
export function copyTexture(
  device: GPUDevice,
  source: GPUTexture,
  destination: GPUTexture
): void {
  const commandEncoder = device.createCommandEncoder();
  
  commandEncoder.copyTextureToTexture(
    { texture: source },
    { texture: destination },
    {
      width: source.width,
      height: source.height,
      depthOrArrayLayers: source.depthOrArrayLayers
    }
  );
  
  device.queue.submit([commandEncoder.finish()]);
}

/**
 * Alternative: Copy with explicit dimensions
 */
export function copyTextureWithSize(
  device: GPUDevice,
  source: GPUTexture,
  destination: GPUTexture,
  width: number,
  height: number,
  numSlices: number
): void {
  const commandEncoder = device.createCommandEncoder();
  
  commandEncoder.copyTextureToTexture(
    { texture: source },
    { texture: destination },
    {
      width: width,
      height: height,
      depthOrArrayLayers: numSlices
    }
  );
  
  device.queue.submit([commandEncoder.finish()]);
}

/**
 * If your source texture has a different format (like r16float),
 * you need to convert it using a compute shader instead
 */
async function convertAndCopyTexture(
  device: GPUDevice,
  source: GPUTexture,  // e.g., r16float
  destination: GPUTexture,  // r32float
  width: number,
  height: number,
  numSlices: number
): Promise<void> {
  // Simple conversion shader
  const conversionShader = `
    @group(0) @binding(0) var sourceTexture: texture_2d_array<f32>;
    @group(0) @binding(1) var destTexture: texture_storage_2d_array<r32float, write>;
    
    @compute @workgroup_size(8, 8, 1)
    fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
      if (global_id.x >= ${width}u || global_id.y >= ${height}u || global_id.z >= ${numSlices}u) {
        return;
      }
      
      let value = textureLoad(sourceTexture, vec2<i32>(global_id.xy), i32(global_id.z), 0).r;
      textureStore(destTexture, vec2<i32>(global_id.xy), i32(global_id.z), vec4<f32>(value, 0.0, 0.0, 0.0));
    }
  `;
  
  const shaderModule = device.createShaderModule({
    code: conversionShader,
  });
  
  const pipeline = device.createComputePipeline({
    layout: 'auto',
    compute: {
      module: shaderModule,
      entryPoint: 'main',
    },
  });
  
  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: source.createView() },
      { binding: 1, resource: destination.createView() },
    ],
  });
  
  const commandEncoder = device.createCommandEncoder();
  const passEncoder = commandEncoder.beginComputePass();
  passEncoder.setPipeline(pipeline);
  passEncoder.setBindGroup(0, bindGroup);
  passEncoder.dispatchWorkgroups(
    Math.ceil(width / 8),
    Math.ceil(height / 8),
    numSlices
  );
  passEncoder.end();
  device.queue.submit([commandEncoder.finish()]);
}

export default async function applyPeronaMalik(
  device: GPUDevice,
  inputTexture: GPUTexture,
  width: number,
  height: number,
  numSlices: number,
  iterations: number = 10,
  K: number = 0.1,
  lambda: number = 0.2,
  diffusionType: number = 2
): Promise<GPUTexture> {
  
  // Load shader from file
  const shaderFetch = await fetch("medical/perona_malik.wgsl");
  const shaderCode = await shaderFetch.text();
  const shaderModule = device.createShaderModule({
    code: shaderCode,
  });
  
  // Create two r32float textures for ping-pong
  const texture1 = createStorageTexture(device, width, height, numSlices);
  const texture2 = createStorageTexture(device, width, height, numSlices);
  
  // Convert and copy input to texture1
  await convertAndCopyTexture(device, inputTexture, texture1, width, height, numSlices);
  
  // Create params buffer
  const paramsBuffer = device.createBuffer({
    size: 32,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  
  device.queue.writeBuffer(paramsBuffer, 0, new Uint32Array([
    width, height, numSlices, 0  // padding0
  ]));
  device.queue.writeBuffer(paramsBuffer, 16, new Float32Array([
    K, lambda
  ]));
  device.queue.writeBuffer(paramsBuffer, 24, new Uint32Array([
    diffusionType, 0  // padding1
  ]));
  
  // Create explicit bind group layout
  const bindGroupLayout = device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.COMPUTE,
        texture: {
          sampleType: 'unfilterable-float',  // Important! r32float is unfilterable
          viewDimension: '2d-array',
        }
      },
      {
        binding: 1,
        visibility: GPUShaderStage.COMPUTE,
        storageTexture: {
          access: 'write-only',
          format: 'r32float',
          viewDimension: '2d-array',
        }
      },
      {
        binding: 2,
        visibility: GPUShaderStage.COMPUTE,
        buffer: {
          type: 'uniform',
        }
      }
    ]
  });
  
  // Create pipeline with explicit layout
  const pipelineLayout = device.createPipelineLayout({
    bindGroupLayouts: [bindGroupLayout],
  });
  
  const pipeline = device.createComputePipeline({
    layout: pipelineLayout,
    compute: {
      module: shaderModule,
      entryPoint: 'main',
    },
  });
  
  // Iterate ping-pong
  for (let i = 0; i < iterations; i++) {
    const input = i % 2 === 0 ? texture1 : texture2;
    const output = i % 2 === 0 ? texture2 : texture1;
    
    const bindGroup = device.createBindGroup({
      layout: bindGroupLayout,  // Use explicit layout
      entries: [
        { binding: 0, resource: input.createView() },
        { binding: 1, resource: output.createView() },
        { binding: 2, resource: { buffer: paramsBuffer } },
      ],
    });
    
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginComputePass();
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(
      Math.ceil(width / 8),
      Math.ceil(height / 8),
      numSlices
    );
    pass.end();
    device.queue.submit([encoder.finish()]);
    // CRITICAL: Wait after EVERY iteration for Chrome stability
    console.log(`Perona-Malik iteration ${i + 1}/${iterations}`);
    await device.queue.onSubmittedWorkDone();
  }
  console.log("done smoothing loops");
  // Get final r32float result
  const finalR32 = iterations % 2 === 0 ? texture1 : texture2;
  if(finalR32 == texture1) {
    texture2.destroy();
  }
  else {
    texture1.destroy();
  }
  console.log("converting back to f16");
  // Convert back to r16float to save memory
  const finalR16 = await convertR32toR16(device, finalR32, width, height, numSlices);
  console.log("done converting");
  // Clean up r32float textures
  finalR32.destroy();
  
  return finalR16;
}

/**
 * Convert r32float back to r16float using a render pass
 * OPTIMAL: Uses separate uniform buffers per slice to avoid race conditions
 */
async function convertR32toR16(
  device: GPUDevice,
  source: GPUTexture,
  width: number,
  height: number,
  numSlices: number
): Promise<GPUTexture> {
  // Create r16float destination
  const destination = device.createTexture({
    size: {
      width: width,
      height: height,
      depthOrArrayLayers: numSlices
    },
    dimension: '2d',
    format: 'r16float',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT,
  });

  const shader = `
    struct VertexOutput {
      @builtin(position) position: vec4<f32>,
      @location(0) texCoord: vec2<f32>,
    }

    @vertex
    fn vs_main(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
      var output: VertexOutput;
      // Fullscreen triangle
      let x = f32((vertexIndex << 1u) & 2u);
      let y = f32(vertexIndex & 2u);
      output.position = vec4<f32>(x * 2.0 - 1.0, 1.0 - y * 2.0, 0.0, 1.0);
      output.texCoord = vec2<f32>(x, y);
      return output;
    }

    struct SliceParams {
      sliceIndex: u32,
    }

    @group(0) @binding(0) var sourceTexture: texture_2d_array<f32>;
    @group(0) @binding(1) var<uniform> params: SliceParams;

    @fragment
    fn fs_main(input: VertexOutput) -> @location(0) f32 {
      return textureLoad(sourceTexture, vec2<i32>(input.position.xy), i32(params.sliceIndex), 0).r;
    }
  `;

  const shaderModule = device.createShaderModule({
    code: shader,
  });

  // Create bind group layout
  const bindGroupLayout = device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.FRAGMENT,
        texture: {
          sampleType: 'unfilterable-float',
          viewDimension: '2d-array',
        }
      },
      {
        binding: 1,
        visibility: GPUShaderStage.FRAGMENT,
        buffer: {
          type: 'uniform',
        }
      }
    ]
  });

  const pipelineLayout = device.createPipelineLayout({
    bindGroupLayouts: [bindGroupLayout],
  });

  // Create single pipeline
  const pipeline = device.createRenderPipeline({
    layout: pipelineLayout,
    vertex: {
      module: shaderModule,
      entryPoint: 'vs_main',
    },
    fragment: {
      module: shaderModule,
      entryPoint: 'fs_main',
      targets: [{
        format: 'r16float',
      }],
    },
    primitive: {
      topology: 'triangle-list',
    },
  });

  // Pre-create uniform buffers and bind groups for all slices
  console.log("Preparing uniform buffers...");
  const sliceData: Array<{
    buffer: GPUBuffer;
    bindGroup: GPUBindGroup;
  }> = [];

  for (let slice = 0; slice < numSlices; slice++) {
    const buffer = device.createBuffer({
      size: 4,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });
    
    // Write slice index during creation
    new Uint32Array(buffer.getMappedRange()).set([slice]);
    buffer.unmap();

    const bindGroup = device.createBindGroup({
      layout: bindGroupLayout,
      entries: [
        { binding: 0, resource: source.createView() },
        { binding: 1, resource: { buffer } },
      ],
    });

    sliceData.push({ buffer, bindGroup });
  }

  console.log("Converting slices...");
  
  // Batch render passes
  const BATCH_SIZE = 32;
  
  for (let batchStart = 0; batchStart < numSlices; batchStart += BATCH_SIZE) {
    const batchEnd = Math.min(batchStart + BATCH_SIZE, numSlices);
    const commandEncoder = device.createCommandEncoder();

    for (let slice = batchStart; slice < batchEnd; slice++) {
      const renderPass = commandEncoder.beginRenderPass({
        colorAttachments: [{
          view: destination.createView({
            dimension: '2d',
            baseArrayLayer: slice,
            arrayLayerCount: 1,
          }),
          loadOp: 'clear',
          storeOp: 'store',
        }],
      });

      renderPass.setPipeline(pipeline);
      renderPass.setBindGroup(0, sliceData[slice].bindGroup);
      renderPass.draw(3, 1, 0, 0);
      renderPass.end();
    }

    device.queue.submit([commandEncoder.finish()]);
    await device.queue.onSubmittedWorkDone();
    
    if ((batchEnd % 64 === 0) || batchEnd === numSlices) {
      console.log(`Converted ${batchEnd}/${numSlices} slices to f16`);
    }
  }

  // Cleanup all buffers
  console.log("Cleaning up...");
  for (const data of sliceData) {
    data.buffer.destroy();
  }

  return destination;
}