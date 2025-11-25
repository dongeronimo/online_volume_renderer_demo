import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { BufferGeometry, Mesh } from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';

export interface StaticLoadedMeshData {
    name: string;
    vertices: Float32Array;
    indices: Uint16Array | Uint32Array;
    vertexCount: number;
    indexCount: number;
}

class StaticMeshLoader {
    //TODO: Add Support to load skinned mesh. Remember that skinned meshes
    // will need joints and inverse bind poses data.
    static async loadGLTF(gltfPath: string): Promise<StaticLoadedMeshData[]> {
        const loader = new GLTFLoader();
        const gltf: GLTF = await new Promise((resolve, reject) => {
            loader.load(gltfPath, resolve, undefined, reject);
        });
        
        const meshes: StaticLoadedMeshData[] = [];
        
        gltf.scene.traverse((object) => {
            if (object instanceof Mesh) {
                const geometry = object.geometry as BufferGeometry;
                
                // Validate required attributes
                if (!geometry.attributes.position) {
                    throw new Error(`Mesh "${object.name}" is missing position data`);
                }
                if (!geometry.attributes.normal) {
                    throw new Error(`Mesh "${object.name}" is missing normal data`);
                }
                if (!geometry.attributes.uv) {
                    throw new Error(`Mesh "${object.name}" is missing UV data`);
                }
                if (!geometry.index) {
                    throw new Error(`Mesh "${object.name}" is missing index data`);
                }
                
                const positions = geometry.attributes.position.array as Float32Array;
                const normals = geometry.attributes.normal.array as Float32Array;
                const uvs = geometry.attributes.uv.array as Float32Array;
                const indices = geometry.index.array as Uint16Array | Uint32Array;
                
                const vertices = this.interleaveVertexData(positions, normals, uvs);
                
                meshes.push({
                    name: object.name || `mesh_${meshes.length}`,
                    vertices,
                    indices,
                    vertexCount: positions.length / 3,
                    indexCount: indices.length
                });
            }
        });
        
        if (meshes.length === 0) {
            throw new Error('No meshes found in glTF file');
        }
        
        return meshes;
    }
    
    private static interleaveVertexData(
        positions: Float32Array, 
        normals: Float32Array, 
        uvs: Float32Array
    ): Float32Array {
        const vertexCount = positions.length / 3;
        const vertices = new Float32Array(vertexCount * 8);
        
        for (let i = 0; i < vertexCount; i++) {
            const offset = i * 8;
            vertices[offset + 0] = positions[i * 3 + 0];
            vertices[offset + 1] = positions[i * 3 + 1];
            vertices[offset + 2] = positions[i * 3 + 2];
            vertices[offset + 3] = normals[i * 3 + 0];
            vertices[offset + 4] = normals[i * 3 + 1];
            vertices[offset + 5] = normals[i * 3 + 2];
            vertices[offset + 6] = uvs[i * 2 + 0];
            vertices[offset + 7] = uvs[i * 2 + 1];
        }
        
        return vertices;
    }
}

export default StaticMeshLoader;