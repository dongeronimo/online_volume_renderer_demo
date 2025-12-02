import { vec2 } from 'gl-matrix';

/**
 * Simplifies a polyline using the Ramer-Douglas-Peucker algorithm
 * @param points Array of 2D points
 * @param epsilon Maximum distance threshold (in same units as points)
 * @returns Simplified array of points
 */
export function simplifyContour(points: vec2[], epsilon: number): vec2[] {
  if (points.length <= 2) {
    return points.slice();
  }

  return ramerDouglasPeucker(points, epsilon);
}

/**
 * Recursive Ramer-Douglas-Peucker implementation
 */
function ramerDouglasPeucker(points: vec2[], epsilon: number): vec2[] {
  if (points.length <= 2) {
    return points.slice();
  }

  // Find the point with maximum distance from line segment (first to last)
  let maxDistance = 0;
  let maxIndex = 0;
  const firstPoint = points[0];
  const lastPoint = points[points.length - 1];

  for (let i = 1; i < points.length - 1; i++) {
    const distance = perpendicularDistance(points[i], firstPoint, lastPoint);
    if (distance > maxDistance) {
      maxDistance = distance;
      maxIndex = i;
    }
  }

  // If max distance is greater than epsilon, recursively simplify
  if (maxDistance > epsilon) {
    // Recursive call on both halves
    const leftHalf = ramerDouglasPeucker(points.slice(0, maxIndex + 1), epsilon);
    const rightHalf = ramerDouglasPeucker(points.slice(maxIndex), epsilon);

    // Concatenate results (remove duplicate middle point)
    return leftHalf.slice(0, -1).concat(rightHalf);
  } else {
    // All points between first and last can be discarded
    return [firstPoint, lastPoint];
  }
}

/**
 * Calculate perpendicular distance from point to line segment
 */
function perpendicularDistance(point: vec2, lineStart: vec2, lineEnd: vec2): number {
  const dx = lineEnd[0] - lineStart[0];
  const dy = lineEnd[1] - lineStart[1];

  // Handle degenerate case (line segment is a point)
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) {
    const pdx = point[0] - lineStart[0];
    const pdy = point[1] - lineStart[1];
    return Math.sqrt(pdx * pdx + pdy * pdy);
  }

  // Calculate perpendicular distance using cross product formula
  // Distance = |cross(AB, AP)| / |AB|
  // Where A = lineStart, B = lineEnd, P = point
  const numerator = Math.abs(
    dy * point[0] - dx * point[1] + lineEnd[0] * lineStart[1] - lineEnd[1] * lineStart[0]
  );
  const denominator = Math.sqrt(lengthSquared);

  return numerator / denominator;
}
