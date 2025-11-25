 /**
  * Holds the mesh buffers (index and vertex buffer) in a table.
  * The scene data (scene and prefabs) holds the name of the mesh,
  * not the data of the mesh. The name is used to fetch the mesh
  * from here.
  * 
  * This class holds both the skinned and static meshes.
  */
 export default class MeshBufferManager {
    /**
     * There are two kinds of meshes: skinned and static.
     */
    private table:Map<string, StaticMesh|MySkinnedMesh> = new Map(); 

    private listeners: Set<() => void> = new Set();
    /**
     * Add a new mesh.
     * @param key the key. Will only add if it's a new key
     * @param mesh the mesh, either static or skinned
     * @returns true if the key is new, false if not. In this case there will be no insertion
     */
    public addMesh(key:string, mesh:StaticMesh|MySkinnedMesh):boolean{
        if(this.table.has(key)){
            return false;
        }else{
            this.table.set(key, mesh);
            this.notifyListeners();
            return true;
        }
    }
    public getAllMeshes(): Array<{key: string, mesh: StaticMesh|MySkinnedMesh}> {
        return Array.from(this.table.entries()).map(([key, mesh]) => ({ key, mesh }));
    }
    /**
     * Get a mesh by key.
     * @param key the key
     * @returns either a mesh or undefined if the key was not found
     */
    public getMesh(key:string):StaticMesh|MySkinnedMesh|undefined {
        return this.table.get(key);
    }
    public subscribe(listener: () => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener); // unsubscribe function
    }
    
    private notifyListeners(): void {
        this.listeners.forEach(listener => listener());
    }
}

export class StaticMesh {
    public vertexBuffer: GPUBuffer;
    public indexBuffer: GPUBuffer;
    public indexCount: number;
    public indexFormat: GPUIndexFormat;
    
    constructor(device: GPUDevice, vertices: Float32Array, indices: Uint16Array | Uint32Array) {
        // Create vertex buffer
        this.vertexBuffer = device.createBuffer({
            label: 'Vertex Buffer',
            size: vertices.byteLength,
            usage: GPUBufferUsage.VERTEX,
            mappedAtCreation: true,  // Map for initial upload
        });
        
        // Upload vertex data
        new Float32Array(this.vertexBuffer.getMappedRange()).set(vertices);
        this.vertexBuffer.unmap();  // Unmap after upload
        
        // Create index buffer
        this.indexBuffer = device.createBuffer({
            label: 'Index Buffer',
            size: indices.byteLength,
            usage: GPUBufferUsage.INDEX,
            mappedAtCreation: true,
        });
        
        // Upload index data (handle both Uint16/Uint32)
        if (indices instanceof Uint16Array) {
            new Uint16Array(this.indexBuffer.getMappedRange()).set(indices);
            this.indexFormat = 'uint16';
        } else {
            new Uint32Array(this.indexBuffer.getMappedRange()).set(indices);
            this.indexFormat = 'uint32';
        }
        this.indexBuffer.unmap();
        
        this.indexCount = indices.length;
    }
    /**
     * Bind the vertex and index buffer in the current command encoder
     * @param cmd 
     */
    public bind(cmd:GPURenderPassEncoder){
        cmd.setVertexBuffer(0, this.vertexBuffer);  
        cmd.setIndexBuffer(this.indexBuffer, this.indexFormat);
    }
}
export class MySkinnedMesh {
    // the vertex buffer
    public vertexBuffer: GPUBuffer;
    // the index buffer
    public indexBuffer: GPUBuffer;
    // how many indices
    public indexCount: number;
    // index format
    public indexFormat: GPUIndexFormat;
    // the inverse bind matrix buffer. The IBM is constant for all instances of a given skin so it is 
    // shared between them, set in the creation and never changed after that.
    public inverseBindMatrixBuffer: GPUBuffer;

    public inverseBindMatrixBufferSizeInBytes:number;

    // private skinnedInstanceData:SkinnedInstanceData;

    constructor(device: GPUDevice, 
        vertices: Float32Array, 
        indices:  Uint16Array | Uint32Array,
        readonly numberOfJoints:number, 
        inverseBindMatrices:Float32Array) {
        // Create vertex buffer
        this.vertexBuffer = device.createBuffer({
            label: 'Vertex Buffer',
            size: vertices.byteLength,
            usage: GPUBufferUsage.VERTEX,
            mappedAtCreation: true,  // Map for initial upload
        });
        // Upload vertex data
        new Float32Array(this.vertexBuffer.getMappedRange()).set(vertices);
        this.vertexBuffer.unmap();  // Unmap after upload
        // Create index buffer
        this.indexBuffer = device.createBuffer({
            label: 'Index Buffer',
            size: indices.byteLength,
            usage: GPUBufferUsage.INDEX,
            mappedAtCreation: true,
        });

        // Upload index data (handle both Uint16/Uint32)
        if (indices instanceof Uint16Array) {
            new Uint16Array(this.indexBuffer.getMappedRange()).set(indices);
            this.indexFormat = 'uint16';
        } else {
            new Uint32Array(this.indexBuffer.getMappedRange()).set(indices);
            this.indexFormat = 'uint32';
        }
        this.indexBuffer.unmap();
        this.indexCount = indices.length;
        // Create the inverse bind matrix buffer and upload the matrices
        this.inverseBindMatrixBuffer = device.createBuffer({
           label: 'inverse bind matrix buffer',
           size: inverseBindMatrices.byteLength,
           usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.STORAGE,
        });
        device.queue.writeBuffer(this.inverseBindMatrixBuffer, 0, inverseBindMatrices.buffer);

        this.numberOfJoints = numberOfJoints;
        this.inverseBindMatrixBufferSizeInBytes =  inverseBindMatrices.byteLength;

        // this.skinnedInstanceData = new SkinnedInstanceData(device, 2048, numberOfJoints);
    }

    public bindVertexBufffer(renderPassEncoder: GPURenderPassEncoder) {
        renderPassEncoder.setVertexBuffer(0, this.vertexBuffer);  
        renderPassEncoder.setIndexBuffer(this.indexBuffer, this.indexFormat);
        
    }

    // public resetBuffer(){
    //     this.skinnedInstanceData.resetBuffer();
    // }

    // public pushPerInstanceData(modelMatrix:Float32Array, jointMatrices:Float32Array){
    //     this.skinnedInstanceData.pushSkinnedInstanceData(modelMatrix, jointMatrices);
    // }

    // public getNumberOfInstances():number {
    //     return this.skinnedInstanceData.getNumberOfInstances();
    // }

    // public getInstanceMatricesBuffer():GPUBuffer {
    //     return this.skinnedInstanceData.rootModelMatricesPerInstanceBuffer;
    // }
    
    // public getInstanceBonesMatricesBuffer():GPUBuffer {
    //     return this.skinnedInstanceData.jointMatricesPerInstanceBuffer;
    // }
    // public getInverseBindPosesBuffer():GPUBuffer {
    //     return this.inverseBindMatrixBuffer;
    // }
    // public getNumberOfJointBuffer():GPUBuffer {
    //     return this.skinnedInstanceData.numberOfJointsBuffer;
    // }

    public bind(_:GPURenderPassEncoder){
        throw new Error("not implemented");
    }
}