import { vec2, vec3, mat4 } from 'gl-matrix';

/**
 * Represents a single lasso contour with associated camera state
 */
export type LassoContour = {
  // Simplified 2D points in NDC space [-1, 1]
  points: vec2[];

  // Camera state when drawn (for 3D projection)
  cameraPosition: vec3;
  cameraViewMatrix: mat4;
  cameraProjectionMatrix: mat4;

  // Derived plane normal (camera forward direction)
  planeNormal: vec3;

  // Centroid of contour in NDC space
  centroid: vec2;

  // Timestamp for ordering
  timestamp: number;
};

/**
 * Manages the stack of lasso contours with undo/redo support
 */
export class LassoManager {
  private contours: LassoContour[] = [];
  private redoStack: LassoContour[] = [];
  private _isDirty: boolean = false;

  constructor(private maxContours: number = 64) {}

  /**
   * Add a new contour to the stack
   */
  addContour(contour: LassoContour): void {
    // Enforce max contours
    if (this.contours.length >= this.maxContours) {
      console.warn(`Max contours (${this.maxContours}) reached. Removing oldest.`);
      this.contours.shift();
    }

    this.contours.push(contour);
    this.redoStack = []; // Clear redo stack on new action
    this._isDirty = true;

    console.log(`Contour added. Total: ${this.contours.length}`);
  }

  /**
   * Undo last contour (move to redo stack)
   */
  undo(): void {
    if (this.contours.length === 0) return;

    const contour = this.contours.pop()!;
    this.redoStack.push(contour);
    this._isDirty = true;

    console.log(`Undo. Remaining: ${this.contours.length}`);
  }

  /**
   * Redo last undone contour
   */
  redo(): void {
    if (this.redoStack.length === 0) return;

    const contour = this.redoStack.pop()!;
    this.contours.push(contour);
    this._isDirty = true;

    console.log(`Redo. Total: ${this.contours.length}`);
  }

  /**
   * Clear all contours
   */
  clear(): void {
    this.contours = [];
    this.redoStack = [];
    this._isDirty = true;

    console.log('All contours cleared');
  }

  /**
   * Get all active contours (read-only)
   */
  getActiveContours(): ReadonlyArray<LassoContour> {
    return this.contours;
  }

  /**
   * Get number of active contours
   */
  getContourCount(): number {
    return this.contours.length;
  }

  /**
   * Check if undo is available
   */
  canUndo(): boolean {
    return this.contours.length > 0;
  }

  /**
   * Check if redo is available
   */
  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /**
   * Check if contours have changed since last mark
   */
  isDirty(): boolean {
    return this._isDirty;
  }

  /**
   * Mark contours as clean (used after recomputing mask)
   */
  markClean(): void {
    this._isDirty = false;
  }
}
