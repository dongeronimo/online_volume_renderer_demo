// Compute shader for generating lasso mask texture
// For each voxel, tests if it's inside any contour using point-in-polygon ray casting

// Maximum points per contour
const MAX_POINTS: u32 = 512u;

// Contour data structure (matches TypeScript packing)
struct ContourData {
  numPoints: u32,              // Number of points in this contour
  cameraPosition: vec3<f32>,   // Camera position when contour was drawn
  planeNormal: vec3<f32>,      // Camera forward direction (plane normal)
  viewProjMatrix: mat4x4<f32>, // Combined view-projection matrix
  aabbMin: vec3<f32>,          // AABB min (NDC space, Z=-1)
  aabbMax: vec3<f32>,          // AABB max (NDC space, Z=1)
  points: array<vec2<f32>, 512> // Contour points in NDC space
}

// Parameters
struct ComputeParams {
  numContours: u32,
  volumeWidth: u32,
  volumeHeight: u32,
  volumeDepth: u32,
  modelMatrix: mat4x4<f32>  // Volume transform
}

@group(0) @binding(0) var<storage, read> contours: array<ContourData>;
@group(0) @binding(1) var<uniform> params: ComputeParams;
@group(0) @binding(2) var outputMask: texture_storage_3d<r32uint, write>;

// Convert voxel index to world position
fn voxelToWorld(voxelIndex: vec3<u32>) -> vec3<f32> {
  // Normalize to [0, 1]
  let normalized = vec3<f32>(
    f32(voxelIndex.x) / f32(params.volumeWidth - 1u),
    f32(voxelIndex.y) / f32(params.volumeHeight - 1u),
    f32(voxelIndex.z) / f32(params.volumeDepth - 1u)
  );

  // Convert to [-1, 1] volume space
  let volumeSpace = normalized * 2.0 - 1.0;

  // Transform to world space
  let worldPos = params.modelMatrix * vec4<f32>(volumeSpace, 1.0);
  return worldPos.xyz / worldPos.w;
}

// Point-in-polygon test using ray casting
// Returns true if point is inside the polygon
fn pointInPolygon(point: vec2<f32>, contour: ContourData) -> bool {
  var crossings = 0u;

  for (var i = 0u; i < contour.numPoints; i++) {
    let p1 = contour.points[i];
    let p2 = contour.points[(i + 1u) % contour.numPoints];

    // Ray casting from point to +X infinity
    // Check if edge crosses the horizontal ray
    if ((p1.y <= point.y && p2.y > point.y) ||
        (p2.y <= point.y && p1.y > point.y)) {

      // Calculate X intersection
      let t = (point.y - p1.y) / (p2.y - p1.y);
      let intersectX = p1.x + t * (p2.x - p1.x);

      if (point.x < intersectX) {
        crossings++;
      }
    }
  }

  // Odd number of crossings = inside
  return (crossings % 2u) == 1u;
}

// Test if voxel is masked by any contour
fn isVoxelMasked(worldPos: vec3<f32>) -> bool {
  for (var i = 0u; i < params.numContours; i++) {
    let contour = contours[i];

    // Project voxel to contour's screen space
    let clipPos = contour.viewProjMatrix * vec4<f32>(worldPos, 1.0);

    // Check if behind camera (W <= 0)
    if (clipPos.w <= 0.0) {
      continue;
    }

    // Convert to NDC
    let ndcPos = clipPos.xy / clipPos.w;

    // Quick AABB rejection test
    if (ndcPos.x < contour.aabbMin.x || ndcPos.x > contour.aabbMax.x ||
        ndcPos.y < contour.aabbMin.y || ndcPos.y > contour.aabbMax.y) {
      continue;
    }

    // Point-in-polygon test
    if (pointInPolygon(ndcPos, contour)) {
      return true; // Inside this contour = masked
    }
  }

  return false; // Not inside any contour = visible
}

@compute @workgroup_size(8, 4, 4)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  // Bounds check
  if (gid.x >= params.volumeWidth ||
      gid.y >= params.volumeHeight ||
      gid.z >= params.volumeDepth) {
    return;
  }

  // Convert voxel index to world position
  let worldPos = voxelToWorld(gid);

  // Test if voxel is masked
  let masked = isVoxelMasked(worldPos);

  // Write result: 0 = masked (inside contour), 1 = visible
  let value = select(1u, 0u, masked);
  textureStore(outputMask, gid, vec4<u32>(value, 0u, 0u, 0u));
}
