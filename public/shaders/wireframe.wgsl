// LINE-BASED WIREFRAME RENDERING
// ================================
//
// PURPOSE:
// This shader renders wireframes using line-list topology with edge indices.
// Edge indices are pre-computed from triangle meshes at load time and stored
// in the StaticMesh class.
//
// APPROACH:
// - Mesh loading extracts unique edges from triangle indices
// - Edges stored as pairs: [v0, v1, v2, v3, ...] for line-list rendering
// - This shader is a simple pass-through that transforms vertices and outputs color
//
// ADVANTAGES OVER BARYCENTRIC APPROACH:
// - Works correctly in WebGPU (vertex_index doesn't work as expected with indexed drawing)
// - Simple and predictable
// - Line width can be controlled via pipeline rasterization state (future enhancement)
// - No fragment discard needed, better performance
//
// LIMITATIONS:
// - Requires additional GPU memory for edge index buffer
// - Edge extraction happens at mesh load time (small CPU cost)

struct Uniforms {
    viewProjection: mat4x4<f32>,  // Combined view-projection matrix
    model: mat4x4<f32>,           // Model matrix for this object
    color: vec4<f32>,             // Wireframe line color (RGBA)
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;

struct VertexInput {
    @location(0) position: vec3<f32>,
}

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
}

@vertex
fn vs_main(input: VertexInput) -> VertexOutput {
    var output: VertexOutput;

    // Standard MVP transformation
    let modelPos = uniforms.model * vec4<f32>(input.position, 1.0);
    output.position = uniforms.viewProjection * modelPos;

    return output;
}

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
    // Simply return the wireframe color
    // No edge detection needed - topology is line-list
    return uniforms.color;
}
