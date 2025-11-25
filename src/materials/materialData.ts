/**
 * Describes a phong material. 
 */
export interface PhongMaterialData {
    //Name: must be unique because it's used as key when selecting the material in the prefabs
    name:string,
    //Pipeline: what pipeline implements the material. That controls the descriptor sets, so beware
    pipeline: string,
    //Diffuse color
    diffuse:[number, number, number],
    //Specular color
    specular:[number, number, number],
    //Ambient color
    ambient:[number, number, number],
    //Shininess
    shininess:number
    //TODO: Add textures
    diffuseTextureId?: string,
    specularTextureId?: string,
    shininessTextureId?:string,
    
}