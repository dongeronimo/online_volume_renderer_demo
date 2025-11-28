import type { CuttingCube } from "./cuttingCube";
import type { PickingRenderTarget } from "../medical/picking_render_target";
import type RotateAround from "../medical/mouse_events";
import type { Camera } from "./entities/gameObject";
import { mat4, vec3, vec4 } from "gl-matrix";

/**
 * Handles mouse and touch interaction for dragging cutting cube face widgets
 * Maps widget IDs to cutting cube bounds:
 * 1 (+X Red) → xmax
 * 2 (-X Cyan) → xmin
 * 3 (+Y Green) → ymax
 * 4 (-Y Magenta) → ymin
 * 5 (+Z Blue) → zmax
 * 6 (-Z Yellow) → zmin
 */
export class WidgetDragHandler {
    private isDragging: boolean = false;
    private draggedWidgetId: number | null = null;
    private dragStartScreenX: number = 0;
    private dragStartScreenY: number = 0;
    private dragStartBoundValue: number = 0;

    // Callback for when widget selection changes
    private onSelectionChange: ((widgetId: number | null) => void) | null = null;

    constructor(
        private canvas: HTMLCanvasElement,
        private pickingRenderTarget: PickingRenderTarget,
        private cuttingCube: CuttingCube,
        private rotateAround: RotateAround,
        private camera: Camera
    ) {
        this.setupEventListeners();
    }

    /**
     * Set callback for when widget selection changes
     */
    public setSelectionCallback(callback: (widgetId: number | null) => void): void {
        this.onSelectionChange = callback;
    }

    /**
     * Get currently selected widget ID (null if none)
     */
    public getSelectedWidgetId(): number | null {
        return this.draggedWidgetId;
    }

    private setupEventListeners(): void {
        // Mouse events
        this.canvas.addEventListener('mousedown', this.handlePointerDown.bind(this));
        this.canvas.addEventListener('mousemove', this.handlePointerMove.bind(this));
        this.canvas.addEventListener('mouseup', this.handlePointerUp.bind(this));
        this.canvas.addEventListener('mouseleave', this.handlePointerUp.bind(this));

        // Touch events
        this.canvas.addEventListener('touchstart', this.handleTouchStart.bind(this), { passive: false });
        this.canvas.addEventListener('touchmove', this.handleTouchMove.bind(this), { passive: false });
        this.canvas.addEventListener('touchend', this.handleTouchEnd.bind(this));
        this.canvas.addEventListener('touchcancel', this.handleTouchEnd.bind(this));
    }

    private async handlePointerDown(event: MouseEvent): Promise<void> {
        const rect = this.canvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        await this.tryStartDrag(x, y);
    }

    private async handleTouchStart(event: TouchEvent): Promise<void> {
        if (event.touches.length !== 1) return; // Only handle single touch

        const touch = event.touches[0];
        const rect = this.canvas.getBoundingClientRect();
        const x = touch.clientX - rect.left;
        const y = touch.clientY - rect.top;

        const started = await this.tryStartDrag(x, y);
        if (started) {
            event.preventDefault(); // Prevent scrolling/zooming during drag
        }
    }

    private async tryStartDrag(screenX: number, screenY: number): Promise<boolean> {
        // Get picking buffer dimensions
        const pickingWidth = this.pickingRenderTarget.getWidth();
        const pickingHeight = this.pickingRenderTarget.getHeight();

        // Scale coordinates to match picking buffer
        const canvasWidth = this.canvas.clientWidth;
        const canvasHeight = this.canvas.clientHeight;
        const scaleX = pickingWidth / canvasWidth;
        const scaleY = pickingHeight / canvasHeight;
        const pickX = Math.floor(screenX * scaleX);
        const pickY = Math.floor(screenY * scaleY);

        // Do GPU picking
        const objectId = await this.pickingRenderTarget.readPixel(pickX, pickY);

        if (objectId >= 1 && objectId <= 6) {
            // Widget clicked - start drag
            this.isDragging = true;
            this.draggedWidgetId = objectId;
            this.dragStartScreenX = screenX;
            this.dragStartScreenY = screenY;

            // Store initial bound value
            this.dragStartBoundValue = this.getBoundValue(objectId);

            // Disable camera rotation
            this.rotateAround.setEnabled(false);

            // Notify selection changed
            if (this.onSelectionChange) {
                this.onSelectionChange(objectId);
            }

            return true;
        }

        return false;
    }

    private handlePointerMove(event: MouseEvent): void {
        if (!this.isDragging) return;

        const rect = this.canvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        this.updateDrag(x, y);
    }

    private handleTouchMove(event: TouchEvent): void {
        if (!this.isDragging || event.touches.length !== 1) return;

        const touch = event.touches[0];
        const rect = this.canvas.getBoundingClientRect();
        const x = touch.clientX - rect.left;
        const y = touch.clientY - rect.top;
        this.updateDrag(x, y);

        event.preventDefault(); // Prevent scrolling during drag
    }

    private updateDrag(currentScreenX: number, currentScreenY: number): void {
        if (!this.isDragging || this.draggedWidgetId === null) return;

        // Get the widget's axis direction in world space
        const axis = this.getWidgetAxis(this.draggedWidgetId);

        // Get the widget's current world position
        const widgetPos = this.getWidgetPosition(this.draggedWidgetId);

        // Calculate a second point along the axis for direction projection
        const axisEnd = vec3.create();
        vec3.scaleAndAdd(axisEnd, widgetPos, axis, 1.0);

        // Project both points to screen space
        const viewProj = mat4.create();
        mat4.multiply(viewProj, this.camera.projectionMatrix, this.camera.viewMatrix);

        const screenStart = this.worldToScreen(widgetPos, viewProj);
        const screenEnd = this.worldToScreen(axisEnd, viewProj);

        // Get screen-space direction (normalized)
        const screenDir = vec3.create();
        vec3.subtract(screenDir, screenEnd, screenStart);
        const screenDirLength = vec3.length(screenDir);

        if (screenDirLength < 0.001) {
            // Axis is perpendicular to view, can't drag
            return;
        }

        vec3.scale(screenDir, screenDir, 1.0 / screenDirLength);

        // Calculate mouse delta in screen space
        const mouseDelta = vec3.fromValues(
            currentScreenX - this.dragStartScreenX,
            currentScreenY - this.dragStartScreenY,
            0
        );

        // Project mouse delta onto screen-space axis direction
        const projectedDelta = vec3.dot(mouseDelta, screenDir);

        // Convert to world delta
        // The screen direction's length tells us how much screen space = 1 world unit
        const sensitivity = 0.5; // Lower = more sensitive
        const worldDelta = (projectedDelta / screenDirLength) * sensitivity;

        // Calculate new bound value
        let newBound = this.dragStartBoundValue + worldDelta;

        // Clamp to [-1, 1]
        newBound = Math.max(-1.0, Math.min(1.0, newBound));

        // Update the corresponding bound
        this.setBoundValue(this.draggedWidgetId, newBound);
    }

    /**
     * Project a world position to screen coordinates
     */
    private worldToScreen(worldPos: vec3, viewProj: mat4): vec3 {
        const clipPos = vec4.create();
        vec4.transformMat4(clipPos, vec4.fromValues(worldPos[0], worldPos[1], worldPos[2], 1.0), viewProj);

        // Perspective divide
        const ndcX = clipPos[0] / clipPos[3];
        const ndcY = clipPos[1] / clipPos[3];

        // Convert NDC [-1,1] to screen coordinates [0, width/height]
        const screenX = (ndcX + 1.0) * 0.5 * this.canvas.clientWidth;
        const screenY = (1.0 - ndcY) * 0.5 * this.canvas.clientHeight; // Flip Y

        return vec3.fromValues(screenX, screenY, 0);
    }

    /**
     * Get the axis direction for a widget
     * Axis points in the direction to INCREASE the bound value
     */
    private getWidgetAxis(widgetId: number): vec3 {
        switch (widgetId) {
            case 1: return vec3.fromValues(1, 0, 0);  // +X face → increase xmax
            case 2: return vec3.fromValues(1, 0, 0);  // -X face → increase xmin (toward center)
            case 3: return vec3.fromValues(0, 1, 0);  // +Y face → increase ymax
            case 4: return vec3.fromValues(0, 1, 0);  // -Y face → increase ymin (toward center)
            case 5: return vec3.fromValues(0, 0, 1);  // +Z face → increase zmax
            case 6: return vec3.fromValues(0, 0, 1);  // -Z face → increase zmin (toward center)
            default: return vec3.fromValues(0, 0, 0);
        }
    }

    /**
     * Get the world position of a widget (center of the face)
     */
    private getWidgetPosition(widgetId: number): vec3 {
        const centerX = (this.cuttingCube.xmin + this.cuttingCube.xmax) / 2.0;
        const centerY = (this.cuttingCube.ymin + this.cuttingCube.ymax) / 2.0;
        const centerZ = (this.cuttingCube.zmin + this.cuttingCube.zmax) / 2.0;

        switch (widgetId) {
            case 1: return vec3.fromValues(this.cuttingCube.xmax, centerY, centerZ); // +X
            case 2: return vec3.fromValues(this.cuttingCube.xmin, centerY, centerZ); // -X
            case 3: return vec3.fromValues(centerX, this.cuttingCube.ymax, centerZ); // +Y
            case 4: return vec3.fromValues(centerX, this.cuttingCube.ymin, centerZ); // -Y
            case 5: return vec3.fromValues(centerX, centerY, this.cuttingCube.zmax); // +Z
            case 6: return vec3.fromValues(centerX, centerY, this.cuttingCube.zmin); // -Z
            default: return vec3.fromValues(0, 0, 0);
        }
    }

    private handlePointerUp(): void {
        this.endDrag();
    }

    private handleTouchEnd(): void {
        this.endDrag();
    }

    private endDrag(): void {
        if (!this.isDragging) return;

        this.isDragging = false;
        this.draggedWidgetId = null;

        // Re-enable camera rotation
        this.rotateAround.setEnabled(true);

        // Notify selection cleared
        if (this.onSelectionChange) {
            this.onSelectionChange(null);
        }
    }

    /**
     * Get the current value of the bound corresponding to the widget ID
     */
    private getBoundValue(widgetId: number): number {
        switch (widgetId) {
            case 1: return this.cuttingCube.xmax; // +X (Red)
            case 2: return this.cuttingCube.xmin; // -X (Cyan)
            case 3: return this.cuttingCube.ymax; // +Y (Green)
            case 4: return this.cuttingCube.ymin; // -Y (Magenta)
            case 5: return this.cuttingCube.zmax; // +Z (Blue)
            case 6: return this.cuttingCube.zmin; // -Z (Yellow)
            default: return 0;
        }
    }

    /**
     * Set the bound value corresponding to the widget ID
     */
    private setBoundValue(widgetId: number, value: number): void {
        switch (widgetId) {
            case 1: this.cuttingCube.xmax = value; break; // +X (Red)
            case 2: this.cuttingCube.xmin = value; break; // -X (Cyan)
            case 3: this.cuttingCube.ymax = value; break; // +Y (Green)
            case 4: this.cuttingCube.ymin = value; break; // -Y (Magenta)
            case 5: this.cuttingCube.zmax = value; break; // +Z (Blue)
            case 6: this.cuttingCube.zmin = value; break; // -Z (Yellow)
        }
    }
}
