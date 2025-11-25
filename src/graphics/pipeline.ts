import type { Camera, PhongMaterial, Transform } from "./entities/gameObject";
import type GraphicsContext from "./graphicsContext";
import type { StaticMesh } from "./meshBufferManager";

const CAMERA_UNIFORMS_SZ = 64 + 16;

function createStaticVertexDesc(module: GPUShaderModule): GPUVertexState {
    const vertexDesc: GPUVertexState = {
      module: module,
      entryPoint: 'vs_main',
      buffers: [{
        arrayStride: 32, // 3*4 + 3*4 + 2*4 = 32 bytes per vertex
        stepMode: 'vertex',
        attributes: [
          // position: vec3<f32>
          { format: 'float32x3', offset: 0, shaderLocation: 0 },
          // normal: vec3<f32>
          { format: 'float32x3', offset: 12, shaderLocation: 1 },
          // uv: vec2<f32>
          { format: 'float32x2', offset: 24, shaderLocation: 2 },
        ]
      }]
    };
    return vertexDesc;
}

function bindGroupLayoutsForStaticPhong(device:GPUDevice):GPUBindGroupLayout[]{
  // Group 0: Camera uniforms
  let viewProjBindGroup = device.createBindGroupLayout({
          label:'viewprojection',
          entries: [{
            binding: 0,
            visibility: GPUShaderStage.VERTEX|GPUShaderStage.FRAGMENT,
            buffer: {
              type:'uniform'
            }
          }]});
  
  // Group 1: Model matrices and material data
  let modelBindGroup = device.createBindGroupLayout({
          label:'model',
          entries: [
            {
              binding:0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage'}
            },
            {
              binding:1, visibility: GPUShaderStage.FRAGMENT, buffer: {type: 'read-only-storage'}
            }
        ]});
  
  // Group 2: Textures (diffuse + specular)
  let textureBindGroup = device.createBindGroupLayout({
          label:'textures',
          entries: [
            {
              binding: 0,
              visibility: GPUShaderStage.FRAGMENT,
              sampler: { type: 'filtering' }
            },
            {
              binding: 1,
              visibility: GPUShaderStage.FRAGMENT,
              texture: { 
                sampleType: 'float',
                viewDimension: '2d'
              }
            },
            {
              binding: 2,
              visibility: GPUShaderStage.FRAGMENT,
              texture: {
                sampleType: 'float',
                viewDimension: '2d'
              }
            },
            {
              binding: 3,
              visibility: GPUShaderStage.FRAGMENT,
              texture: {
                sampleType: 'float',
                viewDimension: '2d'
              }
            }
          ]
        });
  
  return [viewProjBindGroup, modelBindGroup, textureBindGroup];
}

function createStaticFragmentDesc(module: GPUShaderModule,
    format: GPUTextureFormat): GPUFragmentState {
    const fragDesc = {
      module: module,
      entryPoint: 'fs_main',
      targets: [{
        format: format,
      }]
    };
    return fragDesc;
}

// Key for texture combinations
type TextureKey = string; // "diffuseId|specularId" or "none" for no textures

interface RenderBatch {
  mesh: StaticMesh;
  textureKey: TextureKey;
  instances: Array<{
    transform: Transform;
    material: PhongMaterial;
  }>;
}

export default class Pipeline {
    readonly pipelineLayout: GPUPipelineLayout;
    readonly pipeline: GPURenderPipeline;
    readonly bindGroupLayouts: GPUBindGroupLayout[];
    private sampler: GPUSampler;
    private defaultWhiteTexture: GPUTexture;
    private defaultBlackTexture: GPUTexture;
    
    constructor(
        private ctx:GraphicsContext, 
        shaderModule: GPUShaderModule,
        format: GPUTextureFormat,
        name:string,
        private textureTable: Map<string, GPUTexture>
    ) {
        this.bindGroupLayouts = bindGroupLayoutsForStaticPhong(ctx.Device());
        const vertexDesc:GPUVertexState = createStaticVertexDesc(shaderModule);
        const fragDesc:GPUFragmentState = createStaticFragmentDesc(shaderModule, format);
        const primitiveDesc: GPUPrimitiveState = {
          topology: 'triangle-list',
          cullMode: 'back',
          frontFace: 'ccw',
        };
        const depthStencilDesc: GPUDepthStencilState = {
          format: 'depth24plus',
          depthWriteEnabled: true,
          depthCompare: 'greater',  
        };
        this.pipelineLayout = ctx.Device().createPipelineLayout({
            label: name+"Layout",
            bindGroupLayouts : this.bindGroupLayouts
        });
        this.pipeline = ctx.Device().createRenderPipeline({
            label: name+"Pipeline",
            vertex: vertexDesc,
            fragment: fragDesc,
            primitive: primitiveDesc,
            depthStencil: depthStencilDesc,
            layout: this.pipelineLayout,
        });
        
        // Create camera buffer
        this.cameraBuffer = ctx.Device().createBuffer({
          size: CAMERA_UNIFORMS_SZ,
          usage: GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST
        });
        
        this.cameraBindGroup = ctx.Device().createBindGroup({
          layout: this.bindGroupLayouts[0],
          entries: [{
            binding: 0,
            resource: {
              buffer: this.cameraBuffer,
              offset: 0,
              size: CAMERA_UNIFORMS_SZ
            }
          }]
        });
        
        // Create sampler for textures
        this.sampler = ctx.Device().createSampler({
          label: 'texture sampler',
          magFilter: 'linear',
          minFilter: 'linear',
          mipmapFilter: 'linear',
          addressModeU: 'repeat',
          addressModeV: 'repeat',
        });
        
        // Create default textures (1x1 white and black)
        this.defaultWhiteTexture = this.createSolidColorTexture([255, 255, 255, 255]);
        this.defaultBlackTexture = this.createSolidColorTexture([0, 0, 0, 255]);
    }
    
    private createSolidColorTexture(color: number[]): GPUTexture {
        const texture = this.ctx.Device().createTexture({
            size: [1, 1, 1],
            format: 'rgba8unorm',
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
        });
        
        const data = new Uint8Array(color);
        this.ctx.Device().queue.writeTexture(
            { texture },
            data,
            { bytesPerRow: 4 },
            [1, 1, 1]
        );
        
        return texture;
    }
    
    // Texture bind group cache
    private textureBindGroupCache: Map<TextureKey, GPUBindGroup> = new Map();
    
    private getOrCreateTextureBindGroup(textureKey: TextureKey): GPUBindGroup {
        // Check cache first
        let bindGroup = this.textureBindGroupCache.get(textureKey);
        if (bindGroup) return bindGroup;
        
        // Parse texture key
        let diffuseTexture = this.defaultWhiteTexture;
        let specularTexture = this.defaultBlackTexture;
        let shininessTexture = this.defaultWhiteTexture;
        if (textureKey !== "none") {
            const [diffuseId, specularId, shininessId] = textureKey.split('|');
            
            if (diffuseId && diffuseId !== "none") {
                const tex = this.textureTable.get(diffuseId);
                if (tex) diffuseTexture = tex;
            }
            
            if (specularId && specularId !== "none") {
                const tex = this.textureTable.get(specularId);
                if (tex) specularTexture = tex;
            }
            
            if(shininessId && shininessId !== "none") {
              const tex = this.textureTable.get(specularId);
              if(tex) shininessTexture = tex;
            }
        }
        
        // Create bind group
        bindGroup = this.ctx.Device().createBindGroup({
            layout: this.bindGroupLayouts[2],
            entries: [
                {
                    binding: 0,
                    resource: this.sampler
                },
                {
                    binding: 1,
                    resource: diffuseTexture.createView()
                },
                {
                    binding: 2,
                    resource: specularTexture.createView()
                },
                {
                    binding: 3,
                    resource: shininessTexture.createView()
                }
            ]
        });
        
        this.textureBindGroupCache.set(textureKey, bindGroup);
        return bindGroup;
    }
    
    // Render batches organized by mesh and texture
    private renderBatches: Map<StaticMesh, Map<TextureKey, RenderBatch>> = new Map();
    
    public resetBuffers(){
        // Clear render batches
        this.renderBatches.clear();
        
        // Clean up stale buffers
        const keys = Array.from(this.set1Table.keys());
        const staleBuffersKeys = keys.filter(k=>{
            const v = this.set1Table.get(k)!;
            v.lifetime--;
            return v.lifetime <= 0;
        });
        
        staleBuffersKeys.forEach(k=>{
            const v = this.set1Table.get(k)!;
            v.modelMatrixBuffer.destroy();
            v.phongDataBuffer.destroy();
            this.set1Table.delete(k);
        });
        
        // Reset remaining buffers
        this.set1Table.forEach(v => {
            v.length = 0;
        });
    }
    
    public bindPipeline(cmd:GPURenderPassEncoder){
        cmd.setPipeline(this.pipeline);
    }
    
    // Storage for model matrices and material data per mesh
    private set1Table:Map<StaticMesh, { 
        modelMatrixBuffer:GPUBuffer;
        phongDataBuffer:GPUBuffer;
        bindGroup: GPUBindGroup;
        length: number,
        lifetime: number,
    }> = new Map();
    
    private createStorageBuffer(itemSize:number):GPUBuffer {
        const size = itemSize * 1024;
        const buffer = this.ctx.Device().createBuffer({
            size:size,
            usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST
        });
        return buffer;
    }
    
    private createBindGroupEntry(itemSize:number, binding:number, buffer: GPUBuffer):GPUBindGroupEntry{
        return {
            binding: binding,
            resource: {
                buffer: buffer,
                offset: 0,
                size: itemSize * 1024
            }
        }
    }
    
    pushData(renderable: { 
        meshObject: StaticMesh; 
        material: PhongMaterial; 
        transform: Transform; 
    }) {
        // Create texture key
        const textureKey: TextureKey = 
            (renderable.material.diffuseTextureId || "none") + "|" + 
            (renderable.material.specularTextureId || "none") + "|"+
            (renderable.material.shininessTextureId || "none");
        
        // Get or create batch for this mesh
        if (!this.renderBatches.has(renderable.meshObject)) {
            this.renderBatches.set(renderable.meshObject, new Map());
        }
        
        const meshBatches = this.renderBatches.get(renderable.meshObject)!;
        
        // Get or create batch for this texture combination
        if (!meshBatches.has(textureKey)) {
            meshBatches.set(textureKey, {
                mesh: renderable.meshObject,
                textureKey: textureKey,
                instances: []
            });
        }
        
        const batch = meshBatches.get(textureKey)!;
        batch.instances.push({
            transform: renderable.transform,
            material: renderable.material
        });
    }
    
    private cameraBuffer:GPUBuffer;
    private cameraBindGroup:GPUBindGroup;
    
    render(camera:Camera, encoder:GPURenderPassEncoder){
        // Push camera data
        this.ctx.Device().queue.writeBuffer(this.cameraBuffer, 0, camera.getCameraUniforms().buffer);
        encoder.setBindGroup(0, this.cameraBindGroup);
        
        // Process all batches
        this.renderBatches.forEach((meshBatches, mesh) => {
            // Ensure we have buffers for this mesh
            if (!this.set1Table.has(mesh)) {
                const modelMatrixBuffer = this.createStorageBuffer(64);
                const phongDataBuffer = this.createStorageBuffer(48);
                
                const set1BindGroup = this.ctx.Device().createBindGroup({
                    layout: this.bindGroupLayouts[1],
                    entries: [
                        this.createBindGroupEntry(64, 0, modelMatrixBuffer),
                        this.createBindGroupEntry(48, 1, phongDataBuffer)
                    ]
                });
                
                this.set1Table.set(mesh, {
                    modelMatrixBuffer: modelMatrixBuffer,
                    phongDataBuffer: phongDataBuffer,
                    bindGroup: set1BindGroup,
                    length: 0,
                    lifetime: 100,
                });
            }
            
            const meshBuffers = this.set1Table.get(mesh)!;
            meshBuffers.lifetime = 100;
            
            // Bind mesh vertex/index buffers once for all texture batches
            encoder.setVertexBuffer(0, mesh.vertexBuffer);
            encoder.setIndexBuffer(mesh.indexBuffer, mesh.indexFormat);
            encoder.setBindGroup(1, meshBuffers.bindGroup);
            
            // Render each texture batch
            meshBatches.forEach((batch, textureKey) => {
                // Upload instance data for this batch
                const startInstance = meshBuffers.length;
                
                batch.instances.forEach((instance, i) => {
                    const modelMatrixOffset = (startInstance + i) * 64;
                    const mmBuffer = instance.transform._worldMatrix as Float32Array;
                    this.ctx.Device().queue.writeBuffer(
                        meshBuffers.modelMatrixBuffer, 
                        modelMatrixOffset, 
                        mmBuffer.buffer
                    );
                    
                    const phongOffset = (startInstance + i) * 48;
                    const phongBuffer = instance.material.toGPUBuffer();
                    this.ctx.Device().queue.writeBuffer(
                        meshBuffers.phongDataBuffer, 
                        phongOffset, 
                        phongBuffer.buffer
                    );
                });
                
                // Bind texture group for this batch
                const textureBindGroup = this.getOrCreateTextureBindGroup(textureKey);
                encoder.setBindGroup(2, textureBindGroup);
                
                // Draw this batch
                encoder.drawIndexed(
                    mesh.indexCount, 
                    batch.instances.length, 
                    0, 
                    0, 
                    startInstance
                );
                
                meshBuffers.length += batch.instances.length;
                
                console.log(`Rendered ${batch.instances.length} instances of ${mesh} with textures: ${textureKey}`);
            });
        });
    }
}