import { mat4, vec3, vec4 } from 'wgpu-matrix';
import type { LassoContour } from './lassoDrawing';

/**
 * Maximum points per contour supported by compute shader
 */
const MAX_POINTS_PER_CONTOUR = 512;

/**
 * Manages compute shader execution for generating lasso mask texture
 * Performs point-in-polygon tests for each voxel against all active contours
 */
export class LassoComputePipeline {
  private pipeline!: GPUComputePipeline;
  private bindGroupLayout!: GPUBindGroupLayout;
  private bindGroup!: GPUBindGroup;

  private contoursBuffer!: GPUBuffer;
  private paramsBuffer!: GPUBuffer;

  private maskTexture!: GPUTexture;
  private maskTextureView!: GPUTextureView;

  private initialized: boolean = false;
  private volumeWidth: number = 0;
  private volumeHeight: number = 0;
  private volumeDepth: number = 0;

  constructor(private device: GPUDevice) {}

  /**
   * Initialize the compute pipeline and create buffers
   */
  async initialize(volumeWidth: number, volumeHeight: number, volumeDepth: number): Promise<void> {
    if (this.initialized) {
      console.warn('Lasso compute pipeline already initialized');
      return;
    }

    this.volumeWidth = volumeWidth;
    this.volumeHeight = volumeHeight;
    this.volumeDepth = volumeDepth;

    // Create mask texture
    this.createMaskTexture();

    // Create buffers
    this.createBuffers();

    // Load shader and create pipeline
    await this.createPipeline();

    this.initialized = true;
    console.log(`Lasso compute pipeline initialized: ${volumeWidth}×${volumeHeight}×${volumeDepth}`);
  }

  /**
   * Create the binary mask texture
   */
  private createMaskTexture(): void {
    console.log(`Creating mask texture: ${this.volumeWidth}×${this.volumeHeight}×${this.volumeDepth}`);

    this.maskTexture = this.device.createTexture({
      size: {
        width: this.volumeWidth,
        height: this.volumeHeight,
        depthOrArrayLayers: this.volumeDepth
      },
      dimension: '3d',
      format: 'r32uint',  // Changed from r8uint - r32uint supports storage binding
      usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
      label: 'Lasso Mask Texture'
    });

    this.maskTextureView = this.maskTexture.createView({
      dimension: '3d',
      label: 'Lasso Mask View (3D)'
    });

    const sizeInMB = (this.volumeWidth * this.volumeHeight * this.volumeDepth * 4 / 1024 / 1024).toFixed(2);
    console.log(`✓ Created lasso mask texture: ${this.volumeWidth}×${this.volumeHeight}×${this.volumeDepth} = ${sizeInMB} MB (r32uint)`);
    console.log(`  Texture:`, this.maskTexture);
    console.log(`  Texture View:`, this.maskTextureView);
  }

  /**
   * Create storage buffers for contours and parameters
   */
  private createBuffers(): void {
    // Contours buffer: array of ContourData structs
    // Each struct: 4 + 12 + 12 + 64 + 24 + (512 * 8) = 4212 bytes
    // Max 64 contours: 269,568 bytes (~263 KB)
    const maxContours = 64;
    const bytesPerContour = 4 + 12 + 12 + 64 + 24 + (MAX_POINTS_PER_CONTOUR * 8);
    const contoursBufferSize = maxContours * bytesPerContour;

    this.contoursBuffer = this.device.createBuffer({
      size: contoursBufferSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      label: 'Lasso Contours Buffer'
    });

    // Parameters buffer: uniform data
    // numContours (4) + volumeWidth (4) + volumeHeight (4) + volumeDepth (4) + modelMatrix (64) + padding
    this.paramsBuffer = this.device.createBuffer({
      size: 256, // Generous padding for alignment
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      label: 'Lasso Params Buffer'
    });
  }

  /**
   * Create the compute pipeline
   */
  private async createPipeline(): Promise<void> {
    const shaderCode = await fetch('/medical/compute_lasso_mask.wgsl').then(r => r.text());
    const shaderModule = this.device.createShaderModule({
      code: shaderCode,
      label: 'Lasso Compute Shader'
    });

    this.bindGroupLayout = this.device.createBindGroupLayout({
      entries: [
        {
          // Binding 0: Contours storage buffer (read-only)
          binding: 0,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: 'read-only-storage' }
        },
        {
          // Binding 1: Params uniform buffer
          binding: 1,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: 'uniform' }
        },
        {
          // Binding 2: Output mask texture (write-only)
          binding: 2,
          visibility: GPUShaderStage.COMPUTE,
          storageTexture: {
            access: 'write-only',
            format: 'r32uint',
            viewDimension: '3d'
          }
        }
      ],
      label: 'Lasso Compute Bind Group Layout'
    });

    this.bindGroup = this.device.createBindGroup({
      layout: this.bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.contoursBuffer } },
        { binding: 1, resource: { buffer: this.paramsBuffer } },
        { binding: 2, resource: this.maskTextureView }
      ],
      label: 'Lasso Compute Bind Group'
    });

    const pipelineLayout = this.device.createPipelineLayout({
      bindGroupLayouts: [this.bindGroupLayout],
      label: 'Lasso Compute Pipeline Layout'
    });

    this.pipeline = this.device.createComputePipeline({
      layout: pipelineLayout,
      compute: {
        module: shaderModule,
        entryPoint: 'main'
      },
      label: 'Lasso Compute Pipeline'
    });
  }

  /**
   * Compute the mask texture for the given contours
   */
  async computeMask(
    contours: ReadonlyArray<LassoContour>,
    modelMatrix: mat4,
    onProgress?: (current: number, total: number) => void
  ): Promise<void> {
    if (!this.initialized) {
      console.error('Lasso compute pipeline not initialized');
      return;
    }

    const startTime = performance.now();

    // Update buffers once at the start
    this.updateBuffers(contours, modelMatrix);

    // Calculate total workgroups
    const workgroupsX = Math.ceil(this.volumeWidth / 8);
    const workgroupsY = Math.ceil(this.volumeHeight / 4);
    const totalWorkgroupsZ = Math.ceil(this.volumeDepth / 4);

    // Process in chunks to avoid GPU timeout
    // Each chunk processes CHUNK_SIZE workgroup slices in Z
    const CHUNK_SIZE = 16; // Process 16 workgroups in Z at a time (= 64 slices)
    const numChunks = Math.ceil(totalWorkgroupsZ / CHUNK_SIZE);

    console.log(`🔄 Computing mask in ${numChunks} chunks (${CHUNK_SIZE} Z-workgroups per chunk)...`);

    // DEBUG: Test where center voxel projects
    if (contours.length > 0) {
      const centerVoxel = [this.volumeWidth / 2, this.volumeHeight / 2, this.volumeDepth / 2];
      const normalized = [
        centerVoxel[0] / (this.volumeWidth - 1),
        centerVoxel[1] / (this.volumeHeight - 1),
        centerVoxel[2] / (this.volumeDepth - 1)
      ];
      const volumeSpace = [
        normalized[0] * 2 - 1,
        normalized[1] * 2 - 1,
        normalized[2] * 2 - 1
      ];
      const worldPos4 = vec4.create(volumeSpace[0], volumeSpace[1], volumeSpace[2], 1.0);
      vec4.transformMat4(worldPos4, worldPos4, modelMatrix);

      const contour = contours[0];
      const viewProj = mat4.multiply(mat4.create(), contour.cameraProjectionMatrix, contour.cameraViewMatrix);
      const viewProjTransposed = mat4.transpose(mat4.create(), viewProj);
      const clipPos = vec4.create();
      vec4.transformMat4(clipPos, worldPos4, viewProjTransposed);

      if (clipPos[3] > 0) {
        const ndcX = clipPos[0] / clipPos[3];
        const ndcY = clipPos[1] / clipPos[3];
        console.log(`  🧪 Center voxel projects to NDC (${ndcX.toFixed(3)}, ${ndcY.toFixed(3)})`);
      } else {
        console.log(`  🧪 Center voxel is behind camera (w=${clipPos[3].toFixed(3)})`);
      }
    }

    // Process each chunk with a delay to allow rendering
    for (let chunkIndex = 0; chunkIndex < numChunks; chunkIndex++) {
      const zWorkgroupStart = chunkIndex * CHUNK_SIZE;
      const zWorkgroupCount = Math.min(CHUNK_SIZE, totalWorkgroupsZ - zWorkgroupStart);

      // Calculate actual Z voxel offset (workgroup index * workgroup size in Z)
      const zVoxelOffset = zWorkgroupStart * 4; // Each workgroup processes 4 voxels in Z

      // Update params buffer with Z offset for this chunk
      this.updateBuffers(contours, modelMatrix, zVoxelOffset);

      // Create command encoder for this chunk
      const commandEncoder = this.device.createCommandEncoder({
        label: `Lasso Compute Chunk ${chunkIndex + 1}/${numChunks}`
      });

      const computePass = commandEncoder.beginComputePass({
        label: `Lasso Mask Compute Pass (chunk ${chunkIndex + 1}/${numChunks})`
      });

      computePass.setPipeline(this.pipeline);
      computePass.setBindGroup(0, this.bindGroup);

      // Dispatch only this chunk's Z workgroups
      // The shader adds zOffset to compute actual voxel Z coordinates
      computePass.dispatchWorkgroups(workgroupsX, workgroupsY, zWorkgroupCount);
      computePass.end();

      // Submit this chunk
      this.device.queue.submit([commandEncoder.finish()]);

      // Wait for this chunk to complete before starting next
      // This prevents GPU queue overflow and allows browser to remain responsive
      await this.device.queue.onSubmittedWorkDone();

      // Report progress
      if (onProgress) {
        onProgress(chunkIndex + 1, numChunks);
      }
    }

    const endTime = performance.now();
    console.log(`✓ Lasso mask computed in ${(endTime - startTime).toFixed(2)}ms (${contours.length} contours, ${numChunks} chunks, ${workgroupsX}×${workgroupsY}×${totalWorkgroupsZ} total workgroups)`);
  }

  /**
   * Update GPU buffers with current contours and parameters
   */
  private updateBuffers(contours: ReadonlyArray<LassoContour>, modelMatrix: mat4, zOffset: number = 0): void {
    // Update contours buffer
    const contoursData = this.packContoursData(contours);
    this.device.queue.writeBuffer(this.contoursBuffer, 0, contoursData);

    // Update params buffer
    const paramsData = new Float32Array(64); // Plenty of space
    const paramsView = new DataView(paramsData.buffer);

    // Write as u32
    paramsView.setUint32(0, contours.length, true);  // numContours (offset 0)
    paramsView.setUint32(4, this.volumeWidth, true);  // volumeWidth (offset 4)
    paramsView.setUint32(8, this.volumeHeight, true); // volumeHeight (offset 8)
    paramsView.setUint32(12, this.volumeDepth, true); // volumeDepth (offset 12)
    paramsView.setUint32(16, zOffset, true);          // zOffset (offset 16)
    // Padding from 20-31 for mat4x4 alignment

    // Write modelMatrix at offset 32 (16-byte aligned for mat4x4)
    for (let i = 0; i < 16; i++) {
      paramsView.setFloat32(32 + i * 4, modelMatrix[i], true);
    }

    this.device.queue.writeBuffer(this.paramsBuffer, 0, paramsData);
  }

  /**
   * Pack contours into a flat array for GPU buffer
   */
  private packContoursData(contours: ReadonlyArray<LassoContour>): ArrayBuffer {
    const maxContours = 64;
    const bytesPerContour = 4 + 12 + 12 + 64 + 24 + (MAX_POINTS_PER_CONTOUR * 8);
    const buffer = new ArrayBuffer(maxContours * bytesPerContour);
    const view = new DataView(buffer);

    let offset = 0;

    console.log(`📦 Packing ${contours.length} contours for GPU...`);

    for (const contour of contours.slice(0, maxContours)) {
      const startOffset = offset;

      // numPoints: u32
      const numPoints = Math.min(contour.points.length, MAX_POINTS_PER_CONTOUR);
      view.setUint32(offset, numPoints, true);
      offset += 4;

      console.log(`  Contour: ${numPoints} points, camera=${contour.cameraPosition.map(v => v.toFixed(2)).join(',')}`);

      // cameraPosition: vec3<f32>
      view.setFloat32(offset + 0, contour.cameraPosition[0], true);
      view.setFloat32(offset + 4, contour.cameraPosition[1], true);
      view.setFloat32(offset + 8, contour.cameraPosition[2], true);
      offset += 12;

      // planeNormal: vec3<f32>
      view.setFloat32(offset + 0, contour.planeNormal[0], true);
      view.setFloat32(offset + 4, contour.planeNormal[1], true);
      view.setFloat32(offset + 8, contour.planeNormal[2], true);
      offset += 12;

      // viewProjMatrix: mat4x4<f32>
      // Correct order: projection * view (standard graphics convention)
      const viewProj = mat4.multiply(mat4.create(), contour.cameraProjectionMatrix, contour.cameraViewMatrix);

      // CRITICAL FIX: WGSL expects column-major matrices, but wgpu-matrix is row-major
      // We MUST transpose before sending to GPU!
      const viewProjTransposed = mat4.transpose(mat4.create(), viewProj);

      for (let i = 0; i < 16; i++) {
        view.setFloat32(offset + i * 4, viewProjTransposed[i], true);
      }
      offset += 64;

      // aabbMin and aabbMax: vec3<f32> each
      // Compute AABB from points (in NDC space)
      let minX = 1, minY = 1, maxX = -1, maxY = -1;
      for (const point of contour.points) {
        minX = Math.min(minX, point[0]);
        minY = Math.min(minY, point[1]);
        maxX = Math.max(maxX, point[0]);
        maxY = Math.max(maxY, point[1]);
      }

      console.log(`    AABB: X[${minX.toFixed(3)}, ${maxX.toFixed(3)}], Y[${minY.toFixed(3)}, ${maxY.toFixed(3)}]`);
      console.log(`    Sample points: [${contour.points.slice(0, 3).map(p => `(${p[0].toFixed(3)},${p[1].toFixed(3)})`).join(', ')}...]`);

      view.setFloat32(offset + 0, minX, true);
      view.setFloat32(offset + 4, minY, true);
      view.setFloat32(offset + 8, -1.0, true); // Z min (full depth range)
      offset += 12;

      view.setFloat32(offset + 0, maxX, true);
      view.setFloat32(offset + 4, maxY, true);
      view.setFloat32(offset + 8, 1.0, true); // Z max (full depth range)
      offset += 12;

      // points: array<vec2<f32>, 512>
      for (let i = 0; i < MAX_POINTS_PER_CONTOUR; i++) {
        if (i < contour.points.length) {
          view.setFloat32(offset + i * 8 + 0, contour.points[i][0], true);
          view.setFloat32(offset + i * 8 + 4, contour.points[i][1], true);
        } else {
          // Fill remaining with zeros
          view.setFloat32(offset + i * 8 + 0, 0, true);
          view.setFloat32(offset + i * 8 + 4, 0, true);
        }
      }
      offset += MAX_POINTS_PER_CONTOUR * 8;

      // Ensure offset is correct
      if (offset !== startOffset + bytesPerContour) {
        console.error(`Packing error: expected ${bytesPerContour} bytes, got ${offset - startOffset}`);
      }
    }

    return buffer;
  }

  /**
   * Get the mask texture view for binding to volume shaders
   */
  getMaskTextureView(): GPUTextureView {
    return this.maskTextureView;
  }

  /**
   * Clear the mask (set all voxels to visible)
   */
  async clearMask(): Promise<void> {
    if (!this.initialized) return;

    // Compute with zero contours will fill mask with 1s (all visible)
    await this.computeMask([], mat4.identity());
  }

  /**
   * Check if pipeline is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Cleanup GPU resources
   */
  destroy(): void {
    if (this.maskTexture) this.maskTexture.destroy();
    if (this.contoursBuffer) this.contoursBuffer.destroy();
    if (this.paramsBuffer) this.paramsBuffer.destroy();
  }
}
