// BARYCENTRIC WIREFRAME RENDERING
// =================================
//
// PURPOSE:
// This shader renders wireframes from triangle meshes without requiring edge indices.
// It works with standard indexed triangle meshes exported from tools like Blender.
//
// THE PROBLEM:
// Traditional wireframe rendering requires edge indices (pairs of vertices), but our
// meshes only have triangle indices. We don't want to modify the mesh data.
//
// THE SOLUTION - BARYCENTRIC COORDINATES:
// Barycentric coordinates (u, v, w) describe any point within a triangle as a weighted
// combination of its three vertices. Key properties:
// - At vertex 0: barycentric = (1, 0, 0)
// - At vertex 1: barycentric = (0, 1, 0)
// - At vertex 2: barycentric = (0, 0, 1)
// - Along an edge: one component is 0, the other two sum to 1
// - Inside the triangle: all components are positive and sum to 1
//
// TECHNIQUE:
// 1. In the vertex shader, assign barycentric coordinates based on vertex_index % 3
//    - First vertex of each triangle gets (1,0,0)
//    - Second vertex gets (0,1,0)
//    - Third vertex gets (0,0,1)
// 2. GPU automatically interpolates these coordinates across the triangle
// 3. In the fragment shader, calculate min(u,v,w) = distance to nearest edge
// 4. Discard fragments where this distance exceeds our wireframe thickness
//
// PITFALLS AND LIMITATIONS:
// - Line thickness is in barycentric space, not screen space
//   This means perceived thickness varies with triangle size and viewing angle
// - No anti-aliasing: edges will be aliased/jagged
// - Can't easily adjust line width without recompiling shader
// - Requires vertex_index builtin, which increments for each vertex in the draw call
//   This works perfectly with indexed drawing where GPU repeats vertices per triangle

struct Uniforms {
    viewProjection: mat4x4<f32>,  // Combined view-projection matrix
    model: mat4x4<f32>,           // Model matrix for this object
    color: vec4<f32>,             // Wireframe color (RGBA)
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;

struct VertexInput {
    @location(0) position: vec3<f32>,
    @builtin(vertex_index) vertexIndex: u32,  // GPU provides this automatically
}

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) barycentric: vec3<f32>,  // Interpolated to fragments
}

@vertex
fn vs_main(input: VertexInput) -> VertexOutput {
    var output: VertexOutput;

    // Standard MVP transformation
    let modelPos = uniforms.model * vec4<f32>(input.position, 1.0);
    output.position = uniforms.viewProjection * modelPos;

    // Assign barycentric coordinates based on position within current triangle
    // With indexed drawing, vertex_index counts up for each vertex processed
    // Every 3 vertices form a triangle, so modulo 3 tells us which vertex we are
    //
    // REASONING:
    // Triangle 0: vertices 0,1,2 -> idx = 0,1,2 -> (1,0,0), (0,1,0), (0,0,1)
    // Triangle 1: vertices 3,4,5 -> idx = 3,4,5 % 3 = 0,1,2 -> same pattern repeats
    //
    // This works because indexed drawing processes triangles sequentially
    let idx = input.vertexIndex % 3u;
    if (idx == 0u) {
        output.barycentric = vec3<f32>(1.0, 0.0, 0.0);
    } else if (idx == 1u) {
        output.barycentric = vec3<f32>(0.0, 1.0, 0.0);
    } else {
        output.barycentric = vec3<f32>(0.0, 0.0, 1.0);
    }

    return output;
}

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
    // Calculate distance to nearest edge
    // The GPU has linearly interpolated our barycentric coordinates across the triangle
    // The minimum component tells us the distance to the nearest edge in barycentric space
    let edge_dist = min(min(input.barycentric.x, input.barycentric.y), input.barycentric.z);

    // Define wireframe line thickness
    // TUNING: Using thicker lines (0.1) to ensure visibility
    // Barycentric values range from 0 (at edge) to ~0.33 (at center of triangle)
    // A threshold of 0.1 means we keep pixels where min component < 0.1
    let thickness = 0.1;

    // Discard fragments that are too far from any edge
    // This creates the wireframe effect by only rendering near edges
    if (edge_dist > thickness) {
        discard;
    }

    // Render the wireframe line with the specified color
    return uniforms.color;
}
