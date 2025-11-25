// Vertex input structure
struct VertexInput {
    @location(0) position: vec3<f32>,
    @location(1) normal: vec3<f32>,
    @location(2) uv: vec2<f32>,
}

// Vertex output structure (to fragment shader)
struct VertexOutput {
    @builtin(position) clip_position: vec4<f32>,
    @location(0) world_position: vec3<f32>,
    @location(1) world_normal: vec3<f32>,
    @location(2) uv: vec2<f32>,
    @location(3) @interpolate(flat) instance_id: u32,
}

struct PhongAttributes {
    diffuse: vec4<f32>,
    specular: vec4<f32>,
    ambient: vec3<f32>,
    shininess: f32
}

struct CameraUniforms {
    view_projection: mat4x4<f32>,
    position: vec3<f32>,
    _padding: f32, // for 16-byte alignment
}

// Bind groups
@group(0) @binding(0) var<uniform> camera: CameraUniforms;
@group(1) @binding(0) var<storage, read> model_matrices: array<mat4x4<f32>>;
@group(1) @binding(1) var<storage, read> phong_attrs:array<PhongAttributes>; 

// Texture bind group
@group(2) @binding(0) var texture_sampler: sampler;
@group(2) @binding(1) var diffuse_texture: texture_2d<f32>;
@group(2) @binding(2) var specular_texture: texture_2d<f32>;
@group(2) @binding(3) var shininess_texture: texture_2d<f32>;
@vertex
fn vs_main(input: VertexInput, @builtin(instance_index) instance_id: u32) -> VertexOutput {
    var output: VertexOutput;
    let model_matrix = model_matrices[instance_id];
    let world_position = model_matrix * vec4<f32>(input.position, 1.0);
    
    output.clip_position = camera.view_projection * world_position;
    output.world_position = world_position.xyz;
    output.world_normal = normalize((model_matrix * vec4<f32>(input.normal, 0.0)).xyz);
    output.uv = input.uv;
    output.instance_id = instance_id;

    return output;
}

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
    // Get material properties for this instance
    let material = phong_attrs[input.instance_id];
    
    // Sample textures
    let diffuse_sample = textureSample(diffuse_texture, texture_sampler, input.uv);
    let specular_sample = textureSample(specular_texture, texture_sampler, input.uv);
    let shininess_sample = textureSample(shininess_texture, texture_sampler, input.uv);
    // Combine texture with material colors
    // The texture modulates the material color
    let diffuse_color = material.diffuse.xyz * diffuse_sample.xyz;
    let specular_color = material.specular.xyz * specular_sample.xyz;
    
    // Hardcoded light properties
    let light_position = vec3<f32>(10.0, 10.0, 10.0);
    let light_color = vec3<f32>(1.0, 1.0, 1.0);
    let light_intensity = 1.0;
    
    // Normalize the interpolated normal
    let N = normalize(input.world_normal);
    
    // Calculate light direction
    let L = normalize(light_position - input.world_position);
    
    // Calculate view direction
    let V = normalize(camera.position - input.world_position);
    
    // Calculate half vector for Blinn-Phong
    let H = normalize(L + V);
    
    // Ambient component (not affected by texture)
    let ambient = material.ambient.xyz * diffuse_color;
    
    // Diffuse component
    let NdotL = max(dot(N, L), 0.0);
    let diffuse = diffuse_color * light_color * NdotL * light_intensity;
    
    // Specular component (Blinn-Phong)
    let NdotH = max(dot(N, H), 0.0);
    let specular_strength = pow(NdotH, material.shininess * shininess_sample.r);
    let specular = specular_color * light_color * specular_strength * light_intensity;
    
    // Combine all components
    let final_color = ambient + diffuse + specular;
    
    // Use alpha from diffuse texture combined with material alpha
    let final_alpha = diffuse_sample.a * material.diffuse.w;
    
    return vec4<f32>(final_color, final_alpha);
}