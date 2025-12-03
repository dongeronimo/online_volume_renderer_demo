import { quat, vec3 } from "gl-matrix";
import type { Camera } from "../graphics/entities/gameObject";

export default class RotateAround {
    private enabled = true;
    private isRotating = false;  // Left button
    private isPanning = false;   // Right button
    private lastMouseX = 0;
    private lastMouseY = 0;
    private distance = 2;

    // Track camera orientation and up vector
    private orientation = quat.create();
    private currentUp = vec3.fromValues(0, 1, 0);
    private lookAtTarget = vec3.fromValues(0, 0, 0);  // Pan target

    readonly worldUp = vec3.fromValues(0, 1, 0);

    public setEnabled(enabled: boolean): void {
        this.enabled = enabled;
        if (!enabled) {
            // Disable any ongoing interactions
            this.isRotating = false;
            this.isPanning = false;
        }
    }

    constructor(canvas: HTMLCanvasElement, private gCamera: Camera,
        onBeginMovement:()=>void,
        onEndMovement:()=>void,
    ) {
        quat.copy(this.orientation, gCamera.rotation);
        
        canvas.addEventListener('mousedown', (e) => {
            if (!this.enabled) return;

            if (e.button === 0) {  // Left button - rotate
                this.isRotating = true;
            } else if (e.button === 2) {  // Right button - pan
                this.isPanning = true;
                e.preventDefault();  // Prevent context menu
            }

            this.lastMouseX = e.clientX;
            this.lastMouseY = e.clientY;
            onBeginMovement();
        });
        
        canvas.addEventListener('mousemove', (e) => {
            if (!this.enabled) return;

            const deltaX = e.clientX - this.lastMouseX;
            const deltaY = e.clientY - this.lastMouseY;

            if (this.isRotating) {
                this.handleRotate(deltaX, deltaY);
            } else if (this.isPanning) {
                this.handlePan(deltaX, deltaY);
            }

            this.lastMouseX = e.clientX;
            this.lastMouseY = e.clientY;
        });
        
        canvas.addEventListener('mouseup', (e) => {
            if (e.button === 0) this.isRotating = false;
            if (e.button === 2) this.isPanning = false;
            onEndMovement();
        });
        
        canvas.addEventListener('mouseleave', () => {
            this.isRotating = false;
            this.isPanning = false;
            onEndMovement();
        });
        
        // Prevent context menu on right-click
        canvas.addEventListener('contextmenu', (e) => {
            e.preventDefault();
        });
        
        canvas.addEventListener('wheel', (e) => {
            if (!this.enabled) return;

            onBeginMovement();
            e.preventDefault();
            this.distance += e.deltaY * 0.01;
            this.distance = Math.max(0.5, Math.min(20, this.distance));
            this.updateCamera();
            onEndMovement();
        });
    }
    
    private handleRotate(deltaX: number, deltaY: number): void {
        const sensitivity = 0.01;
        
        // Horizontal rotation around current up
        const qh = quat.setAxisAngle(quat.create(), this.currentUp, -deltaX * sensitivity);
        
        // Vertical rotation around camera's right
        const right = vec3.fromValues(1, 0, 0);
        vec3.transformQuat(right, right, this.orientation);
        const qv = quat.setAxisAngle(quat.create(), right, -deltaY * sensitivity);
        
        // Apply rotations
        quat.multiply(this.orientation, qh, this.orientation);
        quat.multiply(this.orientation, qv, this.orientation);
        quat.normalize(this.orientation, this.orientation);
        
        // Update up vector
        vec3.set(this.currentUp, 0, 1, 0);
        vec3.transformQuat(this.currentUp, this.currentUp, this.orientation);
        
        this.updateCamera();
    }
    
    private handlePan(deltaX: number, deltaY: number): void {
        const panSpeed = 0.002 * this.distance;  // Scale with distance
        
        // Get camera's right and up vectors
        const right = vec3.fromValues(1, 0, 0);
        vec3.transformQuat(right, right, this.orientation);
        
        const up = vec3.clone(this.currentUp);
        
        // Pan target
        vec3.scaleAndAdd(this.lookAtTarget, this.lookAtTarget, right, -deltaX * panSpeed);
        vec3.scaleAndAdd(this.lookAtTarget, this.lookAtTarget, up, deltaY * panSpeed);
        
        this.updateCamera();
    }
    
    private updateCamera(): void {
        // Calculate position from orientation and distance
        const back = vec3.fromValues(0, 0, 1);
        vec3.transformQuat(back, back, this.orientation);
        const position = vec3.scaleAndAdd(vec3.create(), this.lookAtTarget, back, this.distance);
        
        this.gCamera.lookAt(
            position,
            this.lookAtTarget,
            this.currentUp
        );
    }
}