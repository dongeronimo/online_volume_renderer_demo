@group(0) @binding(0) var inputVolume: texture_2d_array<f32>;
@group(0) @binding(1) var outputVolume: texture_storage_2d_array<r32float, write>;
@group(0) @binding(2) var<uniform> params: PeronaMalikParams;

struct PeronaMalikParams {
  width: u32,
  height: u32,
  numSlices: u32,
  padding0: u32,        // Align to 16 bytes
  K: f32,               // Edge threshold
  lambda: f32,          // Time step
  diffusionType: u32,   // 1 or 2
  padding1: u32,        // Align to 16 bytes
}

// Diffusion coefficient type 1 (exponential)
// Favors high-contrast edges
fn diffusionCoeff1(gradientMag: f32, K: f32) -> f32 {
  let ratio = gradientMag / K;
  return exp(-(ratio * ratio));
}

// Diffusion coefficient type 2 (rational)
// Favors wide regions
fn diffusionCoeff2(gradientMag: f32, K: f32) -> f32 {
  let ratio = gradientMag / K;
  return 1.0 / (1.0 + ratio * ratio);
}

// Sample volume with bounds checking
fn sampleVolume(pos: vec3<i32>) -> f32 {
  let clamped = clamp(
    pos,
    vec3<i32>(0, 0, 0),
    vec3<i32>(
      i32(params.width - 1u),
      i32(params.height - 1u),
      i32(params.numSlices - 1u)
    )
  );
  return textureLoad(inputVolume, clamped.xy, clamped.z,0).r;
}

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
  // Bounds check
  if (global_id.x >= params.width || 
      global_id.y >= params.height || 
      global_id.z >= params.numSlices) {
    return;
  }
  
  let pos = vec3<i32>(global_id);
  let center = sampleVolume(pos);
  
  // Sample 6-connected neighbors (N, S, E, W, Up, Down)
  let north = sampleVolume(pos + vec3<i32>(0, -1, 0));
  let south = sampleVolume(pos + vec3<i32>(0, 1, 0));
  let east = sampleVolume(pos + vec3<i32>(1, 0, 0));
  let west = sampleVolume(pos + vec3<i32>(-1, 0, 0));
  let up = sampleVolume(pos + vec3<i32>(0, 0, 1));
  let down = sampleVolume(pos + vec3<i32>(0, 0, -1));
  
  // Compute gradients at interfaces
  let gradN = abs(north - center);
  let gradS = abs(south - center);
  let gradE = abs(east - center);
  let gradW = abs(west - center);
  let gradU = abs(up - center);
  let gradD = abs(down - center);
  
  // Compute diffusion coefficients
  var cN: f32;
  var cS: f32;
  var cE: f32;
  var cW: f32;
  var cU: f32;
  var cD: f32;
  
  if (params.diffusionType == 1u) {
    cN = diffusionCoeff1(gradN, params.K);
    cS = diffusionCoeff1(gradS, params.K);
    cE = diffusionCoeff1(gradE, params.K);
    cW = diffusionCoeff1(gradW, params.K);
    cU = diffusionCoeff1(gradU, params.K);
    cD = diffusionCoeff1(gradD, params.K);
  } else {
    cN = diffusionCoeff2(gradN, params.K);
    cS = diffusionCoeff2(gradS, params.K);
    cE = diffusionCoeff2(gradE, params.K);
    cW = diffusionCoeff2(gradW, params.K);
    cU = diffusionCoeff2(gradU, params.K);
    cD = diffusionCoeff2(gradD, params.K);
  }
  
  // Compute divergence of diffusion flux
  let divergence = 
    cN * (north - center) +
    cS * (south - center) +
    cE * (east - center) +
    cW * (west - center) +
    cU * (up - center) +
    cD * (down - center);
  
  // Update equation: I(t+1) = I(t) + lambda * divergence
  let newValue = center + params.lambda * divergence;
  
  textureStore(outputVolume, vec2<i32>(global_id.xy), i32(global_id.z), vec4<f32>(newValue, 0.0, 0.0, 0.0));
}