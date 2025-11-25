import type { PrefabDefinition } from "./prefabDefinition";

const GoldSphere: PrefabDefinition = {
    name: "GoldSphere",
    components: [
        { type: "TransformComponent", 
            data: { 
                position: [0,0,0] 
            } 
        },
        { 
            type: "StaticMeshComponent", data: 
            { 
                meshName: "Sphere",//the name of the mesh in gMeshBuferManager
                materialType: "phong", //for now we'll only support phong
                materialId: "gold" //the name of the material in gMaterialTable
            } 
        }
    ]
};

export default GoldSphere;