import { mat4, quat, vec3 } from "gl-matrix";
// import type TransformComponentData from "../../prefabs/baseDefinitions/transformComponentData";
import type Pipeline from "../pipeline";
import type { TransformComponentData } from "../../prefabs/baseDefinitions/transformComponentData";

export default class GameObject {
    readonly transform:Transform = new Transform(this);
    public staticMesh:StaticMesh|undefined = undefined;
    public phongMaterial:PhongMaterial|undefined = undefined;
    constructor(readonly name:string){}
}

export class Transform {
    private _position = vec3.create();
    private _rotation = quat.create(); // Internal quaternion storage
    private _eulerAngles = vec3.create();
    private _scale = vec3.fromValues(1, 1, 1);
    private parent: GameObject|undefined = undefined
    private children: GameObject[] = []; //empty = no children.

    constructor(readonly owner:GameObject){

    }
    /**
     * Calculated by getWorldMatrix. Has the last result of getWorldMatrix
     * or an empty matrix.
     */
    public _worldMatrix = mat4.create();
    
    getChildren(): GameObject[] {
        return this.children;
    }
    setParent(p:GameObject) {
        this.parent = p;
        p.transform.children.push(this.owner);
    }
    initFromComponentData(transData: TransformComponentData) {
        if(transData.position != undefined){
            this._position = vec3.fromValues(transData.position[0], transData.position[1], transData.position[2]);
        }
        if(transData.rotation != undefined){
            //TODO: transData.rotation is in euler, _rotation is in quat.
            throw new Error("Method not implemented.");
        }
        if(transData.scale != undefined){
            this._scale = vec3.fromValues(transData.scale[0], transData.scale[1], transData.scale[2]);
        }
    }
    getInverseWorldMatrix():Float32Array {
        let inverse = mat4.create()
        mat4.invert(inverse, this._worldMatrix);
        return inverse as Float32Array;
    }
    getWorldMatrix(): Float32Array {
        if (this.parent === undefined) {
            // No parent - local matrix is world matrix
            this._worldMatrix = this.getLocalMatrix();
            return this._worldMatrix as Float32Array;
        }
        const parentTransform = this.parent!.transform;
        // Get parent's world matrix recursively
        const parentWorldMatrix = parentTransform.getWorldMatrix();
        // Multiply parent world matrix by our local matrix
        const localMatrix = this.getLocalMatrix();
        this._worldMatrix = mat4.create();
        mat4.multiply(this._worldMatrix, parentWorldMatrix as any, localMatrix as any);
        return this._worldMatrix as Float32Array;
    }

    // Get the local transformation matrix
    getLocalMatrix(): Float32Array {
        const matrix = mat4.create();
        mat4.fromRotationTranslationScale(matrix, this._rotation, this._position, this._scale);
        return matrix as Float32Array;
    }

    /**
     * Sets the quaternion directly.
     */
    setRotationQuaternion(q: quat): void {
        quat.copy(this._rotation, q);
        this.updateEulerFromQuaternion();
    }
       get position(): vec3 { return this._position; }
    set position(pos: vec3) { vec3.copy(this._position, pos); }

    translate(offset: vec3): void {
        vec3.add(this._position, this._position, offset);
    }

    // Scale operations
    get scale(): vec3 { return this._scale; }
    set scale(s: vec3) { vec3.copy(this._scale, s); }

    scaleBy(factor: vec3): void {
        vec3.multiply(this._scale, this._scale, factor);
    }
    // Rotation operations - Euler angles (user-facing, unlimited range)
    get eulerAngles(): vec3 { return this._eulerAngles; }
    set eulerAngles(angles: vec3) {
        vec3.copy(this._eulerAngles, angles);
        this.updateQuaternionFromEuler();
    }
    rotate(deltaAngles: vec3): void {
        vec3.add(this._eulerAngles, this._eulerAngles, deltaAngles);
        this.updateQuaternionFromEuler();
    }
    // Look at target
    lookAt(target: vec3, up: vec3 = vec3.fromValues(0, 1, 0)): void {
        const tempMatrix = mat4.create();
        mat4.lookAt(tempMatrix, this._position, target, up);

        // Extract quaternion from look-at matrix
        mat4.getRotation(this._rotation, tempMatrix);
        this.updateEulerFromQuaternion();
    }
    // Internal methods
    private updateQuaternionFromEuler(): void {
        quat.fromEuler(this._rotation, this._eulerAngles[0] /** 180/Math.PI*/,
            this._eulerAngles[1]  /** 180/Math.PI*/,
            this._eulerAngles[2]  /** 180/Math.PI*/);
    }

    private updateEulerFromQuaternion(): void {
        // Convert quaternion back to Euler (approximate)
        const tempMatrix = mat4.create();
        mat4.fromQuat(tempMatrix, this._rotation);

        // Extract Euler angles from rotation matrix
        // This is a simplified extraction - you might want a more robust version
        this._eulerAngles[1] = Math.asin(-tempMatrix[8]); // Y rotation
        this._eulerAngles[0] = Math.atan2(tempMatrix[9], tempMatrix[10]); // X rotation  
        this._eulerAngles[2] = Math.atan2(tempMatrix[4], tempMatrix[0]); // Z rotation
    }
    /**
     * Rotate around a world-space axis through a pivot point
     * @param pivot The pivot point in world space
     * @param worldAxis The axis in world space (e.g., vec3.fromValues(0, 1, 0) for Y)
     * @param angleDegrees The angle in degrees
     */
    rotateAroundWorldAxis(pivot: vec3, worldAxis: vec3, angleDegrees: number): void {
        const angleRadians = (angleDegrees * Math.PI) / 180;
        
        // Create rotation matrix around the world axis
        const rotationMatrix = mat4.create();
        mat4.fromRotation(rotationMatrix, angleRadians, worldAxis);
        
        // Translate position to pivot
        const offsetFromPivot = vec3.create();
        vec3.subtract(offsetFromPivot, this._position, pivot);
        
        // Rotate the offset
        const rotatedOffset = vec3.create();
        vec3.transformMat4(rotatedOffset, offsetFromPivot, rotationMatrix);
        
        // Update position
        vec3.add(this._position, pivot, rotatedOffset);
        
        // Create quaternion from rotation matrix
        const rotationQuat = quat.create();
        mat4.getRotation(rotationQuat, rotationMatrix);
        
        // Apply rotation to object's rotation
        quat.multiply(this._rotation, rotationQuat, this._rotation);
        this.updateEulerFromQuaternion();
    }
    /**
     * rotate around a pivot using euler angles
     *
     */
    rotateAroundPivotEuler(pivot: vec3, deltaAngles: vec3): void {
        // Save current position
        // const currentPos = vec3.clone(this._position);
        
        // Translate to pivot
        vec3.subtract(this._position, this._position, pivot);
        
        // Create rotation matrix from delta angles
        const rotMat = mat4.create();
        mat4.fromRotation(rotMat, (deltaAngles[0] * Math.PI) / 180, vec3.fromValues(1, 0, 0));
        
        const rotMatY = mat4.create();
        mat4.fromRotation(rotMatY, (deltaAngles[1] * Math.PI) / 180, vec3.fromValues(0, 1, 0));
        mat4.multiply(rotMat, rotMatY, rotMat);
        
        const rotMatZ = mat4.create();
        mat4.fromRotation(rotMatZ, (deltaAngles[2] * Math.PI) / 180, vec3.fromValues(0, 0, 1));
        mat4.multiply(rotMat, rotMatZ, rotMat);
        
        // Rotate position around origin
        vec3.transformMat4(this._position, this._position, rotMat);
        
        // Translate back from pivot
        vec3.add(this._position, this._position, pivot);
        
        // Apply rotation to object's own rotation
        const rotQuat = quat.create();
        mat4.getRotation(rotQuat, rotMat);
        quat.multiply(this._rotation, rotQuat, this._rotation);
        this.updateEulerFromQuaternion();
    }    
}

export class StaticMesh {
    constructor(readonly meshId:string){}
}

export class PhongMaterial {
    constructor(
        public name:string,
        readonly pipeline:Pipeline,
        public diffuse: vec3,
        public specular: vec3,
        public ambient: vec3,
        public shininess: number,
        public diffuseTextureId?: string,
        public specularTextureId?: string,
        public shininessTextureId?: string 
    ){}
    /**
     * Creates a Float32Array with proper alignment for WebGPU struct PhongAttributes
     * Layout:
     * - diffuse: vec4<f32> (16 bytes) - offset 0
     * - specular: vec4<f32> (16 bytes) - offset 16
     * - ambient: vec3<f32> (12 bytes) - offset 32
     * - shininess: f32 (4 bytes) - offset 44
     * Total size: 48 bytes
     */
    toGPUBuffer(): Float32Array {
        const buffer = new Float32Array(12); // 48 bytes / 4 bytes per float = 12 floats
        
        // diffuse (vec4) - offset 0
        buffer[0] = this.diffuse[0];
        buffer[1] = this.diffuse[1];
        buffer[2] = this.diffuse[2];
        buffer[3] = 1.0; // w component, typically 1.0 for colors
        
        // specular (vec4) - offset 16 bytes (index 4)
        buffer[4] = this.specular[0];
        buffer[5] = this.specular[1];
        buffer[6] = this.specular[2];
        buffer[7] = 1.0; // w component
        
        // ambient (vec3) - offset 32 bytes (index 8)
        buffer[8] = this.ambient[0];
        buffer[9] = this.ambient[1];
        buffer[10] = this.ambient[2];
        
        // shininess (f32) - offset 44 bytes (index 11)
        buffer[11] = this.shininess;
        
        return buffer;
    }
}

export class Camera {
    public viewMatrix = mat4.create();
    public projectionMatrix = mat4.create();
    private viewProjectionMatrix = mat4.create();
    public position = vec3.create();
    public rotation = quat.create(); // Quaternion for rotation
    
    // Frustum planes in world space (updated when view/projection changes)
    private frustumPlanes: Array<{normal: vec3, distance: number}> = [];
    
    // Set up perspective projection
    setPerspective(fov: number, aspect: number, near: number, far: number): void {
        mat4.perspective(this.projectionMatrix, fov, aspect, near, far);
        this.updateFrustumPlanes();
    }
    
    // Set up view matrix (camera position and target)
    lookAt(eye: vec3, center: vec3, up: vec3): void {
        mat4.lookAt(this.viewMatrix, eye, center, up);
        this.position = vec3.clone(eye);
        
        // Extract quaternion from view matrix
        const cameraMatrix = mat4.create();
        mat4.invert(cameraMatrix, this.viewMatrix);
        mat4.getRotation(this.rotation, cameraMatrix);
    
        this.updateFrustumPlanes();
    }
    
    // Set camera using position and quaternion rotation
    setPositionAndRotation(position: vec3, rotation: quat): void {
        this.position = vec3.clone(position);
        this.rotation = quat.clone(rotation);
        this.updateViewMatrix();
    }
    
    // Rotate camera by a quaternion delta
    rotate(deltaRotation: quat): void {
        quat.multiply(this.rotation, deltaRotation, this.rotation);
        quat.normalize(this.rotation, this.rotation);
        this.updateViewMatrix();
    }
    
    // Update view matrix from current position and rotation
    private updateViewMatrix(): void {
        const rotationMatrix = mat4.fromQuat(mat4.create(), this.rotation);
        const translationMatrix = mat4.fromTranslation(mat4.create(), vec3.negate(vec3.create(), this.position));
        mat4.multiply(this.viewMatrix, rotationMatrix, translationMatrix);
        this.updateFrustumPlanes();
    }
    
    // Get forward vector from rotation (camera looks down -Z)
    getForward(): vec3 {
        const forward = vec3.fromValues(0, 0, -1);
        vec3.transformQuat(forward, forward, this.rotation);
        return forward;
    }
    
    // Get right vector from rotation
    getRight(): vec3 {
        const right = vec3.fromValues(1, 0, 0);
        vec3.transformQuat(right, right, this.rotation);
        return right;
    }
    
    // Get up vector from rotation
    getUp(): vec3 {
        const up = vec3.fromValues(0, 1, 0);
        vec3.transformQuat(up, up, this.rotation);
        return up;
    }
    
    // For infinite far plane (common with reversed-Z)
    setPerspectiveReversedInfinite(fov: number, aspect: number, near: number): void {
        const f = 1.0 / Math.tan(fov * 0.5);
        
        mat4.set(this.projectionMatrix,
            f / aspect, 0, 0, 0,     // Column 0
            0, f, 0, 0,              // Column 1
            0, 0, 0, -1,             // Column 2 (infinite far)
            0, 0, near, 0            // Column 3
        );
        this.updateFrustumPlanes();
    }
    
    // Get combined view-projection matrix
    getViewProjectionMatrix(): Float32Array {
        mat4.multiply(this.viewProjectionMatrix, this.projectionMatrix, this.viewMatrix);
        return this.viewProjectionMatrix as Float32Array;
    }

    // Get camera uniforms (view-projection matrix + position) for the shader
    getCameraUniforms(): Float32Array {
        // Calculate view-projection matrix
        mat4.multiply(this.viewProjectionMatrix, this.projectionMatrix, this.viewMatrix);
        
        // Create buffer: 16 floats for mat4x4 + 4 floats for position (vec3 + padding)
        const buffer = new Float32Array(20);
        
        // Copy view-projection matrix (16 floats)
        buffer.set(this.viewProjectionMatrix, 0);
        
        // Copy position as vec4 (indices 16-19)
        buffer[16] = this.position[0];
        buffer[17] = this.position[1];
        buffer[18] = this.position[2];
        buffer[19] = 0.0; // padding for 16-byte alignment
        
        return buffer;
    }
    
    // Extract frustum planes from view-projection matrix
    private updateFrustumPlanes(): void {
        mat4.multiply(this.viewProjectionMatrix, this.projectionMatrix, this.viewMatrix);
        const m = this.viewProjectionMatrix;
        
        this.frustumPlanes = [];
        
        // Left plane
        this.frustumPlanes.push(this.normalizePlane(
            m[3] + m[0], m[7] + m[4], m[11] + m[8], m[15] + m[12]
        ));
        
        // Right plane
        this.frustumPlanes.push(this.normalizePlane(
            m[3] - m[0], m[7] - m[4], m[11] - m[8], m[15] - m[12]
        ));
        
        // Bottom plane
        this.frustumPlanes.push(this.normalizePlane(
            m[3] + m[1], m[7] + m[5], m[11] + m[9], m[15] + m[13]
        ));
        
        // Top plane
        this.frustumPlanes.push(this.normalizePlane(
            m[3] - m[1], m[7] - m[5], m[11] - m[9], m[15] - m[13]
        ));
        
        // Near plane
        this.frustumPlanes.push(this.normalizePlane(
            m[3] + m[2], m[7] + m[6], m[11] + m[10], m[15] + m[14]
        ));
        
        // Far plane (skip for infinite far plane, but include for completeness)
        this.frustumPlanes.push(this.normalizePlane(
            m[3] - m[2], m[7] - m[6], m[11] - m[10], m[15] - m[14]
        ));
    }
    
    // Normalize a plane equation
    private normalizePlane(a: number, b: number, c: number, d: number): {normal: vec3, distance: number} {
        const length = Math.sqrt(a * a + b * b + c * c);
        return {
            normal: vec3.fromValues(a / length, b / length, c / length),
            distance: d / length
        };
    }
    
    /**
     * Test if an axis-aligned bounding box is inside the camera frustum
     * @param worldMatrix World transformation matrix of the object
     * @param halfExtents Half-extents of the bounding box in local space (typically vec3(0.5, 0.5, 0.5) for unit cube)
     * @returns true if the box is visible (fully or partially inside frustum)
     */
    public isInFrustum(worldMatrix: Float32Array, halfExtents: vec3 = vec3.fromValues(0.5, 0.5, 0.5)): boolean {
        // Extract center position from world matrix (translation component)
        const center = vec3.fromValues(worldMatrix[12], worldMatrix[13], worldMatrix[14]);
        
        // Extract scale from world matrix to scale the half-extents
        const scaleX = Math.sqrt(worldMatrix[0] * worldMatrix[0] + worldMatrix[1] * worldMatrix[1] + worldMatrix[2] * worldMatrix[2]);
        const scaleY = Math.sqrt(worldMatrix[4] * worldMatrix[4] + worldMatrix[5] * worldMatrix[5] + worldMatrix[6] * worldMatrix[6]);
        const scaleZ = Math.sqrt(worldMatrix[8] * worldMatrix[8] + worldMatrix[9] * worldMatrix[9] + worldMatrix[10] * worldMatrix[10]);
        
        const scaledHalfExtents = vec3.fromValues(
            halfExtents[0] * scaleX,
            halfExtents[1] * scaleY,
            halfExtents[2] * scaleZ
        );
        
        // Test against each frustum plane
        for (const plane of this.frustumPlanes) {
            // Find the "positive vertex" - the corner of the box furthest along the plane normal
            const px = plane.normal[0] > 0 ? scaledHalfExtents[0] : -scaledHalfExtents[0];
            const py = plane.normal[1] > 0 ? scaledHalfExtents[1] : -scaledHalfExtents[1];
            const pz = plane.normal[2] > 0 ? scaledHalfExtents[2] : -scaledHalfExtents[2];
            
            // Distance from center to plane
            const distance = vec3.dot(plane.normal, center) + plane.distance;
            
            // Distance from positive vertex to plane
            const pVertexDistance = distance + (px * plane.normal[0] + py * plane.normal[1] + pz * plane.normal[2]);
            
            // If the positive vertex is outside this plane, the entire box is outside
            if (pVertexDistance < 0) {
                return false;
            }
        }
        
        // Box is inside or intersecting the frustum
        return true;
    }
}
