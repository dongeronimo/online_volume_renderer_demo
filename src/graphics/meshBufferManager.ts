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

    // Wireframe rendering: edge indices for line-list topology
    public edgeIndexBuffer: GPUBuffer;
    public edgeCount: number;

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

        // Generate edge indices for wireframe rendering
        // Extract unique edges from triangle indices for line-list rendering
        const edgeIndices = this.generateEdgeIndices(indices);

        this.edgeIndexBuffer = device.createBuffer({
            label: 'Edge Index Buffer',
            size: edgeIndices.byteLength,
            usage: GPUBufferUsage.INDEX,
            mappedAtCreation: true,
        });

        // Upload edge index data
        if (indices instanceof Uint16Array) {
            new Uint16Array(this.edgeIndexBuffer.getMappedRange()).set(edgeIndices);
        } else {
            new Uint32Array(this.edgeIndexBuffer.getMappedRange()).set(edgeIndices);
        }
        this.edgeIndexBuffer.unmap();

        this.edgeCount = edgeIndices.length;
    }

    /**
     * Generate edge indices from triangle indices for wireframe rendering
     * Extracts unique edges and returns them as pairs for line-list topology
     *
     * Algorithm:
     * - For each triangle [v0, v1, v2], extract edges [v0,v1], [v1,v2], [v2,v0]
     * - Deduplicate edges (treat [a,b] same as [b,a])
     * - Return as flat array: [v0, v1, v2, v3, ...] for line-list rendering
     */
    private generateEdgeIndices(indices: Uint16Array | Uint32Array): Uint16Array | Uint32Array {
        const edgeSet = new Set<string>();
        const edges: number[] = [];

        // Process triangles (every 3 indices = 1 triangle)
        for (let i = 0; i < indices.length; i += 3) {
            const v0 = indices[i];
            const v1 = indices[i + 1];
            const v2 = indices[i + 2];

            // Three edges per triangle
            const triangleEdges = [
                [v0, v1],
                [v1, v2],
                [v2, v0]
            ];

            for (const [a, b] of triangleEdges) {
                // Create canonical edge key (smaller index first to deduplicate)
                const key = a < b ? `${a},${b}` : `${b},${a}`;

                if (!edgeSet.has(key)) {
                    edgeSet.add(key);
                    // Add edge as [a, b] for line-list rendering
                    edges.push(a, b);
                }
            }
        }

        // Return same type as input indices
        return indices instanceof Uint16Array
            ? new Uint16Array(edges)
            : new Uint32Array(edges);
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