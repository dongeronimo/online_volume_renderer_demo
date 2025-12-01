import { vec2, vec3, mat4 } from 'wgpu-matrix';
import { LassoContour, LassoManager } from './lassoDrawing';
import { simplifyContour } from './lassoSimplification';
import { Camera } from '../graphics/entities/gameObject';

/**
 * Handles mouse input for drawing lasso contours
 * Locks camera controls while drawing
 */
export class LassoInputHandler {
  private isDrawing: boolean = false;
  private rawPoints: vec2[] = [];
  private canvas: HTMLCanvasElement;
  private enabled: boolean = false;

  // Callbacks
  private onDrawStart?: () => void;
  private onDrawEnd?: () => void;
  private onPointsUpdate?: (points: vec2[]) => void;

  constructor(
    canvas: HTMLCanvasElement,
    private lassoManager: LassoManager,
    private camera: Camera
  ) {
    this.canvas = canvas;
    this.setupEventListeners();
  }

  /**
   * Enable or disable lasso drawing mode
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;

    if (!enabled && this.isDrawing) {
      // Cancel current drawing if disabled mid-draw
      this.cancelDrawing();
    }

    // Update cursor style
    this.canvas.style.cursor = enabled ? 'crosshair' : 'default';

    console.log(`Lasso mode: ${enabled ? 'ENABLED' : 'DISABLED'}`);
  }

  /**
   * Check if lasso mode is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Check if currently drawing a contour
   */
  isCurrentlyDrawing(): boolean {
    return this.isDrawing;
  }

  /**
   * Set callbacks for drawing events
   */
  setCallbacks(callbacks: {
    onDrawStart?: () => void;
    onDrawEnd?: () => void;
    onPointsUpdate?: (points: vec2[]) => void;
  }): void {
    this.onDrawStart = callbacks.onDrawStart;
    this.onDrawEnd = callbacks.onDrawEnd;
    this.onPointsUpdate = callbacks.onPointsUpdate;
  }

  /**
   * Get current drawing points (for rendering)
   */
  getCurrentPoints(): ReadonlyArray<vec2> {
    return this.rawPoints;
  }

  private setupEventListeners(): void {
    this.canvas.addEventListener('mousedown', this.handleMouseDown);
    this.canvas.addEventListener('mousemove', this.handleMouseMove);
    this.canvas.addEventListener('mouseup', this.handleMouseUp);

    // Prevent context menu during lasso drawing
    this.canvas.addEventListener('contextmenu', (e) => {
      if (this.isDrawing) {
        e.preventDefault();
      }
    });
  }

  private handleMouseDown = (e: MouseEvent): void => {
    if (!this.enabled) return;
    if (e.button !== 0) return; // Only left click

    e.preventDefault();
    this.startDrawing(e.clientX, e.clientY);
  };

  private handleMouseMove = (e: MouseEvent): void => {
    if (!this.isDrawing) return;

    e.preventDefault();
    this.addPoint(e.clientX, e.clientY);
  };

  private handleMouseUp = (e: MouseEvent): void => {
    if (!this.isDrawing) return;
    if (e.button !== 0) return;

    e.preventDefault();
    this.finishDrawing();
  };

  private startDrawing(clientX: number, clientY: number): void {
    this.isDrawing = true;
    this.rawPoints = [];

    // Add first point
    const ndcPoint = this.clientToNDC(clientX, clientY);
    this.rawPoints.push(ndcPoint);

    console.log('Started drawing lasso contour');

    // Notify that drawing started (this will lock camera)
    this.onDrawStart?.();
    this.onPointsUpdate?.(this.rawPoints);
  }

  private addPoint(clientX: number, clientY: number): void {
    const ndcPoint = this.clientToNDC(clientX, clientY);

    // Only add if sufficiently far from last point (avoid duplicate points)
    if (this.rawPoints.length > 0) {
      const lastPoint = this.rawPoints[this.rawPoints.length - 1];
      const dx = ndcPoint[0] - lastPoint[0];
      const dy = ndcPoint[1] - lastPoint[1];
      const distSq = dx * dx + dy * dy;

      // Threshold: 0.005 in NDC space (~2-3 pixels on 1080p)
      if (distSq < 0.005 * 0.005) {
        return;
      }
    }

    this.rawPoints.push(ndcPoint);

    // Notify for real-time rendering
    this.onPointsUpdate?.(this.rawPoints);
  }

  private finishDrawing(): void {
    const rawPointCount = this.rawPoints.length;

    // Close the contour (connect last to first)
    if (this.rawPoints.length > 0) {
      const firstPoint = this.rawPoints[0];
      this.rawPoints.push(vec2.clone(firstPoint));
    }

    console.log(`Finishing lasso contour: ${rawPointCount} raw points`);

    // Simplify the contour
    const simplifiedPoints = simplifyContour(this.rawPoints, 0.01); // 1% NDC tolerance

    console.log(`Simplified to ${simplifiedPoints.length} points`);

    // Discard if too small (< 3 points after simplification)
    if (simplifiedPoints.length < 3) {
      console.warn('Lasso contour too small after simplification, discarding');
      this.isDrawing = false;
      this.rawPoints = [];
      this.onPointsUpdate?.([]);
      this.onDrawEnd?.();
      return;
    }

    // Ensure max 512 points
    const finalPoints = simplifiedPoints.slice(0, 512);

    if (finalPoints.length < simplifiedPoints.length) {
      console.warn(`Clamped contour to 512 points (was ${simplifiedPoints.length})`);
    }

    // Create contour with camera info
    const contour = this.createContour(finalPoints);

    // Add to manager
    this.lassoManager.addContour(contour);

    // Clear drawing state
    this.isDrawing = false;
    this.rawPoints = [];

    // Notify that drawing ended (this will unlock camera)
    this.onPointsUpdate?.([]);
    this.onDrawEnd?.();

    console.log(`✓ Lasso contour completed: ${finalPoints.length} points (from ${rawPointCount} raw)`);
  }

  private cancelDrawing(): void {
    console.log('Cancelled lasso drawing');
    this.isDrawing = false;
    this.rawPoints = [];
    this.onPointsUpdate?.([]);
    this.onDrawEnd?.();
  }

  private createContour(points: vec2[]): LassoContour {
    // Capture current camera state
    const cameraPosition = vec3.clone(this.camera.position);
    const cameraViewMatrix = mat4.clone(this.camera.viewMatrix);
    const cameraProjectionMatrix = mat4.clone(this.camera.projectionMatrix);

    // Compute plane normal (camera forward direction)
    // Camera forward is -Z in view space, which is third row of inverse view matrix
    const viewInverse = mat4.invert(cameraViewMatrix);
    const planeNormal = vec3.normalize([
      -viewInverse[8],
      -viewInverse[9],
      -viewInverse[10]
    ]);

    // Compute centroid
    let centroidX = 0;
    let centroidY = 0;
    for (const point of points) {
      centroidX += point[0];
      centroidY += point[1];
    }
    centroidX /= points.length;
    centroidY /= points.length;
    const centroid = vec2.create(centroidX, centroidY);

    console.log(`Contour camera: pos=${cameraPosition}, normal=${planeNormal}, centroid=${centroid}`);

    return {
      points,
      cameraPosition,
      cameraViewMatrix,
      cameraProjectionMatrix,
      planeNormal,
      centroid,
      timestamp: Date.now()
    };
  }

  private clientToNDC(clientX: number, clientY: number): vec2 {
    const rect = this.canvas.getBoundingClientRect();

    // Convert to canvas-relative coordinates
    const canvasX = clientX - rect.left;
    const canvasY = clientY - rect.top;

    // Convert to NDC [-1, 1]
    const ndcX = (canvasX / rect.width) * 2 - 1;
    const ndcY = -((canvasY / rect.height) * 2 - 1); // Flip Y (canvas Y is top-down)

    return vec2.create(ndcX, ndcY);
  }

  /**
   * Cleanup event listeners
   */
  destroy(): void {
    this.canvas.removeEventListener('mousedown', this.handleMouseDown);
    this.canvas.removeEventListener('mousemove', this.handleMouseMove);
    this.canvas.removeEventListener('mouseup', this.handleMouseUp);
  }
}
