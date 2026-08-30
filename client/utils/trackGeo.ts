/** 示意轨迹几何：无 GPX 时用起点 + 里程生成折线，供 GPS 投影算进度/偏航 */

export type LatLng = { lat: number; lng: number };

const EARTH_M = 6371000;

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function toRad(d: number) {
  return (d * Math.PI) / 180;
}

function toDeg(r: number) {
  return (r * 180) / Math.PI;
}

export function haversineM(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const la1 = toRad(a.lat);
  const la2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

function destination(start: LatLng, bearingDeg: number, distM: number): LatLng {
  const br = toRad(bearingDeg);
  const ang = distM / EARTH_M;
  const lat1 = toRad(start.lat);
  const lng1 = toRad(start.lng);
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(ang) + Math.cos(lat1) * Math.sin(ang) * Math.cos(br)
  );
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(br) * Math.sin(ang) * Math.cos(lat1),
      Math.cos(ang) - Math.sin(lat1) * Math.sin(lat2)
    );
  return { lat: toDeg(lat2), lng: toDeg(lng2) };
}

/** 沿示意折线生成点（约每 150m 一点） */
export function buildSchematicTrail(
  start: LatLng,
  distanceKm: number,
  seed: string
): LatLng[] {
  const totalM = Math.max(500, distanceKm * 1000);
  const stepM = 150;
  const points: LatLng[] = [start];
  const seedN = hashSeed(seed || 'trail');
  let bearing = 20 + (seedN % 80); // 东北向附近
  let cur = start;
  let walked = 0;
  let i = 0;
  while (walked < totalM) {
    const seg = Math.min(stepM, totalM - walked);
    // 轻微弯折，模拟山脊走向
    bearing += ((seedN >> (i % 8)) & 7) - 3.5;
    cur = destination(cur, bearing, seg);
    points.push(cur);
    walked += seg;
    i += 1;
  }
  return points;
}

function projectPointToSegment(
  p: LatLng,
  a: LatLng,
  b: LatLng
): { point: LatLng; t: number; distM: number } {
  const ax = a.lng;
  const ay = a.lat;
  const bx = b.lng;
  const by = b.lat;
  const px = p.lng;
  const py = p.lat;
  const abx = bx - ax;
  const aby = by - ay;
  const apx = px - ax;
  const apy = py - ay;
  const ab2 = abx * abx + aby * aby;
  let t = ab2 === 0 ? 0 : (apx * abx + apy * aby) / ab2;
  t = Math.max(0, Math.min(1, t));
  const point = { lat: ay + aby * t, lng: ax + abx * t };
  return { point, t, distM: haversineM(p, point) };
}

export function projectOntoTrail(
  pos: LatLng,
  trail: LatLng[]
): { progress: number; offsetM: number; nearest: LatLng } {
  if (trail.length < 2) {
    return { progress: 0, offsetM: 0, nearest: trail[0] || pos };
  }
  let bestDist = Infinity;
  let bestProg = 0;
  let bestPt = trail[0];
  let cum = 0;
  const segs: number[] = [];
  for (let i = 0; i < trail.length - 1; i++) {
    const len = haversineM(trail[i], trail[i + 1]);
    segs.push(len);
  }
  const total = segs.reduce((s, n) => s + n, 0) || 1;

  for (let i = 0; i < trail.length - 1; i++) {
    const { point, t, distM } = projectPointToSegment(pos, trail[i], trail[i + 1]);
    if (distM < bestDist) {
      bestDist = distM;
      bestPt = point;
      bestProg = (cum + segs[i] * t) / total;
    }
    cum += segs[i];
  }

  // 叉积符号粗判左右偏航（简化）
  let signed = bestDist;
  // 找最近段方向
  for (let i = 0; i < trail.length - 1; i++) {
    const { distM, t } = projectPointToSegment(pos, trail[i], trail[i + 1]);
    if (Math.abs(distM - bestDist) < 0.5) {
      const ax = trail[i + 1].lng - trail[i].lng;
      const ay = trail[i + 1].lat - trail[i].lat;
      const bx = pos.lng - trail[i].lng;
      const by = pos.lat - trail[i].lat;
      const cross = ax * by - ay * bx;
      signed = cross >= 0 ? bestDist : -bestDist;
      void t;
      break;
    }
  }

  return {
    progress: Math.max(0, Math.min(1, bestProg)),
    offsetM: Math.max(-120, Math.min(120, signed)),
    nearest: bestPt,
  };
}
