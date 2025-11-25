import type { PrefabDefinition } from "./prefabDefinition";

const CubePrefab: PrefabDefinition = {
    name: "Cube",
    components: [
        { type: "TransformComponent", 
            data: { 
                position: [0,0,0] 
            } 
        },
        { 
            type: "StaticMeshComponent", data: 
            { 
                meshName: "Cube",//the name of the mesh in gMeshBuferManager
                materialType: "phong", //for now we'll only support phong
                materialId: "red_dull" //the name of the material in gMaterialTable
            } 
        }
    ]
};

export default CubePrefab;