import { createRoot } from 'react-dom/client';
import React from 'react';

import { EditorRoot, type EditorRootProps } from './editor/components/editorRoot';
import GraphicsContext from './graphics/graphicsContext';
import MeshBufferManager, { StaticMesh } from './graphics/meshBufferManager';
import StaticMeshLoader from './graphics/meshLoader';
import Pipeline from './graphics/pipeline';
import type { PhongMaterialData } from './materials/materialData';
import { BrickWallMaterial, GoldMaterial, RedDullMaterial, RedShinyMaterial } from './materials/materialDataDefinitions';
import type { SceneDefinition } from './scenes/scene';
import HelloWorldScene from './scenes/helloWorldScene';
import Instantiator from './graphics/instantiator';
import type GameObject from './graphics/entities/gameObject';
import { Camera } from './graphics/entities/gameObject';
import { vec3 } from 'gl-matrix';
import textures from './prefabs/textures';

const gMeshBufferManager:MeshBufferManager = new MeshBufferManager();
const gShaderTable:Map<string, GPUShaderModule> = new Map();
const gPipelineTable:Map<string, Pipeline> = new Map();
const gMaterialTable:Map<string, PhongMaterialData> = new Map();
const gInstantiator:Instantiator = new Instantiator(gMaterialTable, gPipelineTable);
const gTextureTable:Map<string, GPUTexture> = new Map();
let gCurrentScene: SceneDefinition|undefined = undefined;
const gCurrentSceneObjects:GameObject[] = [];
let gCamera: Camera = new Camera();//TODO: Workaround, need to integrate the camera to the transform
//init graphics context
const graphicsContext = new GraphicsContext("canvas",
  async function(ctx: GraphicsContext): Promise<void> {
    //load the textures
    for(let i=0; i<textures.length; i++){
      gTextureTable.set(textures[i].textureId, await ctx.createTextureFromImage(textures[i].path));
    }
    //Load the shaders
    gShaderTable.set("static_phong", await ctx.loadShader("shaders/static_mesh_phong.wgsl"));
    //Create pipelines
    gPipelineTable.set("static_phong", new Pipeline(
      ctx, 
      gShaderTable.get("static_phong")!,
      navigator.gpu.getPreferredCanvasFormat(),
      "static_phong",
      gTextureTable  // <-- Pass the texture table here
    ));
    //Create materials
    //TODO: load it using a FOR like i do to the textures
    gMaterialTable.set(RedDullMaterial.name, RedDullMaterial);
    gMaterialTable.set(RedShinyMaterial.name, RedShinyMaterial);
    gMaterialTable.set(BrickWallMaterial.name, BrickWallMaterial);
    gMaterialTable.set(GoldMaterial.name, GoldMaterial);
    // TODO: load using a for like i do to the textures
    await LoadStaticMesh("models/cube.gltf", ctx);
    await LoadStaticMesh("models/monkey.gltf", ctx);
    await LoadStaticMesh("models/sphere.gltf", ctx);
    //TODO: Create skinned meshes

    //set up the camera.
    const aspect = ctx.Canvas().clientWidth / ctx.Canvas().clientHeight;
    gCamera.setPerspectiveReversedInfinite((30.0 * Math.PI) / 180, aspect, 0.1);       
  },
  (_: number)=>{
    //If no scene loaded, load the hello world
    if(!gCurrentScene){
      gCurrentScene = HelloWorldScene;
      //instantiate all prefabs
      gCurrentScene!.objects.forEach(objDesc=>{
        gCurrentSceneObjects.push(gInstantiator.instantiate(objDesc));
      });

    }
    gCamera.lookAt(vec3.fromValues(12,12,12), vec3.fromValues(0,2,0), vec3.fromValues(0,1,0));
    gCurrentSceneObjects.filter(obj=>obj.transform!=undefined).forEach(obj=>obj.transform.getWorldMatrix());
  },
  (ctx: GraphicsContext, commandEncoder: GPUCommandEncoder) => {
    //TODO: render pass should be encapsulated in an object
    const renderPassEncoder = commandEncoder.beginRenderPass({
          label: 'Main Render Pass',
          colorAttachments: [{
              view: ctx.Context().getCurrentTexture().createView(),
              clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
              loadOp: 'clear',
              storeOp: 'store',
          }],
          depthStencilAttachment: {
              view: ctx.DepthTextureView(),
              depthClearValue: 0.0,
              depthLoadOp: 'clear',
              depthStoreOp: 'store',
          }
    });
    //TODO: Prepare the data
    const staticMeshesThatWillBeRendered:Set<StaticMesh> = new Set();
    const pipelinesThatWillBeUsed:Set<Pipeline> = new Set();
    const orderedRenderables = gCurrentSceneObjects
      .filter(obj=>obj.staticMesh != undefined) //i only want those that are renderable.
      .sort((a,b)=>{ //sort by mesh first, then by material. I need to sort my mesh because
        //its the mesh that controls the instanced rendering.
        function compareStrings(a: string, b: string): number {
          if (a < b) return -1;
          if (a > b) return 1;
          return 0;
        };
        const meshCompare = compareStrings(a.staticMesh!.meshId, b.staticMesh!.meshId);
        return meshCompare !== 0 ? meshCompare : compareStrings(a.phongMaterial!.name, b.phongMaterial!.name);
      }).map(obj=>{
        //prepare the data to the next steps: upload and draw.
        const meshObject = gMeshBufferManager.getMesh(obj.staticMesh!.meshId);//i know, by now, that this is a static mesh.
        staticMeshesThatWillBeRendered.add(meshObject! as StaticMesh);
        pipelinesThatWillBeUsed.add(obj.phongMaterial!.pipeline);
        return {
          meshObject: meshObject! as StaticMesh,
          material: obj.phongMaterial!,
          transform: obj.transform
        };
      });
    //TODO: Reset the pipelines buffers
    pipelinesThatWillBeUsed.forEach(p=>{
      p.resetBuffers();
    })
    //TODO: Upload the data to their buffers
    orderedRenderables.forEach(renderable=>{
      renderable.material.pipeline.pushData(renderable);
    });
    //TODO: Draw instanced
    pipelinesThatWillBeUsed.forEach(p=>{
      p.bindPipeline(renderPassEncoder);
      p.render(gCamera, renderPassEncoder);
    })

    renderPassEncoder.end();
  },
  (_:GraphicsContext, width:number, height:number)=>{
    //Update the camera properties
    const aspect = width / height;
    gCamera.setPerspectiveReversedInfinite((30.0 * Math.PI) / 180, aspect, 0.1);       
  }
);


/**
 * Encapuslates the loading of a mesh and pushing it into the registry. Remember that a file may have more then one
 * mesh and that mesh names must be unique.
 * @param path the path to the file. Meshes should be in the /public directory 
 * @param ctx the graphics context, because i'll create buffers.
 */
async function LoadStaticMesh(path:string, ctx:GraphicsContext) {
  (await StaticMeshLoader.loadGLTF(path)).forEach(meshData=>{
      gMeshBufferManager.addMesh(meshData.name, new StaticMesh(ctx.Device(), meshData.vertices, meshData.indices));
    });
}
//Init react context in react container div.
const container = document.querySelector('.reactContainer');
if(container) {
  const props: EditorRootProps = {
    meshBufferManager: gMeshBufferManager,
    graphicsContext: graphicsContext
  };
  const root = createRoot(container);
  root.render(
    React.createElement(EditorRoot, props)
  );
}
