// Cutting Cube Shader
// Renders a translucent cube with each face colored differently based on normal
// Uses flat shading to prevent color bleeding between faces

// Vertex input structure (matches existing mesh format)
struct VertexInput {
    @location(0) position: vec3<f32>,
    @location(1) normal: vec3<f32>,
    @location(2) uv: vec2<f32>,
}

// Vertex output structure
struct VertexOutput {
    @builtin(position) clip_position: vec4<f32>,
    @location(0) @interpolate(flat) face_color: vec4<f32>,
}

// Uniforms
struct CuttingCubeUniforms {
    viewProjection: mat4x4<f32>,
    model: mat4x4<f32>,
}

@group(0) @binding(0) var<uniform> uniforms: CuttingCubeUniforms;

// Function to determine face color based on normal
// Each face gets a distinct color
fn getFaceColor(normal: vec3<f32>) -> vec4<f32> {
    let absNormal = abs(normal);
    let maxComponent = max(max(absNormal.x, absNormal.y), absNormal.z);

    // Determine which axis the normal is aligned with
    // Use a threshold to handle floating point precision
    let threshold = 0.9;

    // +X face (right) - Red
    if (normal.x > threshold) {
        return vec4<f32>(1.0, 0.0, 0.0, 0.3);
    }
    // -X face (left) - Cyan
    if (normal.x < -threshold) {
        return vec4<f32>(0.0, 1.0, 1.0, 0.3);
    }
    // +Y face (top) - Green
    if (normal.y > threshold) {
        return vec4<f32>(0.0, 1.0, 0.0, 0.3);
    }
    // -Y face (bottom) - Magenta
    if (normal.y < -threshold) {
        return vec4<f32>(1.0, 0.0, 1.0, 0.3);
    }
    // +Z face (front) - Blue
    if (normal.z > threshold) {
        return vec4<f32>(0.0, 0.0, 1.0, 0.3);
    }
    // -Z face (back) - Yellow
    if (normal.z < -threshold) {
        return vec4<f32>(1.0, 1.0, 0.0, 0.3);
    }

    // Fallback (should never reach here)
    return vec4<f32>(1.0, 1.0, 1.0, 0.3);
}

@vertex
fn vs_main(input: VertexInput) -> VertexOutput {
    var output: VertexOutput;

    // Transform position
    let world_position = uniforms.model * vec4<f32>(input.position, 1.0);
    output.clip_position = uniforms.viewProjection * world_position;

    // Use flat interpolation for color - assigned based on vertex normal
    // The normal from the mesh already identifies which face this vertex belongs to
    output.face_color = getFaceColor(input.normal);

    return output;
}

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
    // Simply output the face color with transparency
    return input.face_color;
}
