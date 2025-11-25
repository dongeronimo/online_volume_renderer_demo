import { vec3 } from "gl-matrix";
import type { PhongMaterialData } from "../materials/materialData";
import type { SceneObjectDesc } from "../scenes/scene";
import GameObject, { PhongMaterial, StaticMesh } from "./entities/gameObject";
import type Pipeline from "./pipeline";
import type { TransformComponentData } from "../prefabs/baseDefinitions/transformComponentData";
import type { StaticMeshComponentData } from "../prefabs/baseDefinitions/staticMeshComponentData";

export default class Instantiator {
  constructor(private materialTable:Map<string, PhongMaterialData>,
    private pipelineTable:Map<string, Pipeline>
  ){

  }

  instantiate(objDesc: SceneObjectDesc) {
    let newGameObject = new GameObject(objDesc.name);
    objDesc.prefab.components.forEach(prefabDesc=>{
        if(prefabDesc.type === "TransformComponent"){
          //FIXME: compiler is too strict and HATES any
          //const transformOverride:TransformComponentData|undefined = objDesc.componentOverrides?.find(o=>o.type=="TransformComponent")?.data as TransformComponentData|undefined;
          const transData = prefabDesc.data as TransformComponentData
          newGameObject.transform.initFromComponentData(transData);
          // if(transformOverride != undefined) {
          //   this.applyTransformOverride(newGameObject, transformOverride);
          // }
        }
        if(prefabDesc.type === "StaticMeshComponent"){
          const staticMeshData = prefabDesc.data as StaticMeshComponentData;
          newGameObject.staticMesh = new StaticMesh(staticMeshData.meshName);
          if(staticMeshData.materialType === "phong"){
            const matDesc = this.materialTable.get(staticMeshData.materialId);
            if(matDesc == undefined) throw new Error("material "+matDesc+" not found");
            newGameObject.phongMaterial = new PhongMaterial(
              matDesc.name,
              this.pipelineTable.get(matDesc.pipeline)!,
              vec3.fromValues(matDesc.diffuse[0], matDesc.diffuse[1], matDesc.diffuse[2]),
              vec3.fromValues(matDesc.specular[0], matDesc.specular[1], matDesc.specular[2]),
              vec3.fromValues(matDesc.ambient[0], matDesc.ambient[1], matDesc.ambient[2]),
              matDesc.shininess,
              matDesc.diffuseTextureId,
              matDesc.specularTextureId,
              matDesc.shininessTextureId
            );
          }//TODO PBR: create the pbr object from pbr data
          // const staticMeshOverride:StaticMeshComponentData|undefined = objDesc.componentOverrides?.find(o=>o.type=="StaticMeshComponent")?.data as StaticMeshComponentData|undefined;
          // if(staticMeshOverride != undefined) {
          //   this.applyStaticMeshOverride(newGameObject, staticMeshOverride);
          // }
        }
        
      })
    return newGameObject;
  }
  applyStaticMeshOverride(newGameObject: GameObject, staticMeshOverride: StaticMeshComponentData) {
    if(staticMeshOverride.materialType ==="phong" || staticMeshOverride.materialType == undefined && newGameObject.phongMaterial != undefined){
      const matDesc = this.materialTable.get(staticMeshOverride.materialId);
      if(matDesc == undefined) throw new Error("material "+matDesc+" not found");
      newGameObject.phongMaterial!.name = matDesc.name;
      newGameObject.phongMaterial!.ambient = vec3.fromValues(matDesc.ambient[0],matDesc.ambient[1],matDesc.ambient[2]);
      newGameObject.phongMaterial!.diffuse = vec3.fromValues(matDesc.diffuse[0],matDesc.diffuse[1],matDesc.diffuse[2]);
      newGameObject.phongMaterial!.specular = vec3.fromValues(matDesc.specular[0],matDesc.specular[1],matDesc.specular[2]);
      newGameObject.phongMaterial!.shininess = matDesc.shininess;
    }
    //TODO PBR: handle pbr override
  }
  applyTransformOverride(newGameObject: GameObject, transformOverride: TransformComponentData) {
    if (transformOverride.position) {
      newGameObject.transform.position = vec3.fromValues(transformOverride.position[0],transformOverride.position[1],transformOverride.position[2]);
    }
    if (transformOverride.rotation) {
      newGameObject.transform.eulerAngles = vec3.fromValues(transformOverride.rotation[0],transformOverride.rotation[1],transformOverride.rotation[2]);
    }
    if (transformOverride.scale) {
      newGameObject.transform.scale = vec3.fromValues(transformOverride.scale[0],transformOverride.scale[1],transformOverride.scale[2]);
    }
  }

}