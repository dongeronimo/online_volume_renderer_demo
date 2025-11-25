import GameObject from "../graphics/entities/gameObject";

export default class MedicalGameObject extends GameObject {
    public emptySpaceSkippingData: EmptySpaceSkippingData = new EmptySpaceSkippingData(); 
    constructor(x:number, y:number, z:number, chunkSize:number,
        minHU:number, maxHU:number
    ){
        super(`${x};${y};${z}`);
        this.emptySpaceSkippingData.x = x;
        this.emptySpaceSkippingData.y = y;
        this.emptySpaceSkippingData.z = z;
        this.emptySpaceSkippingData.chunkSize = chunkSize;
        this.emptySpaceSkippingData.minHU = minHU;
        this.emptySpaceSkippingData.maxHU = maxHU;
    }
}

export class EmptySpaceSkippingData {
    public x:number = -1;
    public y:number = -1;
    public z:number=  -1;
    public chunkSize=-1;
    public minHU = -1;
    public maxHU = -1;
}