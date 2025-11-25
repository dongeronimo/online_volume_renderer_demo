import BrickCube from "../prefabs/brickCube";
import CubePrefab from "../prefabs/cubePrefab";
import GoldSphere from "../prefabs/goldSphere";
import type { SceneDefinition } from "./scene";

const HelloWorldScene: SceneDefinition = {
    name:"Hello World",
    objects: [{
        name:"cube00",
        prefab:CubePrefab,
        componentOverrides: [
            {
                type:"TransformComponent",
                data: {
                    position: [0,0,0] 
                }
            }
        ]
    },{
        name:"cube01",
        prefab:CubePrefab,
        componentOverrides: [
            {
                type:"TransformComponent",
                data: {
                    position:[2.5,0,0]
                }
            }
        ]
    },{
        name:"cube02",
        prefab:CubePrefab,
        componentOverrides: [
            {
                type:"TransformComponent",
                data: {
                    position:[5,0,0]
                }
            },
            {
                type:"StaticMeshComponent",
                data: {
                    materialId: "red_shiny"
                }
            }
        ]
    },{
        name:"brick",
        prefab: BrickCube,
        componentOverrides: [
            {
                type:"TransformComponent",
                data: {
                    position:[0,0,2.5]
                }
            }
        ]
    },{
        name:"sphere",
        prefab: GoldSphere,
        componentOverrides: [
            {
                type:"TransformComponent",
                data: {
                    position:[0,2.5,0]
                }
            }
        ]
    }]
}

export default HelloWorldScene;