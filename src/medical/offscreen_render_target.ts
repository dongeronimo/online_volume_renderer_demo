
export class OffscreeRenderTarget {
    private device?:GPUDevice;
    private colorFormat?: GPUTextureFormat;
    private depthFormat:GPUTextureFormat = 'depth24plus';
    private colorRenderTarget?:GPUTexture;
    private colorRenderTargetView?:GPUTextureView;
    private depthRenderTarget?:GPUTexture;
    private depthRenderTargetView?:GPUTextureView;
    public init(device:GPUDevice, textureFormat:GPUTextureFormat){
        this.colorFormat = textureFormat;
        this.device = device;
    }

    public createTargets(w:number, h:number){
        if(this.device){
            this.colorRenderTarget = this.device!.createTexture({
              size : {width: w, height: h, depthOrArrayLayers:1},
              format: this.colorFormat!,
              usage: GPUTextureUsage.TEXTURE_BINDING |
                     GPUTextureUsage.RENDER_ATTACHMENT
            });
            this.colorRenderTargetView = this.colorRenderTarget.createView();
            this.depthRenderTarget = this.device!.createTexture({
              size: { width: w, height: h, depthOrArrayLayers: 1 },
              format: this.depthFormat,
              usage: GPUTextureUsage.RENDER_ATTACHMENT,
            });
            this.depthRenderTargetView = this.depthRenderTarget.createView();
        }
        else {
            console.log("trying to create offscreen render targets while having no device.");
        }
    }

    public getColorTargetView():GPUTextureView{
        return this.colorRenderTargetView!;
    }
    public getColorTarget():GPUTexture{
        return this.colorRenderTarget!;
    }
    public getDepthTargetView():GPUTextureView{
        return this.depthRenderTargetView!
    }
    public getDepthTarget():GPUTexture{
        return this.depthRenderTarget!
    }
}