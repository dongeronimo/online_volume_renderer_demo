import { mat4, vec3 } from "gl-matrix";

/**
 * Face widget descriptor
 */
export interface FaceWidget {
    meshName: string;
    modelMatrix: mat4;
}

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

    // Face widget configuration
    private _widgetMeshName: string = "cube";  // Mesh to use for all widgets
    private _widgetScale: number = 0.05;        // Scale factor for widgets
    private _widgetsNeedUpdate: boolean = true;
    private _faceWidgets: FaceWidget[] = [];

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
        this._widgetsNeedUpdate = true;
    }

    set xmax(value: number) {
        this._xmax = value;
        this._isDirty = true;
        this._widgetsNeedUpdate = true;
    }

    set ymin(value: number) {
        this._ymin = value;
        this._isDirty = true;
        this._widgetsNeedUpdate = true;
    }

    set ymax(value: number) {
        this._ymax = value;
        this._isDirty = true;
        this._widgetsNeedUpdate = true;
    }

    set zmin(value: number) {
        this._zmin = value;
        this._isDirty = true;
        this._widgetsNeedUpdate = true;
    }

    set zmax(value: number) {
        this._zmax = value;
        this._isDirty = true;
        this._widgetsNeedUpdate = true;
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
        this._widgetsNeedUpdate = true;
    }

    /**
     * Set the mesh name to use for face widgets
     */
    public setWidgetMesh(meshName: string): void {
        this._widgetMeshName = meshName;
        this._widgetsNeedUpdate = true;
    }

    /**
     * Set the scale factor for face widgets
     */
    public setWidgetScale(scale: number): void {
        this._widgetScale = scale;
        this._widgetsNeedUpdate = true;
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

    /**
     * Calculate model matrices for the 6 face widgets
     * Returns array of 6 FaceWidgets in order: +X, -X, +Y, -Y, +Z, -Z
     */
    private updateFaceWidgets(): void {
        if (!this._widgetsNeedUpdate) {
            return;
        }

        const centerX = (this._xmin + this._xmax) / 2.0;
        const centerY = (this._ymin + this._ymax) / 2.0;
        const centerZ = (this._zmin + this._zmax) / 2.0;

        this._faceWidgets = [
            // +X face (right)
            {
                meshName: this._widgetMeshName,
                modelMatrix: this.createWidgetMatrix(this._xmax, centerY, centerZ)
            },
            // -X face (left)
            {
                meshName: this._widgetMeshName,
                modelMatrix: this.createWidgetMatrix(this._xmin, centerY, centerZ)
            },
            // +Y face (top)
            {
                meshName: this._widgetMeshName,
                modelMatrix: this.createWidgetMatrix(centerX, this._ymax, centerZ)
            },
            // -Y face (bottom)
            {
                meshName: this._widgetMeshName,
                modelMatrix: this.createWidgetMatrix(centerX, this._ymin, centerZ)
            },
            // +Z face (front)
            {
                meshName: this._widgetMeshName,
                modelMatrix: this.createWidgetMatrix(centerX, centerY, this._zmax)
            },
            // -Z face (back)
            {
                meshName: this._widgetMeshName,
                modelMatrix: this.createWidgetMatrix(centerX, centerY, this._zmin)
            }
        ];

        this._widgetsNeedUpdate = false;
    }

    /**
     * Create a model matrix for a widget at the given position
     */
    private createWidgetMatrix(x: number, y: number, z: number): mat4 {
        const matrix = mat4.create();
        mat4.translate(matrix, matrix, vec3.fromValues(x, y, z));
        mat4.scale(matrix, matrix, vec3.fromValues(this._widgetScale, this._widgetScale, this._widgetScale));
        return matrix;
    }

    /**
     * Get face widgets with their calculated model matrices
     * Returns array of 6 FaceWidgets in order: +X, -X, +Y, -Y, +Z, -Z
     */
    public getFaceWidgets(): FaceWidget[] {
        this.updateFaceWidgets();
        return this._faceWidgets;
    }

    /**
     * Get the mesh name used for face widgets
     */
    public getWidgetMeshName(): string {
        return this._widgetMeshName;
    }
}
