// Compute shader to calculate gradients for volume data

@group(0) @binding(0) var volumeTexture: texture_2d_array<f32>;
@group(0) @binding(1) var gradientTexture: texture_storage_2d_array<rgba16float, write>;

struct Params {
    width: u32,
    height: u32,
    numSlices: u32,
    stepSize: f32,  // 1.0 / dimension for central differences
}

@group(0) @binding(2) var<uniform> params: Params;

// Sample volume with bounds checking
fn sampleVolume(x: i32, y: i32, z: i32) -> f32 {
    let maxX = i32(params.width) - 1;
    let maxY = i32(params.height) - 1;
    let maxZ = i32(params.numSlices) - 1;
    
    let cx = clamp(x, 0, maxX);
    let cy = clamp(y, 0, maxY);
    let cz = clamp(z, 0, maxZ);
    
    return textureLoad(volumeTexture, vec2<i32>(cx, cy), cz, 0).r;
}

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
    // Check bounds
    if (id.x >= params.width || id.y >= params.height || id.z >= params.numSlices) {
        return;
    }
    
    let x = i32(id.x);
    let y = i32(id.y);
    let z = i32(id.z);
    
    // Central differences for gradient
    let dx = sampleVolume(x + 1, y, z) - sampleVolume(x - 1, y, z);
    let dy = sampleVolume(x, y + 1, z) - sampleVolume(x, y - 1, z);
    let dz = sampleVolume(x, y, z + 1) - sampleVolume(x, y, z - 1);
    
    let gradient = vec3<f32>(dx, dy, dz);
    let length = length(gradient);
    
    // Normalize if non-zero, otherwise store zero gradient
    let normalized = select(vec3<f32>(0.0), gradient / length, length > 0.0001);
    
    textureStore(gradientTexture, vec2<i32>(x, y), z, vec4<f32>(normalized, length));
}