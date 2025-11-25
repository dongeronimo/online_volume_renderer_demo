import type GraphicsContext from "../graphics/graphicsContext";
import type { ParsedDicomMetadata } from "./metadata";

export async function ComputeGradient(ctx:GraphicsContext, metadata:ParsedDicomMetadata, volumeTexture:GPUTexture):Promise<GPUTexture>{
    //5) Create gradient texture and compute gradients
    console.log("Computing gradients...");
    const gradientTexture = ctx.Device().createTexture({
      size: {
        width: metadata.width,
        height: metadata.height,
        depthOrArrayLayers: metadata.numSlices
      },
      dimension: '2d',
      format: 'rgba16float',
      usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
    });

    // Load compute shader
    const computeShaderFetch = await fetch("medical/compute_gradient.wgsl");
    const computeShaderSrc = await computeShaderFetch.text();
    const computeShaderModule = ctx.Device().createShaderModule({
      code: computeShaderSrc,
    });

    // Create params buffer
    const paramsBuffer = ctx.Device().createBuffer({
      size: 16, // 4 u32s
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    ctx.Device().queue.writeBuffer(paramsBuffer, 0, new Uint32Array([
      metadata.width,
      metadata.height,
      metadata.numSlices,
      0 // padding
    ]));

    // Create bind group layout
    const computeBindGroupLayout = ctx.Device().createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: 'float', viewDimension: '2d-array' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, storageTexture: { access: 'write-only', format: 'rgba16float', viewDimension: '2d-array' } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
      ],
    });

    const computeBindGroup = ctx.Device().createBindGroup({
      layout: computeBindGroupLayout,
      entries: [
        { binding: 0, resource: volumeTexture.createView() },
        { binding: 1, resource: gradientTexture.createView() },
        { binding: 2, resource: { buffer: paramsBuffer } },
      ],
    });

    // Create compute pipeline
    const computePipeline = ctx.Device().createComputePipeline({
      layout: ctx.Device().createPipelineLayout({
        bindGroupLayouts: [computeBindGroupLayout],
      }),
      compute: {
        module: computeShaderModule,
        entryPoint: 'main',
      },
    });

    // Execute compute shader
    const commandEncoder = ctx.Device().createCommandEncoder();
    const passEncoder = commandEncoder.beginComputePass();
    passEncoder.setPipeline(computePipeline);
    passEncoder.setBindGroup(0, computeBindGroup);

    // Dispatch enough workgroups to cover the volume
    const workgroupsX = Math.ceil(metadata.width / 8);
    const workgroupsY = Math.ceil(metadata.height / 8);
    const workgroupsZ = metadata.numSlices;

    passEncoder.dispatchWorkgroups(workgroupsX, workgroupsY, workgroupsZ);
    passEncoder.end();
    ctx.Device().queue.submit([commandEncoder.finish()]);

    console.log("Gradients computed!");
    return gradientTexture;
}