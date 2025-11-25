import { showErrorOverlay } from "../medical/ui/error_overlay";

export interface FpsData {
  fps:string;
  sceneUpdate:string;
  graphics:string;
}
/**
 * The graphics context is the core of the graphics system. It has a series of callbacks to handle the many steps
 */
class GraphicsContext {
  public static Ctx:GraphicsContext;
  /* Equivalent to the window/surface in VK.*/
  private canvas: HTMLCanvasElement;
  /* The logical device, equivalent to VkDevice*/
  private device!: GPUDevice;
  /* Manages the presentation surface. Equivalent to the VkSurfaceKHR + VkSwapChainKHR*/
  private context!: GPUCanvasContext;
  public Context():GPUCanvasContext{return this.context;}
  /* This method is called when the init has finishes setting up the device.*/
  private onInit : (ctx:GraphicsContext)=>Promise<void>;
  private depthTexture!: GPUTexture;  
  private depthTextureView:GPUTextureView|null = null;
  private onRender:(ctx:GraphicsContext, encoder:GPUCommandEncoder)=>void;
  private onResize:(ctx:GraphicsContext, width:number, height:number)=>void;
  private onUpdate: (deltaTime: number) => void;
  private resizeObserver: ResizeObserver;
  
  // FPS measurement
  private frameCount = 0;
  private lastFPSTime = 0;
  private updateTimeAccumulator = 0;
  private renderTimeAccumulator = 0;
  

  constructor(canvasId:string, //the id of the canvas DOM element 
    onInit:(ctx:GraphicsContext)=>Promise<void>, //on init is invoked at the end of the constructor. 
    onUpdate: (deltaTime: number) => void, //every frame, before the render.
    onRender:(ctx:GraphicsContext, encoder:GPUCommandEncoder)=>void, //where rendering is done. The command encoder is ready to receive commands and the commands are submitted when onRender ends
    onResize:(ctx:GraphicsContext, width:number, height:number)=>void, //when the canvas element changes size.
    private onConfigureDescriptor?:(adapter:GPUAdapter)=>GPUDeviceDescriptor //optional method, called before on init to specify special device properties.
  ) {
    GraphicsContext.Ctx = this;
    this.canvas = document.getElementById(canvasId) as HTMLCanvasElement;
    this.onInit = onInit;
    this.onRender = onRender;
    this.onUpdate = onUpdate;
    this.onResize = onResize;
    
    // Handle container size changes
    this.resizeObserver = new ResizeObserver((entries)=>{
      for(const _ of entries){
        this.handleResize();
      }
    });
    this.resizeObserver.observe(this.canvas.parentElement || this.canvas);
    
    // Handle window resize events (for when container is sized relative to viewport)
    window.addEventListener('resize', () => {
      this.handleResize();
    });
    
    this.init();
  }
  
  private handleResize() {
    const rect = this.canvas.getBoundingClientRect();
    const displayWidth = Math.floor(rect.width * devicePixelRatio);
    const displayHeight = Math.floor(rect.height * devicePixelRatio);

    // Only resize if dimensions actually changed
    if (this.canvas.width !== displayWidth || this.canvas.height !== displayHeight) {
      // Update canvas resolution
      this.canvas.width = displayWidth;
      this.canvas.height = displayHeight;

      // Canvas CSS size should match container (let CSS handle the sizing)
      // Remove explicit width/height style to let it fill container
      this.canvas.style.width = '100%';
      this.canvas.style.height = '100%';
      
      if (this.device && this.context) {
        this.context.configure({
          device: this.device,
          format: navigator.gpu.getPreferredCanvasFormat()
        });
        this.recreateDepthTexture();
        this.onResize(this, rect.width, rect.height);
      }
    }
  }
  
  private recreateDepthTexture() {
    if (this.depthTexture) {
      this.depthTexture.destroy();
    }
    this.depthTextureView = null;
    this.createDepthTexture();
  }
  
  // Add getter for pipeline to access
  public DepthTexture(): GPUTexture {
      return this.depthTexture;
  }
  
  public Device():GPUDevice {
    return this.device;
  }
  public DepthTextureView(): GPUTextureView {
    if(this.depthTextureView == null){
      this.depthTextureView = this.depthTexture.createView();
    }
    return this.depthTextureView;
  }
  
  public async loadShader(path:string):Promise<GPUShaderModule> {
    const response = await fetch(path);
    const shaderSrc = await response.text();
    return this.device.createShaderModule({
      label:path,
      code:shaderSrc
    });
  }
  
  private lastTime = 0;
  
  /* Initializes webgpu. After the initialization is complete it begins the render loop.*/
  private async init(): Promise<void> {
    // Check WebGPU support
    if (!navigator.gpu) {
      throw new Error('WebGPU not supported');
    }
    // Get adapter and device
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
      throw new Error('No GPU adapter found');
    }
    if(this.onConfigureDescriptor){
      const descriptor= this.onConfigureDescriptor(adapter);
      try{
        this.device = await adapter.requestDevice(descriptor);
      }catch(error){
        console.log("Could not create device:",error);
        showErrorOverlay("Could not create device:"+error);
      }
      // Add error handler
      this.device.addEventListener('uncapturederror', (event) => {
        const error = event.error;
        console.error('WebGPU uncaptured error:', error);
        showErrorOverlay("Could not create device:"+error.message);
      });
      this.device.lost.then((info) => {
        console.error('Device lost:', info.message, 'Reason:', info.reason);
        showErrorOverlay("Could not create device:"+info.message);
      });
    }
    else {
      this.device = await adapter.requestDevice();
      this.device.addEventListener('uncapturederror', (event) => {
        const error = event.error;
        console.error('WebGPU uncaptured error:', error);
        showErrorOverlay("Could not create device:"+error.message);
      });
      this.device.lost.then((info) => {
        console.error('Device lost:', info.message, 'Reason:', info.reason);
        showErrorOverlay('Device lost:'+ info.message+ ' Reason:'+ info.reason);
      });
    }
    // Setup canvas context
    this.context = this.canvas.getContext('webgpu') as GPUCanvasContext;
    this.context.configure({
      device: this.device,
      format: navigator.gpu.getPreferredCanvasFormat(),
    });
    this.createDepthTexture();
    
    // Initial resize
    this.handleResize();
    
    await this.onInit(this);
    this.lastFPSTime = performance.now();
    requestAnimationFrame((time) => this.runFrame(time));
  }
  
  /* Records and submits a render pass. Equivalent to VkCommandBuffer recording and vkQueueSubmit. */
  private runFrame(currentTime: number): void {
    const deltaTime = currentTime - this.lastTime;
    this.lastTime = currentTime;
    
    // Measure scene update time
    const updateStart = performance.now();
    this.onUpdate(deltaTime/1000);
    const updateTime = performance.now() - updateStart;
    
    // Measure graphics processing time
    const renderStart = performance.now();
    const commandEncoder = this.device.createCommandEncoder();
    this.onRender(this, commandEncoder);
    this.device.queue.submit([commandEncoder.finish()]);
    const renderTime = performance.now() - renderStart;
    
    // Accumulate timing data
    this.updateTimeAccumulator += updateTime;
    this.renderTimeAccumulator += renderTime;
    this.frameCount++;
    
    // Report FPS and timings every second
    const currentFPSTime = performance.now();
    if (currentFPSTime - this.lastFPSTime >= 1000) {
      const elapsed = currentFPSTime - this.lastFPSTime;
      const fps = this.frameCount / (elapsed / 1000);
      const avgUpdateTime = this.updateTimeAccumulator / this.frameCount;
      const avgRenderTime = this.renderTimeAccumulator / this.frameCount;
      
      const fpsData:FpsData = {
        fps:fps.toFixed(1),
        sceneUpdate:avgUpdateTime.toFixed(2),
        graphics:avgRenderTime.toFixed(2)
      }
      this.notifyListenersFPS(fpsData);
      // Reset counters
      this.frameCount = 0;
      this.updateTimeAccumulator = 0;
      this.renderTimeAccumulator = 0;
      this.lastFPSTime = currentFPSTime;
    }
    
    requestAnimationFrame((time) => this.runFrame(time));
  }
 
  private listenersFPS: Set<(fps: FpsData) => void> = new Set();
  public subscribeFPS(listener: (fps: FpsData)=> void): () => void {
    this.listenersFPS.add(listener);
    return () => this.listenersFPS.delete(listener); // unsubscribe function
  }
    
  private notifyListenersFPS(fps:FpsData): void {
    this.listenersFPS.forEach(listener => listener(fps));
  }

  private createDepthTexture(){
    this.depthTexture = this.device.createTexture({
      label: 'Depth Texture',
      size: {
          width: this.canvas.width,
          height: this.canvas.height,
          depthOrArrayLayers: 1,
      },
      format: 'depth24plus',
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
  }
  
  public Canvas() {
    return this.canvas;
  }
  
  async loadImageBitmap(url:string):Promise<ImageBitmap> {
    const response = await fetch(url);
    const blob = await response.blob();
    const imageBitmap = await createImageBitmap(blob);
    return imageBitmap;
  }

  public async createTextureFromImage(url:string):Promise<GPUTexture> {
    // Load the image
    const imageBitmap = await this.loadImageBitmap(url);
    
    // Create texture
    const texture = this.device.createTexture({
        size: [imageBitmap.width, imageBitmap.height, 1],
        format: 'rgba8unorm',
        usage: GPUTextureUsage.TEXTURE_BINDING | 
               GPUTextureUsage.COPY_DST | 
               GPUTextureUsage.RENDER_ATTACHMENT
    });
    
    // Copy image to texture
    this.device.queue.copyExternalImageToTexture(
        { source: imageBitmap },
        { texture: texture },
        [imageBitmap.width, imageBitmap.height]
    );
    
    return texture;
}
  // Add method to get current FPS stats if needed externally
  public getFPSStats(): {fps: number, avgUpdateTime: number, avgRenderTime: number} | null {
    if (this.frameCount === 0) return null;
    
    const elapsed = performance.now() - this.lastFPSTime;
    return {
      fps: this.frameCount / (elapsed / 1000),
      avgUpdateTime: this.updateTimeAccumulator / this.frameCount,
      avgRenderTime: this.renderTimeAccumulator / this.frameCount
    };
  }
}

export default GraphicsContext;
