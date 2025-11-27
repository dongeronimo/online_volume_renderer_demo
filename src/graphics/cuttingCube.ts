import { mat4, vec3 } from "gl-matrix";

/**
 * Represents a cutting cube with adjustable bounds
 * The cube's position and scale are derived from xmin, xmax, ymin, ymax, zmin, zmax
 * Coordinates are in the range [-1, 1] matching the volume renderer's coordinate system
 */
export class CuttingCube {
    private _xmin: number = -1.0;
    private _xmax: number = 1.0;
    private _ymin: number = -1.0;
    private _ymax: number = 1.0;
    private _zmin: number = -1.0;
    private _zmax: number = 1.0;

    private _modelMatrix: mat4;
    private _isDirty: boolean = true;

    constructor(
        xmin: number = -1.0,
        xmax: number = 1.0,
        ymin: number = -1.0,
        ymax: number = 1.0,
        zmin: number = -1.0,
        zmax: number = 1.0
    ) {
        this._xmin = xmin;
        this._xmax = xmax;
        this._ymin = ymin;
        this._ymax = ymax;
        this._zmin = zmin;
        this._zmax = zmax;
        this._modelMatrix = mat4.create();
        this.updateModelMatrix();
    }

    // Getters
    get xmin(): number { return this._xmin; }
    get xmax(): number { return this._xmax; }
    get ymin(): number { return this._ymin; }
    get ymax(): number { return this._ymax; }
    get zmin(): number { return this._zmin; }
    get zmax(): number { return this._zmax; }

    // Setters (mark as dirty when changed)
    set xmin(value: number) {
        this._xmin = value;
        this._isDirty = true;
    }

    set xmax(value: number) {
        this._xmax = value;
        this._isDirty = true;
    }

    set ymin(value: number) {
        this._ymin = value;
        this._isDirty = true;
    }

    set ymax(value: number) {
        this._ymax = value;
        this._isDirty = true;
    }

    set zmin(value: number) {
        this._zmin = value;
        this._isDirty = true;
    }

    set zmax(value: number) {
        this._zmax = value;
        this._isDirty = true;
    }

    /**
     * Set all bounds at once
     */
    public setBounds(
        xmin: number,
        xmax: number,
        ymin: number,
        ymax: number,
        zmin: number,
        zmax: number
    ): void {
        this._xmin = xmin;
        this._xmax = xmax;
        this._ymin = ymin;
        this._ymax = ymax;
        this._zmin = zmin;
        this._zmax = zmax;
        this._isDirty = true;
    }

    /**
     * Calculate the model matrix based on current bounds
     * The model matrix positions and scales the cube to match the bounds
     */
    private updateModelMatrix(): void {
        if (!this._isDirty) {
            return;
        }

        // Calculate center position
        const centerX = (this._xmin + this._xmax) / 2.0;
        const centerY = (this._ymin + this._ymax) / 2.0;
        const centerZ = (this._zmin + this._zmax) / 2.0;

        // Calculate scale (half-extents since the cube goes from -1 to 1)
        const scaleX = (this._xmax - this._xmin) / 2.0;
        const scaleY = (this._ymax - this._ymin) / 2.0;
        const scaleZ = (this._zmax - this._zmin) / 2.0;

        // Build model matrix: T * S
        mat4.identity(this._modelMatrix);
        mat4.translate(this._modelMatrix, this._modelMatrix, vec3.fromValues(centerX, centerY, centerZ));
        mat4.scale(this._modelMatrix, this._modelMatrix, vec3.fromValues(scaleX, scaleY, scaleZ));

        this._isDirty = false;
    }

    /**
     * Get the model matrix for rendering
     */
    public getModelMatrix(): mat4 {
        this.updateModelMatrix();
        return this._modelMatrix;
    }
}
