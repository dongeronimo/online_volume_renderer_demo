// Volume Raycasting Shader with Color Transfer Function
// WITH HYBRID GRADIENTS: HU direction + opacity threshold

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
  _padding2: f32,
  _padding3: f32,
  _padding4: f32,
  _padding5: f32,
  voxelSpacing: vec3<f32>,
  _padding6: f32,
  toggleGradient: u32,
  volumeWidth: u32,
  volumeHeight: u32,
  volumeDepth: u32,
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
@group(0) @binding(4) var ctfTexture: texture_1d<f32>;
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
  
  output.worldPosition = input.position;
  output.rayDirection = vec3<f32>(0.0);
  
  return output;
}

// ============================================================================
// Fragment Shader Helpers
// ============================================================================

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

fn sampleGradient(uvw: vec3<f32>) -> vec3<f32> {
  let coords = clamp(uvw, vec3<f32>(0.0), vec3<f32>(1.0));
  let z = coords.z * (uniforms.numSlices - 1.0);
  let z0 = floor(z);
  let z1 = min(z0 + 1.0, uniforms.numSlices - 1.0);
  let zFrac = z - z0;
  
  let grad0 = textureSampleLevel(gradientTexture, volumeSampler, coords.xy, i32(z0), 0.0);
  let grad1 = textureSampleLevel(gradientTexture, volumeSampler, coords.xy, i32(z1), 0.0);
  
  return mix(grad0.rgb, grad1.rgb, zFrac);
}

fn evaluateCTF(density: f32) -> vec4<f32> {
  let minHU = -1024.0;
  let maxHU = 3071.0;
  let normalized = clamp((density - minHU) / (maxHU - minHU), 0.0, 1.0);
  let texelIndex = i32(normalized * 255.0);
  
  return textureLoad(ctfTexture, texelIndex, 0);
}

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
  
  let jitter = fract(sin(dot(input.clipPosition.xy, vec2<f32>(12.9898, 78.233))) * 43758.5453) * uniforms.stepSize;
  
  var accumulatedColor = vec3<f32>(0.0);
  var accumulatedAlpha = 0.0;
  
  var t = tNear + jitter;
  let maxSteps = 4096;
  var stepCount = 0;
  
  let viewDir = -rayDir;
  
  // Raymarching loop
  while (t < tFar && stepCount < maxSteps) {
    let scaledPos = scaledRayOrigin + rayDir * t;
    let pos = scaledPos * uniforms.voxelSpacing * 0.5 + vec3<f32>(0.5);  // Convert from [-1,1] to texture space [0,1]

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

    // Skip masked voxels (inside lasso contour)
    if (maskValue == 0u) {
      t += uniforms.stepSize;
      stepCount++;
      continue;
    }

    let density = sampleVolumeFast(pos);
    let ctfColor = evaluateCTF(density);
    let sampleAlpha = ctfColor.a;
    
    if (sampleAlpha > 0.001) {
      // Step-size normalized accumulation
      let referenceStepSize = 0.006;
      let alpha = sampleAlpha * (uniforms.stepSize / referenceStepSize);
      let clampedAlpha = min(alpha, 1.0);
      
      // HYBRID GRADIENT LIGHTING
      // Strategy: Use HU gradient for direction, check opacity change for threshold
      var lighting = 1.0;
      
      if (uniforms.toggleGradient != 0u) {
        // Get pre-computed HU gradient (RGB = direction, A = magnitude)
        let huGradient = sampleGradient(pos);
        let huGradMagnitude = length(huGradient);
        
        if (huGradMagnitude > 0.01) {
          // Density boundary exists - check if it's visually significant
          
          // Sample ONE neighbor along gradient direction
          let neighborOffset = normalize(huGradient) * uniforms.stepSize * 2.0;
          let neighborPos = clamp(pos + neighborOffset, vec3<f32>(0.0), vec3<f32>(1.0));
          let neighborDensity = sampleVolumeFast(neighborPos);
          let neighborAlpha = evaluateCTF(neighborDensity).a;
          
          // Compute opacity change
          let alphaChange = abs(neighborAlpha - sampleAlpha);
          
          // Apply lighting only if opacity changes significantly
          // Tuning guide:
          // - 0.05: Aggressive (shades more, might get vessel artifacts)
          // - 0.15: Moderate (good balance - shades bones, smooth vessels)
          // - 0.30: Conservative (only very sharp boundaries)
          if (alphaChange > 0.15) {
            // Visual boundary detected - apply Phong lighting
            let normal = normalize(huGradient);
            let lightDir = normalize(viewDir);
            
            let ambient = 0.3;
            let diffuse = max(dot(normal, lightDir), 0.0) * 0.6;
            let halfDir = normalize(lightDir + viewDir);
            let specular = pow(max(dot(normal, halfDir), 0.0), 32.0) * 0.3;
            
            lighting = ambient + diffuse + specular;
          }
        }
      }
      
      let weight = clampedAlpha * (1.0 - accumulatedAlpha);
      
      accumulatedColor += ctfColor.rgb * lighting * weight;
      accumulatedAlpha += weight;
      
      if (accumulatedAlpha >= 0.95) {
        break;
      }
    }
    
    t += uniforms.stepSize;
    stepCount++;
  }
  // Add very subtle ambient occlusion / background gradient to try to hide the f16 numerical errors
  if (accumulatedAlpha < 0.1) {
    // Very transparent - add slight gray to mask black dots
    let ambientGray = vec3<f32>(0.02);
    accumulatedColor += ambientGray * (0.1 - accumulatedAlpha);
  }
  return vec4<f32>(accumulatedColor, accumulatedAlpha);
}
