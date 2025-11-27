import { mat4, quat, vec3 } from "gl-matrix";
import GameObject, { Camera} from "../graphics/entities/gameObject";
import GraphicsContext from "../graphics/graphicsContext";
import MeshBufferManager, { StaticMesh } from "../graphics/meshBufferManager";
import StaticMeshLoader from "../graphics/meshLoader";
import { parseMetadata, type DicomSeriesMetadata, type ParsedDicomMetadata } from "./metadata";
import { VolumeRenderPipeline } from "./volume_raycast_pipeline";
import { createRoot } from "react-dom/client";
import React from "react";
import { OffscreeRenderTarget as OffscreenRenderTarget } from "./offscreen_render_target";
import { FullscreenQuadPipeline } from "./fullscreen_quad_pipeline";
import { ComputeGradient } from "./compute_gradient";
import RotateAround from "./mouse_events";
import { config } from "./config";
import { VolumeRenderPipelineCTF } from "./volume_raycast_pipeline_ctf";
import { Root } from "./ui/root";
import { rootEventsTarget } from "./ui/events";
//Which pipeline to use?
enum Pipeline_t {
  WindowLevel, CTF
};
let gCurrentPipelineType : Pipeline_t;

const gMeshBufferManager:MeshBufferManager = new MeshBufferManager();
const gCamera:Camera = new Camera();
const gOffscreenRenderTarget = new OffscreenRenderTarget();
let gVolumeRenderPipeline: VolumeRenderPipeline|undefined = undefined;
let gCTFVolumeRenderPipeline: VolumeRenderPipelineCTF|undefined = undefined;
let gQuadRendererPipeline: FullscreenQuadPipeline|undefined = undefined;
let dicomMetadata: ParsedDicomMetadata|undefined = undefined;
let originalVolume: GPUTexture|undefined = undefined;
let volumeRoot:GameObject|undefined = undefined;

let gMouseEventHandler: RotateAround|undefined = undefined;

const SERIES = "abdomen-feet-first";
//flag that controls whether to use hq or lq params. LQs are use when moving the camera to keep real-time interctivity
let usingHQ = true;
let numberOfHQRenderings = 0;

let gMinValue = 0;
let gMaxValue = 1;
//parameters controlled by the ui
//FIXME: I should be using the fields in the react's RendererProvider.
let gWindow:number = 300;
let gLevel: number = 100;
let gDensityScale: number = 0.5;
let gAmbient: number = 0.3;

let gStepSizeLQ: number = 0.006;
let gStepSizeHQ: number = 0.001;
let gOffscreenBufferScaleLQ: number = 0.5;
let gOffscreenBufferScaleHQ: number = 1.0;
let gPreviousOffscreenBufferScaleLQ:number = 0.5;
let gPreviousOffscreenBufferScaleHQ:number = 1.0;
let gUseGradientLQ = 0;
let gUseGradientHQ = 1;
let gDensityForMarchSpaceSkippingLQ: number = 0.02;
let gDensityForMarchSpaceSkippingHQ: number = 0.02;
let gSkipMultiplierLQ: number = 5.0;
let gSkipMultiplierHQ: number = 5.0;
let gSubtleSurfaceThresholdLQ: number = 0.01;
let gSubtleSurfaceThresholdHQ: number = 0.01;
let gSurfaceThresholdLQ: number = 0.02;
let gSurfaceThresholdHQ: number = 0.02;
let gMaxStepsLQ: number = 512;
let gMaxStepsHQ: number = 4096;
let gMinGradientMagnitudeLQ: number = 0.01;
let gMinGradientMagnitudeHQ: number = 0.01;
let gAccumulatedThresholdLQ: number = 0.95;
let gAccumulatedThresholdHQ: number = 0.95;
let gTransmittanceThresholdLQ: number = 0.02;
let gTransmittanceThresholdHQ: number = 0.02;

async function readShader(name:string):Promise<string> {
  let shaderFetch = await fetch(`medical/${name}.wgsl`);
  const shaderSrc = await shaderFetch.text();
  return shaderSrc;
}
/**
 * Creates the pipeline for window/level rendering. Color Transfer Function and 
 * Window/Level are sufficiently different that it's impossible for them to be 
 * in the same pipeline.
 * @param ctx 
 * @param volume 
 * @param gradientTexture 
 * @param chunkMinMaxBuffer 
 * @param numChunksX 
 * @param numChunksY 
 * @param numChunksZ 
 */
async function createWLVolumePipeline(ctx:GraphicsContext, volume:GPUTexture,
  gradientTexture:GPUTexture,chunkMinMaxBuffer:Float32Array, numChunksX:number,
  numChunksY:number, numChunksZ:number
) {
    const shaderSrc = await readShader('raycast_volume_render');
    gVolumeRenderPipeline = new VolumeRenderPipeline(
      ctx.Device(),
      volume,
      navigator.gpu.getPreferredCanvasFormat(),
      shaderSrc,
      gradientTexture,
      chunkMinMaxBuffer,      
      numChunksX,      
      numChunksY,
      numChunksZ
    );
}

async function createCTFVolumePipeline(device: GPUDevice, volumeTexture:GPUTexture, textureFormat:GPUTextureFormat, gradientTexture:GPUTexture) {
  const shaderSrc = await readShader('colored_raycast_volume_render');
  gCTFVolumeRenderPipeline = new VolumeRenderPipelineCTF(device, volumeTexture, textureFormat, shaderSrc, gradientTexture);
}
rootEventsTarget.dispatchEvent(new Event('task-started'));
const graphicsContext = new GraphicsContext("canvas",
  async function(ctx: GraphicsContext): Promise<void> {
    rootEventsTarget.dispatchEvent(new Event('task-started'));
    gCurrentPipelineType = Pipeline_t.WindowLevel;
    //0) create the cube mesh that'll do the volume rendering 
    const cube = (await StaticMeshLoader.loadGLTF("models/cube.gltf"))[0];
    gMeshBufferManager.addMesh("cube", new StaticMesh(ctx.Device(), cube.vertices, cube.indices));
    //1) read the metadata
    const parsed = await getMetadata();
    dicomMetadata = parsed;
    //2) create the original texture array and fill it with file data
    originalVolume = createVolumeTexture(ctx.Device(), 
      parsed.width, parsed.height, parsed.numSlices);
    for(let i=0; i<parsed.numSlices; i++){
      //format the file suffix
      const fileIndex = formatFileIndex(i);
      const file = config.getDataPath(SERIES, `slice_${fileIndex}.raw`);
      //get the data
      const rawData = await fetchData(file);
      writeTexture(ctx.Device(), originalVolume, rawData, parsed.width, parsed.height,i);
      console.log("loaded "+file+" at index "+i); 
    }
    
    const chunkMinMaxResp = await fetch(config.getDataPath(SERIES, "chunk_minmax.bin"));
    const chunkMinMaxBuffer = new Float32Array(await chunkMinMaxResp.arrayBuffer());
    //5) create gradient texture and compute gradients
    const gradientTexture = await ComputeGradient(ctx, parsed, originalVolume);
    //Create the pipeline
    await createWLVolumePipeline(ctx, originalVolume, gradientTexture, chunkMinMaxBuffer,
      parsed.numChunksX, parsed.numChunksY, parsed.numChunksZ);
    await createCTFVolumePipeline(ctx.Device(), originalVolume, navigator.gpu.getPreferredCanvasFormat(), gradientTexture);

    //Create the camera
    const aspect = ctx.Canvas().clientWidth / ctx.Canvas().clientHeight;
    gCamera.setPerspectiveReversedInfinite((30.0 * Math.PI) / 180, aspect, 0.1);     
    gCamera.lookAt(vec3.fromValues(0,0,-2), vec3.fromValues(0,0,0), vec3.fromValues(0,1,0));
    //create the game objct that'll hold the transform
    volumeRoot = new GameObject("Volume Root");
    //extract the rotation from the direction cosines:
    const rowDir = vec3.fromValues(
      parsed.imageOrientationPatient[0],
      parsed.imageOrientationPatient[1],
      parsed.imageOrientationPatient[2]
    );
    const colDir = vec3.fromValues(
      parsed.imageOrientationPatient[3],
      parsed.imageOrientationPatient[4],
      parsed.imageOrientationPatient[5]
    );
    const sliceDir = vec3.cross(vec3.create(), rowDir, colDir);
    const rotMatrix = mat4.fromValues(
      rowDir[0], rowDir[1], rowDir[2], 0,
      colDir[0], colDir[1], colDir[2], 0,
      sliceDir[0], sliceDir[1], sliceDir[2], 0,
      0, 0, 0, 1
    );
    const rotationAsQuaternion = quat.create();
    mat4.getRotation(rotationAsQuaternion, rotMatrix);
    volumeRoot.transform.setRotationQuaternion(rotationAsQuaternion);
    volumeRoot.transform.getWorldMatrix()
    //RENDERTARGET: Create the offscreen color render target and the offscreen depth render target
    gOffscreenRenderTarget.init(ctx.Device(), navigator.gpu.getPreferredCanvasFormat());
    gOffscreenRenderTarget.createTargets(ctx.Canvas().clientWidth * gOffscreenBufferScaleLQ, ctx.Canvas().clientHeight* gOffscreenBufferScaleLQ);
    //RENDERTARGET: Create a pipeline to draw the rendertarget
    gQuadRendererPipeline = new FullscreenQuadPipeline(ctx.Device(), navigator.gpu.getPreferredCanvasFormat());
    gQuadRendererPipeline.setTexture(gOffscreenRenderTarget.getColorTargetView());
    //set up the event handler
    gMouseEventHandler = new RotateAround(ctx.Canvas(), gCamera,
      ()=>{ 
        usingHQ = false;
        numberOfHQRenderings = 0;
      },
      ()=>{ 
        usingHQ = true;
        numberOfHQRenderings = 0;
      });
    //set up min and max
    gMinValue = parsed.huMin;
    gMaxValue = parsed.huMax;
    rootEventsTarget.dispatchEvent(new CustomEvent('minmax-updated', {
      detail: { min: gMinValue, max: gMaxValue }
    }));    
    rootEventsTarget.dispatchEvent(new Event('task-completed'));
  },
  (_: number)=>{
    //volumeRoot!.transform.rotate(vec3.fromValues(0,90*deltaTime, 0));
    // gVolumeTransform.rotateAroundWorldAxis(vec3.fromValues(-0.5, 0, -0.5), vec3.fromValues(0,1,0), 30*deltaTime);
    // gVolumeTransform.getWorldMatrix();
  },
  (ctx: GraphicsContext, commandEncoder: GPUCommandEncoder) => {
    //High quality rendering may be really slow, to keep UI interactivity i should render only once, when needed,
    //that is, when things change. Not only it'll keep the program more responsive it'll save energy and generate
    //less heat.
    if(usingHQ && numberOfHQRenderings > 1)
      return;
    else if(usingHQ)
      numberOfHQRenderings++;
    //if the user changed the scale in the ui, update the texture size here.
    if(usingHQ){
      if(gPreviousOffscreenBufferScaleHQ !== gOffscreenBufferScaleHQ){
        gOffscreenRenderTarget.createTargets(ctx.Canvas().clientWidth * gOffscreenBufferScaleHQ, 
          ctx.Canvas().clientHeight* gOffscreenBufferScaleHQ);
        gQuadRendererPipeline?.setTexture(gOffscreenRenderTarget.getColorTargetView());
        gPreviousOffscreenBufferScaleHQ = gOffscreenBufferScaleHQ;
      }
    }
    else {
      if(gPreviousOffscreenBufferScaleLQ !== gOffscreenBufferScaleLQ){
        gOffscreenRenderTarget.createTargets(ctx.Canvas().clientWidth * gOffscreenBufferScaleLQ, 
          ctx.Canvas().clientHeight* gOffscreenBufferScaleLQ);
        gQuadRendererPipeline?.setTexture(gOffscreenRenderTarget.getColorTargetView());
        gPreviousOffscreenBufferScaleLQ = gOffscreenBufferScaleLQ;
      }
    }
    //create the render pass
    const offscreenRenderPass = commandEncoder.beginRenderPass({
      label: 'Main Render Pass',
      colorAttachments: [{
          view: gOffscreenRenderTarget.getColorTargetView(),
          clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
          loadOp: 'clear',
          storeOp: 'store',
      }],
      depthStencilAttachment: {
          view: gOffscreenRenderTarget.getDepthTargetView(),
          depthClearValue: 0.0,
          depthLoadOp: 'clear',
          depthStoreOp: 'store',
      }
    });
    const viewMatBuffer = new Float32Array(16);
    viewMatBuffer.set(gCamera.viewMatrix, 0);
    const projMatBuffer = new Float32Array(16);
    projMatBuffer.set(gCamera.projectionMatrix, 0);
    const cameraPositionBuffer = new Float32Array(3);
    cameraPositionBuffer.set(gCamera.position, 0);
    const voxelSpacingBuffer = new Float32Array(3);
    voxelSpacingBuffer[0] = dicomMetadata!.pixelSpacing[0];
    voxelSpacingBuffer[1] = dicomMetadata!.pixelSpacing[1];
    voxelSpacingBuffer[2] = dicomMetadata!.sliceThickness;
    const maxSpacing = Math.max(voxelSpacingBuffer[0], voxelSpacingBuffer[1], voxelSpacingBuffer[2]);
    voxelSpacingBuffer[0] /= maxSpacing;
    voxelSpacingBuffer[1] /= maxSpacing;
    voxelSpacingBuffer[2] /= maxSpacing;
    if(gCurrentPipelineType === Pipeline_t.WindowLevel){
      //update camera data
      gVolumeRenderPipeline!.updateUniforms({
        modelMatrix: volumeRoot!.transform!.getWorldMatrix(),
        viewMatrix: viewMatBuffer,
        projectionMatrix: projMatBuffer,
        cameraPosition: cameraPositionBuffer,
        numSlices: dicomMetadata!.numSlices,
        stepSize: !usingHQ?gStepSizeLQ:gStepSizeHQ,
        densityScale: gDensityScale,
        inverseModelMatrix: volumeRoot!.transform!.getInverseWorldMatrix(),
        windowCenter: gLevel, 
        windowWidth: gWindow, 
        voxelSpacing: voxelSpacingBuffer,
        toggleGradient: !usingHQ?gUseGradientLQ:gUseGradientHQ,
        volumeWidth: dicomMetadata!.width,
        volumeHeight: dicomMetadata!.height,
        volumeDepth: dicomMetadata!.numSlices,
        chunkSize: dicomMetadata!.chunkSize,
        numChunksX: dicomMetadata!.numChunksX,
        numChunksY: dicomMetadata!.numChunksY,
        numChunksZ: dicomMetadata!.numChunksZ,
        ambient: gAmbient,
        densityForMarchSpaceSkipping: !usingHQ?gDensityForMarchSpaceSkippingLQ:gDensityForMarchSpaceSkippingHQ,
        skipMultiplier: !usingHQ?gSkipMultiplierLQ:gSkipMultiplierHQ,
        subtleSurfaceThreshold: !usingHQ?gSubtleSurfaceThresholdLQ:gSubtleSurfaceThresholdHQ,
        surfaceThreshold: !usingHQ?gSurfaceThresholdLQ:gSurfaceThresholdHQ,
        maxSteps: !usingHQ?gMaxStepsLQ:gMaxStepsHQ,
        minGradientMagnitude: !usingHQ?gMinGradientMagnitudeLQ:gMinGradientMagnitudeHQ,
        accumulatedThreshold: !usingHQ?gAccumulatedThresholdLQ:gAccumulatedThresholdHQ,
        transmittanceThreshold: !usingHQ?gTransmittanceThresholdLQ:gTransmittanceThresholdHQ
      });
      let mesh = gMeshBufferManager.getMesh("cube")!
      // Render the volume (single cube with bricking acceleration)
      gVolumeRenderPipeline!.render(offscreenRenderPass, mesh.vertexBuffer, mesh.indexBuffer, mesh.indexCount);
    }
    if(gCurrentPipelineType === Pipeline_t.CTF){
      gCTFVolumeRenderPipeline?.updateUniforms({
        cameraPosition: cameraPositionBuffer,
        densityScale: gDensityScale,
        inverseModelMatrix: volumeRoot!.transform!.getInverseWorldMatrix(),
        modelMatrix: volumeRoot!.transform!.getWorldMatrix(),
        numSlices: dicomMetadata!.numSlices,
        projectionMatrix: projMatBuffer,
        stepSize: !usingHQ?gStepSizeLQ:gStepSizeHQ,
        toggleGradient: !usingHQ?gUseGradientLQ:gUseGradientHQ,
        viewMatrix: viewMatBuffer,
        volumeDepth: dicomMetadata!.numSlices!,
        volumeHeight: dicomMetadata!.height,
        volumeWidth:  dicomMetadata!.width,
        voxelSpacing: voxelSpacingBuffer
      });
      let mesh = gMeshBufferManager.getMesh("cube")!;
      gCTFVolumeRenderPipeline?.render(offscreenRenderPass, mesh.vertexBuffer, mesh.indexBuffer, mesh.indexCount);
    }
    offscreenRenderPass.end();

    const screenPass = commandEncoder.beginRenderPass({
      label: 'Screen Render Pass',
      colorAttachments: [{
        view: ctx.Context().getCurrentTexture().createView(),
        clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
        loadOp: 'clear',
        storeOp: 'store',
      }],
    });
   // gQuadRendererPipeline!.setTexture(gOffscreenRenderTarget.getColorTargetView());
    gQuadRendererPipeline!.render(screenPass);
    screenPass.end();
  },
  (_:GraphicsContext, width:number, height:number)=>{
    //Update the camera properties
    numberOfHQRenderings = 0; //we have to reset the number of high quality renders or else it won't render when we resize.
    const aspect = width / height;
    gCamera.setPerspectiveReversedInfinite((30.0 * Math.PI) / 180, aspect, 0.1);  
    //RENDERTARGET: Resize the render target
    gOffscreenRenderTarget.createTargets(width * gOffscreenBufferScaleLQ, height * gOffscreenBufferScaleLQ);
    //RENDERTARGET: Recreate the pipeline
    gQuadRendererPipeline?.setTexture(gOffscreenRenderTarget.getColorTargetView());
  },
  (adapter:GPUAdapter)=>{
    const desc:GPUDeviceDescriptor = {
      requiredLimits: {
        maxTextureArrayLayers: Math.min(2048, adapter.limits.maxTextureArrayLayers), //as many layers as i can.
        maxBufferSize: Math.min(2147483648, adapter.limits.maxBufferSize), // Request up to 2GB
      },
    }
    return desc;
  }
);
console.log(`creating ${graphicsContext} ${gMouseEventHandler} async..`);
////Init react context in react container div.
const container = document.querySelector('.reactContainer');
if(container) {
  const root = createRoot(container);
  root.render(
    React.createElement(Root)
  );
}
///Handle the switch between the window/level pipeline and the colour transfer function pipeline.
//Flips the switch and resets numberOfHQRenderings to allow it to render after the switch.
rootEventsTarget.addEventListener('pipeline-changed', (e:Event)=>{
  const { pipeline } = (e as CustomEvent).detail;
  console.log('Switching to pipeline:', pipeline);
  // Switch your rendering pipeline
  if (pipeline === 'wl') {
    gCurrentPipelineType = Pipeline_t.WindowLevel;
  } else {
    gCurrentPipelineType = Pipeline_t.CTF;
  }
  numberOfHQRenderings = 0;
});

async function getMetadata():Promise<ParsedDicomMetadata>{
    const response = await fetch(config.getDataPath(SERIES, "metadata.json"));
    const metadata: DicomSeriesMetadata = await response.json();
    const parsed = parseMetadata(metadata);
    return parsed;
}

function createVolumeTexture(device:GPUDevice, width: number, height:number, slices:number):GPUTexture{
    const volumeTexture = device.createTexture({
      size: {
        width: width,
        height: height,
        depthOrArrayLayers: slices
      },
      dimension: '2d',  
      format: 'r16float',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
    return volumeTexture;
}

function formatFileIndex(i:number):string{
    let fileIndex = "";
    if(i<10) fileIndex = "000"+i;
    if(i>=10 && i<100) fileIndex = "00"+i;
    if(i>=100 && i<1000) fileIndex = "0"+i;
    if(i>=1000 && i<10000) fileIndex = ""+i;
    return fileIndex;
}

async function fetchData(file:string):Promise<Uint8Array>{
    const resp = await fetch(file);
    const arrayBuffer = await resp.arrayBuffer();
    const rawData = new Uint8Array(arrayBuffer);
    return rawData;
}

function writeTexture(device:GPUDevice, volumeTexture:GPUTexture, rawData:Uint8Array, width:number, height:number, i:number){
    device.queue.writeTexture(
        {
          texture: volumeTexture,
          origin: { x: 0, y: 0, z: i }  // z = which array layer
        },
        rawData.buffer,  // The raw bytes
        {
          bytesPerRow: width * 2,  // 2 bytes per float16 pixel
          rowsPerImage: height,
        },
        {
          width: width,
          height: height,
          depthOrArrayLayers: 1  // Writing 1 slice
        }
      );     
}