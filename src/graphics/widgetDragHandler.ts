import type { CuttingCube } from "./cuttingCube";
import type { PickingRenderTarget } from "../medical/picking_render_target";
import type RotateAround from "../medical/mouse_events";

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
    private dragStartScreenY: number = 0;
    private dragStartBoundValue: number = 0;
    private canvasHeight: number = 0;

    // Callback for when widget selection changes
    private onSelectionChange: ((widgetId: number | null) => void) | null = null;

    constructor(
        private canvas: HTMLCanvasElement,
        private pickingRenderTarget: PickingRenderTarget,
        private cuttingCube: CuttingCube,
        private rotateAround: RotateAround
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

    private handlePointerDown(event: MouseEvent): void {
        const rect = this.canvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        this.tryStartDrag(x, y);
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
            this.dragStartScreenY = screenY;
            this.canvasHeight = canvasHeight;

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
        const y = event.clientY - rect.top;
        this.updateDrag(y);
    }

    private handleTouchMove(event: TouchEvent): void {
        if (!this.isDragging || event.touches.length !== 1) return;

        const touch = event.touches[0];
        const rect = this.canvas.getBoundingClientRect();
        const y = touch.clientY - rect.top;
        this.updateDrag(y);

        event.preventDefault(); // Prevent scrolling during drag
    }

    private updateDrag(currentScreenY: number): void {
        if (!this.isDragging || this.draggedWidgetId === null) return;

        // Calculate screen space delta (negative because Y increases downward)
        const deltaY = -(currentScreenY - this.dragStartScreenY);

        // Convert to world space delta
        // Scale by viewport height and apply sensitivity
        const sensitivity = 2.0; // Adjust this to change drag sensitivity
        const worldDelta = (deltaY / this.canvasHeight) * sensitivity;

        // Calculate new bound value
        let newBound = this.dragStartBoundValue + worldDelta;

        // Clamp to [-1, 1]
        newBound = Math.max(-1.0, Math.min(1.0, newBound));

        // Update the corresponding bound
        this.setBoundValue(this.draggedWidgetId, newBound);
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
