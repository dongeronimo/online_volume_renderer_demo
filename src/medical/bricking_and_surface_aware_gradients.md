# Volume Rendering Optimization: Bricking & Surface-Aware Gradient Sampling

**Author:** GERONIMO
**Date:** October 2025  
**Project:** WebGPU Medical Volume Renderer

---

## TL;DR

I optimized my medical volume renderer from **150ms** per frame down to **8.9ms** - a **16.9x speedup** - by implementing bricking acceleration and surface-aware gradient sampling. The key insight: gradients are expensive, and you don't need them everywhere. But there WILL be a loss of shading quality, that is acceptable it the alternative
is no rendering at all.

---

## The Problem

My volume renderer was slow. Really slow. 150ms per frame meant I was rendering at ~6 FPS, which is unusable for interactive medical imaging. The performance was even worse when I enabled lighting via gradient-based shading - the frame time would balloon to unacceptable levels.

Initial profiling revealed two bottlenecks:
1. **Empty space sampling:** The ray marcher was wasting cycles sampling through air and transparent regions
2. **Gradient texture fetches:** Computing lighting for every visible sample required expensive gradient lookups

I needed a way to skip both empty space AND unnecessary gradient calculations without sacrificing visual quality.

---

## Solution 1: Bricking Acceleration (Empty Space Skipping)

### The Concept

Bricking divides the volume into a uniform 3D grid of "chunks" (bricks). During preprocessing, I compute min/max density values for each chunk. At runtime, before sampling within a chunk, I check:
- Does this chunk's density range intersect with the current window/level?
- If not, skip the entire chunk in one large jump

This is essentially a GPU-friendly BVH (Bounding Volume Hierarchy) where the "BVH" is just a uniform grid stored in a 3D texture.

### Implementation Details

**Preprocessing (Python - `dicom_converter.py`):**
```python
CHUNK_SIZE = 32  # 32×32×32 voxels per chunk

for each chunk in volume:
    chunk_min = np.min(chunk_data)
    chunk_max = np.max(chunk_data)
    chunk_metadata.append([chunk_min, chunk_max])

# Save as binary file: chunk_minmax.bin
```

**GPU Acceleration Structure:**
- 3D texture in `RG32Float` format (min/max per texel)
- For a 512×512×400 volume with 32³ chunks: 16×16×13 = 3,328 texels
- Texture size: ~26KB (negligible memory overhead)

**Shader Integration (WGSL):**
```wgsl
// 1. Convert ray position to chunk index
fn getChunkIndex(pos: vec3<f32>) -> vec3<u32> {
  let chunkFloat = pos * vec3<f32>(numChunksX, numChunksY, numChunksZ);
  return vec3<u32>(clamp(chunkFloat, 0, numChunks - 1));
}

// 2. Fetch chunk min/max from acceleration texture
fn sampleChunkMinMax(chunkIdx: vec3<u32>) -> vec2<f32> {
  let texelCoord = vec3<i32>(chunkIdx);
  let minmax = textureLoad(accelerationTexture, texelCoord, 0);
  return minmax.rg;
}

// 3. Check visibility against window/level
fn isChunkVisible(minValue: f32, maxValue: f32, 
                   windowCenter: f32, windowWidth: f32) -> bool {
  let windowBottom = windowCenter - windowWidth / 2.0;
  let windowTop = windowCenter + windowWidth / 2.0;
  
  // Chunk invisible if entirely outside window range
  return !(maxValue < windowBottom || minValue > windowTop);
}

// 4. Calculate distance to next chunk boundary
fn distanceToNextChunk(pos: vec3<f32>, rayDir: vec3<f32>) -> f32 {
  // Ray-box intersection math to find exit point
  let chunkSize = 1.0 / vec3<f32>(numChunks);
  let chunkIdx = getChunkIndex(pos);
  let chunkMin = vec3<f32>(chunkIdx) * chunkSize;
  let chunkMax = chunkMin + chunkSize;
  
  let invDir = 1.0 / rayDir;
  let t0 = (chunkMin - pos) * invDir;
  let t1 = (chunkMax - pos) * invDir;
  
  let tmax = max(t0, t1);
  let tExit = min(min(tmax.x, tmax.y), tmax.z);
  
  return max(tExit, 0.0001);
}

// 5. Main ray marching loop
while (t < tFar && stepCount < maxSteps) {
  let pos = rayOrigin + rayDir * t;
  
  // Check current chunk
  let chunkIdx = getChunkIndex(pos);
  let chunkMinMax = sampleChunkMinMax(chunkIdx);
  
  if (!isChunkVisible(chunkMinMax.r, chunkMinMax.g, windowCenter, windowWidth)) {
    // SKIP: Jump to next chunk boundary in one step
    t += distanceToNextChunk(pos, rayDir);
    continue;
  }
  
  // Chunk is visible - proceed with normal sampling
  let density = sampleVolume(pos);
  // ... compositing ...
}
```

### Results

**Bricking alone:** 150ms → 60ms (**2.5x speedup**)

Empty chunks (air, regions outside window/level) are now skipped entirely. For medical CT data with lots of air, this is a massive win. The ray can jump 30+ voxels in a single iteration instead of taking 30 tiny steps.

---

## Solution 2: Surface-Aware Gradient Sampling

### The Problem with Gradients

After implementing bricking, I noticed something: **toggling gradients on/off changed frame time from 60ms to 8ms**. Gradients were the remaining bottleneck.

Why? Each gradient lookup requires:
- 2 texture fetches (trilinear interpolation across slices)
- Lighting calculation (Blinn-Phong)

If you're doing this for 200+ samples per ray, that's 400+ texture fetches per ray. Multiply by 1920×1080 pixels = way too many fetches.

### The Insight

**Gradients only matter at surfaces.** In homogeneous regions (inside an organ, inside air, inside bone), there's no density variation, so the gradient is zero or near-zero. Flat lighting is fine there. You only need gradients at boundaries where density changes rapidly.

So the question becomes: can we detect surfaces *before* fetching the expensive gradient texture?

### Implementation: Per-Sample Surface Detection

**Strategy:** Check if density is changing by sampling a neighbor along the ray. If density is stable, skip the gradient fetch.

```wgsl
if (uniforms.toggleGradient != 0u) {
  // Cheap check: sample one neighbor
  let neighborPos = pos + rayDir * stepSize * 1.5;
  let neighborDensity = sampleVolumeFast(neighborPos);
  let neighborWindowed = applyWindowLevel(neighborDensity, windowCenter, windowWidth);
  let densityChange = abs(neighborWindowed - currentDensity);
  
  // Only fetch gradient if at a surface (density changing)
  if (densityChange > 0.02) {  // Threshold: 2% change
    let gradientData = sampleGradient(pos);
    let gradientMagnitude = gradientData.a;  // Precomputed in compute shader
    
    if (gradientMagnitude > 0.01) {
      lighting = computeLighting(gradientData.rgb, viewDir);
    }
  }
  // else: lighting stays at default 1.0 (flat)
}
```

**Cost analysis:**
- **Before:** 2 gradient texture fetches per sample (always)
- **After:** 1 volume sample (cheap) + conditional gradient fetch (only at surfaces)
- **Typical case:** ~70-80% of samples are NOT at surfaces → skip 70-80% of gradient fetches

### Threshold Tuning

The `densityChange > 0.02` threshold is critical:
- **Too high (0.08):** Misses subtle surfaces, looks flat
- **Too low (0.01):** Fetches gradients everywhere, slow
- **Sweet spot (0.02-0.04):** Catches all visible surfaces, skips homogeneous regions

For noisy data (unsmoothed CT), I had to increase to `0.06` to avoid triggering on noise.

### Precomputed Gradient Magnitude

In my gradient computation pass, I store the gradient magnitude in the alpha channel:

```wgsl
// compute_gradient.wgsl
let gradient = vec3<f32>(dx, dy, dz);
let magnitude = length(gradient);
let normalized = gradient / magnitude;

// Store normalized gradient + magnitude
textureStore(gradientTexture, coords, vec4<f32>(normalized, magnitude));
```

This avoids recomputing `length(gradient)` at runtime - it's already there in the `.a` channel.

### Results

**Bricking + surface detection:** 60ms → 8.9ms (**6.7x additional speedup**)

Combined speedup: **16.9x faster** than the original implementation.

---

## Performance Breakdown

| Configuration | Frame Time | Speedup | Notes |
|--------------|------------|---------|-------|
| Original (no optimizations) | 150ms | 1.0x | Baseline |
| + Bricking | 60ms | 2.5x | Empty space skipping |
| + Surface detection (0.08 threshold) | 9ms | 16.7x | Too aggressive, flat lighting |
| + Surface detection (0.02 threshold) | **8.9ms** | **16.9x** | Sweet spot ✅ |

Dataset: 512×512×400 CT abdomen, 32³ chunks, window/level optimized for soft tissue/bone contrast.

---

## Challenges & Trade-offs

### Challenge 1: Chunk Size Selection

**Smaller chunks (16³):**
- ✅ More precise culling (skip more empty space)
- ❌ More chunk boundary crossings (overhead)
- ❌ More draw calls (if using instanced rendering)

**Larger chunks (64³):**
- ✅ Fewer chunks = less overhead
- ❌ Less precise culling (might sample some empty space)

I settled on **32³** as a good middle ground. For very large datasets (Visible Human: 512×512×1250), I'd use **64³** to reduce the total chunk count.

### Challenge 2: Surface Detection Threshold

The threshold is dataset-dependent:
- **Smoothed data (Perona-Malik filtered):** Can use lower thresholds (0.02) for subtle surfaces
- **Raw noisy data:** Need higher thresholds (0.06) to avoid false positives from noise

Ideally this would be exposed as a runtime parameter so users can tune it, but for now it's hardcoded based on the dataset characteristics.

### Challenge 3: Overdraw vs. Acceleration

My initial approach was to render each visible chunk as a separate instanced cube. This led to massive overdraw - thousands of overlapping transparent quads being blended by the GPU's fixed-function blending units. The blending overhead ate any performance gain from culling.

**The solution:** Single-cube rendering with GPU-side skipping. Render one cube (the entire volume), but skip empty chunks *inside the shader*. No overdraw, no fixed-function blending bottleneck, all the benefits of spatial culling.

### Challenge 4: Memory Pressure on Large Datasets

Testing on Visible Human (512×512×1250) revealed memory issues:
- Perona-Malik smoothing ran out of RAM (11GB consumed, needed 13GB+)
- Frame times degraded over time (80ms → 500ms) suggesting GPU memory pressure or thermal throttling

Mitigations:
- Skip smoothing for testing (or chunk-process it)
- Increase surface detection threshold (fewer gradient fetches)
- Reduce max ray marching steps
- Lower render resolution

---

## Implementation Notes

### GPU Pipeline Architecture

**Textures:**
1. **Volume texture:** 2D texture array (`r16uint`), one slice per layer
2. **Gradient texture:** 2D texture array (`rgba16float`), stores normalized gradients + magnitude
3. **Acceleration texture:** 3D texture (`rg32float`), stores chunk min/max

**Why not a true 3D texture for volume data?**  
WebGPU has strict limits on 3D texture dimensions. Using a 2D array lets me store 1000+ slices without hitting limits. The shader does manual trilinear interpolation between array layers.

**Why `rg32float` for acceleration?**  
I initially tried `rg16float` but wanted full precision for density values. Since the texture is tiny (~26KB), the memory cost is negligible. The format is `unfilterable-float`, so I use `textureLoad()` instead of `textureSample()` - perfect for exact integer indexing anyway.

### Shader Optimizations

Beyond bricking and surface detection, other micro-optimizations:
- **Adaptive step size:** Small steps near surfaces (detail), large steps in homogeneous regions (speed)
- **Early ray termination:** Stop when accumulated opacity > 0.85 or transmittance < 0.08
- **Jittered ray start:** Reduces aliasing artifacts
- **Reduced max steps:** 512 → 384 for large datasets

### Alternative Approaches Considered

**Octree/KD-tree acceleration:**  
More complex to implement and traverse on GPU. Bricking (uniform grid) is simpler and performs well enough for medical data where empty regions are axis-aligned.

**Chunk-based "has surface" flag:**  
Store a binary flag per chunk indicating if ANY voxel in the chunk has significant gradient magnitude. Check this before fetching gradients. I prototyped this but found the per-sample density check to be simpler and nearly as effective.

**On-the-fly gradient computation:**  
Compute gradients via central differences in the fragment shader instead of precomputing. Turns out this is *slower* (6 volume samples vs 2 gradient samples) and loses the magnitude precomputation benefit.

---

## Lessons Learned

1. **Profile first, optimize second:** I initially thought empty space was the bottleneck. It was A bottleneck, but gradients were THE bottleneck. Measure everything.

2. **GPU texture bandwidth is precious:** Each texture fetch has a cost. Reducing gradient fetches from 100% to 20-30% of samples had a bigger impact than I expected.

3. **Chunk size matters:** Too small = overhead, too large = wasted work. 32³ was the sweet spot for my data, but this is tunable.

4. **Simple is fast:** Uniform grid bricking is way simpler than hierarchical structures and performs great for medical imaging where anatomy is roughly axis-aligned.

5. **Quality/speed trade-offs are dataset-dependent:** The surface detection threshold that works for smoothed data doesn't work for raw noisy data. Always test on representative datasets.

---

## Future Work

**Short term:**
- Expose surface detection threshold as a UI parameter
- Implement adaptive chunk sizing based on dataset dimensions
- Add temporal coherence (cache lighting between frames for static views)

**Medium term:**
- Chunk-based "has surface" flag to avoid even the neighbor density check
- Multi-resolution volume pyramid for level-of-detail rendering
- Investigate compute shader ray marching (more flexibility than fragment shader)

**Long term:**
- Neural network denoising to reduce Perona-Malik memory footprint
- Real-time transfer function editing with GPU-side chunk re-evaluation
- Multi-GPU support for ultra-large datasets (whole-body scans) - impossible in WebGPU
- Abandon WebGPU - Everything would be faster in Directx12 or Vulkan. But I WANT to see the medical images in the browser, so WebGPU it is

---

## Conclusion

By combining bricking acceleration and surface-aware gradient sampling, I achieved a **16.9x performance improvement** while maintaining visual quality. The key insights:
- **Empty space skipping:** Don't sample what you can't see
- **Surface detection:** Don't compute lighting where it doesn't matter

These techniques are applicable beyond medical imaging - any volume rendering application with sparse data can benefit from spatial acceleration structures and selective shader computations.

The full implementation is available in my GitHub repo. Feel free to reach out if you have questions or want to discuss optimization strategies for volume rendering!

---

## Code References

- **Bricking implementation:** `dicom_converter.py` (preprocessing), `volume_raycast_pipeline.ts` (GPU setup)
- **Shader:** `raycast_volume_render_bricking.wgsl`
- **Gradient precomputation:** `compute_gradient.ts`, `compute_gradient.wgsl`

**Tech stack:** WebGPU, TypeScript, Python, WGSL, NumPy