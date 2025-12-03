// Lasso drawing shader
// Renders polyline contours in screen space (NDC coordinates)

struct Uniforms {
  transform: mat4x4<f32>  // Identity for NDC input (reserved for future use)
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;

struct VertexInput {
  @location(0) position: vec2<f32>  // Already in NDC space [-1, 1]
}

struct VertexOutput {
  @builtin(position) position: vec4<f32>
}

@vertex
fn vertexMain(input: VertexInput) -> VertexOutput {
  var output: VertexOutput;

  // Points are already in NDC, just pass through as clip space
  // Z = 0.0 to draw on top of everything
  // W = 1.0 for proper perspective divide
  output.position = vec4<f32>(input.position, 0.0, 1.0);

  return output;
}

@fragment
fn fragmentMain() -> @location(0) vec4<f32> {
  // Red color with full opacity for active lasso drawing
  return vec4<f32>(1.0, 0.0, 0.0, 1.0);
}
