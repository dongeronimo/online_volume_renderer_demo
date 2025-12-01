// Volume Raycasting Shader with Bricking Acceleration
// MINIMAL FIX: Only improved jitter - preserves all original behavior

// ============================================================================
// Uniforms
// ============================================================================

struct Uniforms {
  modelMatrix: mat4x4<f32>,
  viewMatrix: mat4x4<f32>,
  projectionMatrix: mat4x4<f32>,
  cameraPosition: vec3<f32>,
  _padding0: f32,
  numSlices: f32,
  stepSize: f32,
  densityScale: f32,
  _padding1: f32,
  inverseModelMatrix: mat4x4<f32>,
  windowCenter: f32,
  windowWidth: f32,
  _padding2: f32,
  _padding3: f32,
  voxelSpacing: vec3<f32>,
  _padding4: f32,
  toggleGradient: u32,
  volumeWidth: u32,
  volumeHeight: u32,
  volumeDepth: u32,
  chunkSize: u32,
  numChunksX: u32,
  numChunksY: u32,
  numChunksZ: u32,
  // NEW PARAMETERS
  ambient: f32,
  densityForMarchSpaceSkipping: f32,
  skipMultiplier: f32,
  subtleSurfaceThreshold: f32,
  surfaceThreshold: f32,
  maxSteps: u32,
  minGradientMagnitude: f32,
  accumulatedThreshold: f32,
  transmittanceThreshold: f32,
  _padding5: f32,
  _padding6: f32,
  _padding7: f32,
  // CUTTING CUBE BOUNDS
  xmin: f32,
  xmax: f32,
  ymin: f32,
  ymax: f32,
  zmin: f32,
  zmax: f32,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var volumeTexture: texture_2d_array<f32>;
@group(0) @binding(2) var volumeSampler: sampler;
@group(0) @binding(3) var gradientTexture: texture_2d_array<f32>;
@group(0) @binding(4) var accelerationTexture: texture_3d<f32>;
@group(0) @binding(5) var lassoMask: texture_3d<u32>;

// ============================================================================
// Vertex Shader
// ============================================================================

struct VertexInput {
  @location(0) position: vec3<f32>,
  @location(1) normal: vec3<f32>,
  @location(2) uv: vec2<f32>,
}

struct VertexOutput {
  @builtin(position) clipPosition: vec4<f32>,
  @location(0) worldPosition: vec3<f32>,
  @location(1) rayDirection: vec3<f32>,
}

@vertex
fn vertexMain(input: VertexInput) -> VertexOutput {
  var output: VertexOutput;
  
  let worldPos = uniforms.modelMatrix * vec4<f32>(input.position, 1.0);
  let viewPos = uniforms.viewMatrix * worldPos;
  output.clipPosition = uniforms.projectionMatrix * viewPos;
  
  output.worldPosition = input.position;  // Cube space for ray calc
  output.rayDirection = vec3<f32>(0.0);
  
  return output;
}

// ============================================================================
// Fragment Shader Helpers
// ============================================================================

// ONLY CHANGE: Better 3D hash function (replaces screen-space jitter)
fn hash3D(p: vec3<f32>) -> f32 {
  var p3 = fract(p * vec3<f32>(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yxz + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

// Cubic interpolation helper (Catmull-Rom)
fn cubicInterpolate(p0: f32, p1: f32, p2: f32, p3: f32, t: f32) -> f32 {
  let a = -0.5 * p0 + 1.5 * p1 - 1.5 * p2 + 0.5 * p3;
  let b = p0 - 2.5 * p1 + 2.0 * p2 - 0.5 * p3;
  let c = -0.5 * p0 + 0.5 * p2;
  let d = p1;
  
  return a * t * t * t + b * t * t + c * t + d;
}

// Fast bilinear sample
fn sampleVolumeFast(uvw: vec3<f32>) -> f32 {
  let coords = clamp(uvw, vec3<f32>(0.0), vec3<f32>(1.0));
  let z = coords.z * (uniforms.numSlices - 1.0);
  let z0 = floor(z);
  let z1 = min(z0 + 1.0, uniforms.numSlices - 1.0);
  let zFrac = z - z0;
  
  let sample0 = textureSampleLevel(volumeTexture, volumeSampler, coords.xy, i32(z0), 0.0);
  let sample1 = textureSampleLevel(volumeTexture, volumeSampler, coords.xy, i32(z1), 0.0);
  
  return mix(sample0.r, sample1.r, zFrac);
}

// Sample gradient with trilinear interpolation (returns vec4 with magnitude in alpha)
fn sampleGradient(uvw: vec3<f32>) -> vec4<f32> {
  let coords = clamp(uvw, vec3<f32>(0.0), vec3<f32>(1.0));
  let z = coords.z * (uniforms.numSlices - 1.0);
  let z0 = floor(z);
  let z1 = min(z0 + 1.0, uniforms.numSlices - 1.0);
  let zFrac = z - z0;
  
  let grad0 = textureSampleLevel(gradientTexture, volumeSampler, coords.xy, i32(z0), 0.0);
  let grad1 = textureSampleLevel(gradientTexture, volumeSampler, coords.xy, i32(z1), 0.0);
  
  return mix(grad0, grad1, zFrac);  // Returns vec4 with gradient.rgb and magnitude in .a
}

// Blinn-Phong lighting
fn computeLighting(gradient: vec3<f32>, viewDir: vec3<f32>) -> f32 {
  let normal = normalize(gradient);
  let lightDir = normalize(viewDir);
  
  let ambient = uniforms.ambient;
  let diffuse = max(dot(normal, lightDir), 0.0) * 0.6;
  let halfDir = normalize(lightDir + viewDir);
  let specular = pow(max(dot(normal, halfDir), 0.0), 32.0) * 0.4;
  
  return ambient + diffuse + specular;
}

// Sample volume with cubic interpolation
fn sampleVolumeCubic(uvw: vec3<f32>) -> f32 {
  let coords = clamp(uvw, vec3<f32>(0.0), vec3<f32>(1.0));
  
  let z = coords.z * (uniforms.numSlices - 1.0);
  let z1 = floor(z);
  let zFrac = z - z1;
  
  let z0 = max(z1 - 1.0, 0.0);
  let z2 = min(z1 + 1.0, uniforms.numSlices - 1.0);
  let z3 = min(z1 + 2.0, uniforms.numSlices - 1.0);
  
  let s0 = textureSampleLevel(volumeTexture, volumeSampler, coords.xy, i32(z0), 0.0).r;
  let s1 = textureSampleLevel(volumeTexture, volumeSampler, coords.xy, i32(z1), 0.0).r;
  let s2 = textureSampleLevel(volumeTexture, volumeSampler, coords.xy, i32(z2), 0.0).r;
  let s3 = textureSampleLevel(volumeTexture, volumeSampler, coords.xy, i32(z3), 0.0).r;
  
  return cubicInterpolate(s0, s1, s2, s3, zFrac);
}

// Apply window/level
fn applyWindowLevel(value: f32, center: f32, width: f32) -> f32 {
  let minValue = center - (width / 2.0);
  let maxValue = center + (width / 2.0);
  
  return clamp((value - minValue) / width, 0.0, 1.0);
}

// Ray-box intersection
fn rayBoxIntersection(rayOrigin: vec3<f32>, rayDir: vec3<f32>) -> vec2<f32> {
  let boxMin = vec3<f32>(-1.0) / uniforms.voxelSpacing;  // Cube is [-1, 1]
  let boxMax = vec3<f32>(1.0) / uniforms.voxelSpacing;   // Cube is [-1, 1]
  
  let invDir = 1.0 / rayDir;
  let t0 = (boxMin - rayOrigin) * invDir;
  let t1 = (boxMax - rayOrigin) * invDir;
  
  let tmin = min(t0, t1);
  let tmax = max(t0, t1);
  
  let tNear = max(max(tmin.x, tmin.y), tmin.z);
  let tFar = min(min(tmax.x, tmax.y), tmax.z);
  
  return vec2<f32>(max(tNear, 0.0), tFar);
}

// ============================================================================
// Bricking Acceleration Functions
// ============================================================================

// Get chunk index from normalized position [0,1]
fn getChunkIndex(pos: vec3<f32>) -> vec3<u32> {
  let chunkFloat = pos * vec3<f32>(
    f32(uniforms.numChunksX),
    f32(uniforms.numChunksY),
    f32(uniforms.numChunksZ)
  );
  
  return vec3<u32>(
    clamp(u32(chunkFloat.x), 0u, uniforms.numChunksX - 1u),
    clamp(u32(chunkFloat.y), 0u, uniforms.numChunksY - 1u),
    clamp(u32(chunkFloat.z), 0u, uniforms.numChunksZ - 1u)
  );
}

// Sample acceleration texture (min/max for chunk)
fn sampleChunkMinMax(chunkIdx: vec3<u32>) -> vec2<f32> {
  // Direct texel fetch (no filtering for unfilterable texture)
  let texelCoord = vec3<i32>(chunkIdx);
  let minmax = textureLoad(accelerationTexture, texelCoord, 0);
  return minmax.rg;
}

// Check if chunk is visible given window/level
fn isChunkVisible(minValue: f32, maxValue: f32, windowCenter: f32, windowWidth: f32) -> bool {
  let windowBottom = windowCenter - windowWidth / 2.0;
  let windowTop = windowCenter + windowWidth / 2.0;
  
  // Chunk is invisible if entirely outside window range
  if (maxValue < windowBottom || minValue > windowTop) {
    return false;
  }
  
  return true;
}

// Calculate distance to next chunk boundary along ray
fn distanceToNextChunk(pos: vec3<f32>, rayDir: vec3<f32>) -> f32 {
  let chunkSize = vec3<f32>(
    1.0 / f32(uniforms.numChunksX),
    1.0 / f32(uniforms.numChunksY),
    1.0 / f32(uniforms.numChunksZ)
  );
  
  let chunkIdx = getChunkIndex(pos);
  let chunkOrigin = vec3<f32>(chunkIdx) * chunkSize;
  
  // Calculate chunk boundaries
  let chunkMin = chunkOrigin;
  let chunkMax = chunkOrigin + chunkSize;
  
  // Find intersection with chunk boundaries
  let invDir = 1.0 / rayDir;
  let t0 = (chunkMin - pos) * invDir;
  let t1 = (chunkMax - pos) * invDir;
  
  let tmin = min(t0, t1);
  let tmax = max(t0, t1);
  
  // Distance to exit this chunk
  let tExit = min(min(tmax.x, tmax.y), tmax.z);
  
  return max(tExit, 0.0001); // Ensure we make progress
}

// ============================================================================
// Fragment Shader
// ============================================================================

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4<f32> {
  let cameraInCubeSpace = (uniforms.inverseModelMatrix * vec4<f32>(uniforms.cameraPosition, 1.0)).xyz;
  let rayOrigin = cameraInCubeSpace;
  
  let scaledRayOrigin = rayOrigin / uniforms.voxelSpacing;
  let scaledCubePosition = input.worldPosition / uniforms.voxelSpacing;
  let rayDir = normalize(scaledCubePosition - scaledRayOrigin);

  let intersection = rayBoxIntersection(scaledRayOrigin, rayDir);
  let tNear = intersection.x;
  let tFar = intersection.y;
  
  if (tNear >= tFar || tFar <= 0.0) {
    discard;
  }
  
  // ONLY CHANGE: Use 3D spatial hash instead of screen-space hash
  // Reduces jitter amount to 25% to minimize artifacts while preserving anti-aliasing
  let entryPoint = scaledRayOrigin + rayDir * tNear;
  let jitter = hash3D(entryPoint * 200.0) * uniforms.stepSize * 0.25;
  
  var accumulated = 0.0;
  var transmittance = 1.0;
  
  var t = tNear + jitter;
  var stepCount = 0u;
  
  let viewDir = -rayDir;
  
  // Raymarching with bricking acceleration (unchanged)
  while (t < tFar && stepCount < uniforms.maxSteps) {
    let scaledPos = scaledRayOrigin + rayDir * t;
    let pos = scaledPos * uniforms.voxelSpacing * 0.5 + vec3<f32>(0.5);  // Convert from [-1,1] to texture space [0,1]

    // Clamp to volume bounds
    if (pos.x < 0.0 || pos.x > 1.0 || pos.y < 0.0 || pos.y > 1.0 || pos.z < 0.0 || pos.z > 1.0) {
      break;
    }

    // Check if position is outside cutting cube bounds (in world space [-1,1])
    let worldPos = scaledPos * uniforms.voxelSpacing;
    if (worldPos.x < uniforms.xmin || worldPos.x > uniforms.xmax ||
        worldPos.y < uniforms.ymin || worldPos.y > uniforms.ymax ||
        worldPos.z < uniforms.zmin || worldPos.z > uniforms.zmax) {
      // Outside cutting cube bounds - skip this sample
      t += uniforms.stepSize;
      stepCount++;
      continue;
    }

    // LASSO: Check if voxel is masked by lasso contours
    let voxelCoord = vec3<u32>(
      u32(pos.x * f32(uniforms.volumeWidth - 1u)),
      u32(pos.y * f32(uniforms.volumeHeight - 1u)),
      u32(pos.z * f32(uniforms.volumeDepth - 1u))
    );
    let maskValue = textureLoad(lassoMask, voxelCoord, 0).r;
    if (maskValue == 0u) {
      // Voxel is masked (inside lasso contour) - skip this sample
      t += uniforms.stepSize;
      stepCount++;
      continue;
    }

    // Get current chunk
    let chunkIdx = getChunkIndex(pos);
    let chunkMinMax = sampleChunkMinMax(chunkIdx);
    let chunkMin = chunkMinMax.r;
    let chunkMax = chunkMinMax.g;
    
    // Check if chunk is visible
    if (!isChunkVisible(chunkMin, chunkMax, uniforms.windowCenter, uniforms.windowWidth)) {
      // Skip to next chunk
      let skipDistance = distanceToNextChunk(pos, rayDir);
      t += skipDistance;
      stepCount++;
      continue;
    }
    
    // Chunk is potentially visible - do normal sampling
    let rawDensity = sampleVolumeFast(pos);
    let windowedDensity = applyWindowLevel(rawDensity, uniforms.windowCenter, uniforms.windowWidth);
    
    var currentStepSize = uniforms.stepSize;
    
    if (windowedDensity < uniforms.densityForMarchSpaceSkipping) {
      currentStepSize = uniforms.stepSize * uniforms.skipMultiplier;
    } else if (windowedDensity < 0.1) {
      currentStepSize = uniforms.stepSize * uniforms.skipMultiplier / 2.0;
      let density = windowedDensity * uniforms.densityScale;
      var lighting = 1.0;
      
      if (uniforms.toggleGradient != 0u) {
        // Per-sample surface check: detect if density is changing (surface nearby)
        let neighborPos = pos + rayDir * uniforms.stepSize * 1.5;
        let neighborDensity = sampleVolumeFast(neighborPos);
        let neighborWindowed = applyWindowLevel(neighborDensity, uniforms.windowCenter, uniforms.windowWidth);
        let densityChange = abs(neighborWindowed - windowedDensity);
        
        // Lower threshold - more sensitive to subtle surfaces
        if (densityChange > uniforms.subtleSurfaceThreshold) {
          let gradientData = sampleGradient(pos);
          let gradientMagnitude = gradientData.a;  // Precomputed magnitude
          if (gradientMagnitude > uniforms.minGradientMagnitude) {
            lighting = computeLighting(gradientData.rgb, viewDir);
          }
        }
      }
      
      let alpha = 1.0 - exp(-density * currentStepSize * 100.0);
      accumulated += transmittance * density * alpha * lighting;
      transmittance *= (1.0 - alpha);
    } else {
      let densityCubic = sampleVolumeCubic(pos);
      let windowedCubic = applyWindowLevel(densityCubic, uniforms.windowCenter, uniforms.windowWidth);
      let density = windowedCubic * uniforms.densityScale;
      var lighting = 1.0;
      
      if (uniforms.toggleGradient != 0u) {
        // Per-sample surface check: detect if density is changing (surface nearby)
        let neighborPos = pos + rayDir * uniforms.stepSize * 1.5;
        let neighborDensity = sampleVolumeFast(neighborPos);
        let neighborWindowed = applyWindowLevel(neighborDensity, uniforms.windowCenter, uniforms.windowWidth);
        let densityChange = abs(neighborWindowed - windowedCubic);
        
        // Only fetch gradient if we're at a surface
        if (densityChange > uniforms.surfaceThreshold) {
          let gradientData = sampleGradient(pos);
          let gradientMagnitude = gradientData.a;  // Precomputed magnitude
          if (gradientMagnitude > uniforms.minGradientMagnitude) {
            lighting = computeLighting(gradientData.rgb, viewDir);
          }
        }
      }
      
      if (windowedCubic > 0.6) {
        currentStepSize = uniforms.stepSize * 0.5;
      } else if (windowedCubic > 0.3) {
        currentStepSize = uniforms.stepSize * 0.75;
      } else {
        currentStepSize = uniforms.stepSize;
      }
      
      let alpha = 1.0 - exp(-density * currentStepSize * 100.0);
      accumulated += transmittance * density * alpha * lighting;
      transmittance *= (1.0 - alpha);
    }
    
    if (accumulated >= uniforms.accumulatedThreshold || transmittance < uniforms.transmittanceThreshold) {
      break;
    }
    
    t += currentStepSize;
    stepCount++;
  }
  
  let color = vec3<f32>(accumulated * 3.0);
  return vec4<f32>(color, 1.0);
}
