// Picking Shader - Outputs object IDs for GPU picking
// Renders to r32uint render target

// Vertex input structure
struct VertexInput {
    @location(0) position: vec3<f32>,
    @location(1) normal: vec3<f32>,
    @location(2) uv: vec2<f32>,
}

// Vertex output structure
struct VertexOutput {
    @builtin(position) clip_position: vec4<f32>,
}

// Uniforms
struct Uniforms {
    viewProjection: mat4x4<f32>,
    model: mat4x4<f32>,
    objectId: u32,           // Object ID to render
    _padding: vec3<u32>,     // Padding for alignment
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;

@vertex
fn vs_main(input: VertexInput) -> VertexOutput {
    var output: VertexOutput;

    // Transform position
    let world_position = uniforms.model * vec4<f32>(input.position, 1.0);
    output.clip_position = uniforms.viewProjection * world_position;

    return output;
}

@fragment
fn fs_main(input: VertexOutput) -> @location(0) u32 {
    // Simply output the object ID
    return uniforms.objectId;
}
