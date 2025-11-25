import type { PrefabDefinition } from "../prefabs/prefabDefinition";

export interface SceneObjectDesc {
    /**AFAIK the names need not be unique. They are not used as keys for now.*/
    name:string,
    /**The prefab - one prefab per scene object.*/
    prefab:PrefabDefinition,
    /**overrides the prefabs, optional. */
    componentOverrides?: any,
}

export interface SceneDefinition {
    name:string;
    objects:SceneObjectDesc[]
}

