// Unshaded Color Shader
// Simple shader for rendering solid-color meshes without lighting

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
    color: vec4<f32>,
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
fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
    // Simply output the uniform color
    return uniforms.color;
}
