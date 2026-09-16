export function createRoadLoop(halfWidth = 35, halfDepth = 35, radius = 9) {
  if (![halfWidth, halfDepth, radius].every(Number.isFinite)
    || halfWidth <= 0 || halfDepth <= 0 || radius <= 0
    || radius > Math.min(halfWidth, halfDepth)) {
    throw new RangeError('Road dimensions must be finite, positive, and large enough for the radius');
  }

  const horizontal = 2 * (halfWidth - radius);
  const vertical = 2 * (halfDepth - radius);
  const quarterArc = Math.PI * radius / 2;
  const length = 2 * (horizontal + vertical + 2 * quarterArc);

  function arc(distance, centerX, centerZ, startAngle) {
    const angle = startAngle - distance / radius;
    return {
      x: centerX + radius * Math.cos(angle),
      z: centerZ + radius * Math.sin(angle),
      dx: Math.sin(angle),
      dz: -Math.cos(angle),
    };
  }

  function sample(distance) {
    if (!Number.isFinite(distance)) throw new RangeError('Road distance must be finite');
    let remaining = ((distance % length) + length) % length;
    let point;

    if (remaining < horizontal) {
      point = { x: -halfWidth + radius + remaining, z: halfDepth, dx: 1, dz: 0 };
    } else if ((remaining -= horizontal) < quarterArc) {
      point = arc(remaining, halfWidth - radius, halfDepth - radius, Math.PI / 2);
    } else if ((remaining -= quarterArc) < vertical) {
      point = { x: halfWidth, z: halfDepth - radius - remaining, dx: 0, dz: -1 };
    } else if ((remaining -= vertical) < quarterArc) {
      point = arc(remaining, halfWidth - radius, -halfDepth + radius, 0);
    } else if ((remaining -= quarterArc) < horizontal) {
      point = { x: halfWidth - radius - remaining, z: -halfDepth, dx: -1, dz: 0 };
    } else if ((remaining -= horizontal) < quarterArc) {
      point = arc(remaining, -halfWidth + radius, -halfDepth + radius, -Math.PI / 2);
    } else if ((remaining -= quarterArc) < vertical) {
      point = { x: -halfWidth, z: -halfDepth + radius + remaining, dx: 0, dz: 1 };
    } else {
      remaining -= vertical;
      point = arc(remaining, -halfWidth + radius, halfDepth - radius, -Math.PI);
    }
    return { x: point.x, z: point.z, heading: Math.atan2(point.dx, point.dz) };
  }

  return { length, sample };
}
