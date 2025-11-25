import type { StaticMeshComponentData } from "./baseDefinitions/staticMeshComponentData";
import type { TransformComponentData } from "./baseDefinitions/transformComponentData";


/**
 * Defines a prefab. A prefab have an unique name, a list of components
 * and possibly a list of prefab children.
 */
export interface PrefabDefinition {
    /**
     * Name: must be unique.
     */
    name: string;
    /**
     * List of component definitions.
     */
    components: ComponentDefinition[];
    /**
     * The children.
     */
    children?: PrefabDefinition[];
}
/**
 * Definition of a component.
 */
export interface ComponentDefinition {
    /**
     * Type of the component, like "TransformComponent", "MeshComponent", etc. 
     */
    type: "TransformComponent"|"StaticMeshComponent"; 
    /**
     * Data: Changes with the type.
     * TODO: Add other types in an OR.
     */
    data: StaticMeshComponentData|TransformComponentData;    
}

