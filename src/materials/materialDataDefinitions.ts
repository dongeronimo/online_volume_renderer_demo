import type { PhongMaterialData } from "./materialData";

export const RedDullMaterial:PhongMaterialData = {
    name:'red_dull',
    pipeline: 'static_phong',
    diffuse: [0.9, 0.2, 0.2],
    specular: [1,0,0],
    ambient: [0.05, 0, 0],
    shininess: 1
}

export const RedShinyMaterial:PhongMaterialData = {
    name:'red_shiny',
    pipeline: 'static_phong',
    diffuse: [1, 0, 0],
    specular: [1, 0.7, 0.7],
    ambient: [0.025, 0, 0],
    shininess: 10
}

export const BrickWallMaterial: PhongMaterialData = {
    name:'brick_wall',
    pipeline: 'static_phong',
    diffuse: [1, 1, 1],
    specular: [1, 1, 1],
    ambient: [0.01, 0.01, 0.01],
    shininess: 16,
    diffuseTextureId:'brick_diffuse',
    specularTextureId: 'brick_specular',
    shininessTextureId: 'brick_specular'
}

export const GoldMaterial: PhongMaterialData = {
    name:'gold',
    pipeline: 'static_phong',
    diffuse: [1, 0.86, 0],
    specular: [2, 1.8, 1.2],
    ambient: [0.01, 0.01, 0.01],
    shininess: 128,
    diffuseTextureId:'gold_diffuse',
    specularTextureId: 'gold_specular',
}