var log = Logger.for('CampusBuilding');

var DISCLAIMER = 'Planning simulation · Synthetic occupants · Not operational emergency guidance.';
var WALK_M_PER_S = 1.2;
var FLOOR_DESCENT_M = 14;
var CLUSTER_COUNT = 12;

function forCode(code) {
  var res = CampusBuilding.fetch({ filter: Filter.eq('code', code), include: 'this', limit: 1 });
  return res.objs.isEmpty() ? null : res.objs.first();
}

function planEvacuation(occupants, seed) {
  var building = this.getMissing({ include: 'id, code, name, footprint, lng, lat, floorLabels, schematicFloors, heightM' });
  var exits = CampusBuilding.Exit.fetch({
    filter: Filter.eq('building', building.id),
    include: 'id, name, lng, lat, capacityPerMin, assemblyPoint, building.id, dataStatus',
    limit: 20,
    order: 'name',
  }).objs;
  if (exits.isEmpty()) throw new Error('No exits are modelled for ' + building.name + '; the evacuation sandbox only covers the demo buildings.');

  var total = occupants || 400;
  var rngSeed = seed || 7;
  var clusters = placeClusters(building, total, rngSeed);
  var exitList = toJsArray(exits);

  var baseline = runAssignment('Nearest exit', clusters, exitList, nearestAssignment(clusters, exitList));
  var optimized = runAssignment('Capacity-aware', clusters, exitList, optimizeAssignment(clusters, exitList));
  var improvement = baseline.clearanceSec > 0 ? Math.max(0, (baseline.clearanceSec - optimized.clearanceSec) / baseline.clearanceSec) : 0;

  var clusterArr = CampusBuilding.EvacuationPlan.Cluster.arrayBuilder();
  clusters.forEach(function (c) {
    clusterArr.add(CampusBuilding.EvacuationPlan.Cluster.make({ clusterId: c.id, lng: c.lng, lat: c.lat, floor: c.floor, count: c.count }));
  });

  return CampusBuilding.EvacuationPlan.make({
    building: building,
    occupants: total,
    seed: rngSeed,
    baseline: baseline,
    optimized: optimized,
    improvementPct: Math.round(improvement * 1000) / 10,
    disclaimer: DISCLAIMER,
    clusters: clusterArr.build(),
  });
}

function placeClusters(building, total, seed) {
  var ring = building.footprint ? toJsArray(building.footprint) : [];
  var bbox = boundingBox(ring, building);
  var rnd = mulberry32(seed);
  var floors = building.schematicFloors && building.schematicFloors.length ? toJsArray(building.schematicFloors) : ['1', '2', '3'];
  var clusters = [];
  var remaining = total;
  var attempts = 0;
  while (clusters.length < CLUSTER_COUNT && attempts < 500) {
    attempts++;
    var lng = bbox.minLng + rnd() * (bbox.maxLng - bbox.minLng);
    var lat = bbox.minLat + rnd() * (bbox.maxLat - bbox.minLat);
    if (ring.length > 3 && !pointInRing(lng, lat, ring)) continue;
    var isLast = clusters.length === CLUSTER_COUNT - 1;
    var share = isLast ? remaining : Math.max(5, Math.round((total / CLUSTER_COUNT) * (0.6 + rnd() * 0.8)));
    share = Math.min(share, remaining);
    remaining -= share;
    clusters.push({ id: 'c' + (clusters.length + 1), lng: lng, lat: lat, floor: floors[Math.floor(rnd() * floors.length)], count: share });
    if (remaining <= 0) break;
  }
  return clusters;
}

function nearestAssignment(clusters, exits) {
  var assignment = {};
  clusters.forEach(function (c) {
    var best = null;
    var bestSec = Infinity;
    exits.forEach(function (e) {
      var sec = walkSeconds(c, e);
      if (sec < bestSec) {
        bestSec = sec;
        best = e;
      }
    });
    assignment[c.id] = best.id;
  });
  return assignment;
}

function optimizeAssignment(clusters, exits) {
  var assignment = nearestAssignment(clusters, exits);
  var current = evaluate(clusters, exits, assignment);
  for (var pass = 0; pass < 40; pass++) {
    var busiest = busiestExit(current);
    var bestMove = null;
    clusters.forEach(function (c) {
      if (assignment[c.id] !== busiest) return;
      exits.forEach(function (e) {
        if (e.id === busiest) return;
        var trial = clone(assignment);
        trial[c.id] = e.id;
        var evalTrial = evaluate(clusters, exits, trial);
        if (evalTrial.clearanceSec < current.clearanceSec - 0.5 && (!bestMove || evalTrial.clearanceSec < bestMove.clearanceSec)) {
          bestMove = { assignment: trial, clearanceSec: evalTrial.clearanceSec, result: evalTrial };
        }
      });
    });
    if (!bestMove) break;
    assignment = bestMove.assignment;
    current = bestMove.result;
  }
  return assignment;
}

function evaluate(clusters, exits, assignment) {
  var perExit = {};
  exits.forEach(function (e) {
    perExit[e.id] = { exit: e, assigned: 0, firstArrival: Infinity, lastArrival: 0 };
  });
  clusters.forEach(function (c) {
    var slot = perExit[assignment[c.id]];
    var sec = walkSeconds(c, slot.exit);
    slot.assigned += c.count;
    slot.firstArrival = Math.min(slot.firstArrival, sec);
    slot.lastArrival = Math.max(slot.lastArrival, sec);
  });
  var clearance = 0;
  var total = 0;
  Object.keys(perExit).forEach(function (id) {
    var s = perExit[id];
    total += s.assigned;
    var throughputSec = s.assigned / (s.exit.capacityPerMin / 60);
    s.clearanceSec = s.assigned === 0 ? 0 : Math.max(s.lastArrival, s.firstArrival + throughputSec);
    clearance = Math.max(clearance, s.clearanceSec);
  });
  return { perExit: perExit, clearanceSec: clearance, total: total };
}

function runAssignment(method, clusters, exits, assignment) {
  var ev = evaluate(clusters, exits, assignment);
  var loads = CampusBuilding.EvacuationPlan.ExitLoad.arrayBuilder();
  var maxFraction = 0;
  exits.forEach(function (e) {
    var s = ev.perExit[e.id];
    var fraction = ev.total ? s.assigned / ev.total : 0;
    maxFraction = Math.max(maxFraction, fraction);
    loads.add(
      CampusBuilding.EvacuationPlan.ExitLoad.make({
        exit: e,
        assigned: s.assigned,
        fraction: Math.round(fraction * 1000) / 1000,
        clearanceSec: Math.round(s.clearanceSec),
      })
    );
  });
  var assignments = CampusBuilding.EvacuationPlan.Assignment.arrayBuilder();
  clusters.forEach(function (c) {
    var e = ev.perExit[assignment[c.id]].exit;
    assignments.add(CampusBuilding.EvacuationPlan.Assignment.make({ clusterId: c.id, exitId: e.id, walkSec: Math.round(walkSeconds(c, e)) }));
  });
  return CampusBuilding.EvacuationPlan.Run.make({
    method: method,
    clearanceSec: Math.round(ev.clearanceSec),
    maxExitFraction: Math.round(maxFraction * 1000) / 1000,
    exitLoads: loads.build(),
    assignments: assignments.build(),
  });
}

function busiestExit(ev) {
  var worst = null;
  Object.keys(ev.perExit).forEach(function (id) {
    if (!worst || ev.perExit[id].clearanceSec > ev.perExit[worst].clearanceSec) worst = id;
  });
  return worst;
}

function walkSeconds(cluster, exit) {
  var metres = haversineM(cluster.lng, cluster.lat, exit.lng, exit.lat);
  var floors = Math.max(0, floorIndex(cluster.floor) - 1);
  return (metres + floors * FLOOR_DESCENT_M) / WALK_M_PER_S + floors * 15;
}

function floorIndex(label) {
  var n = parseInt(label, 10);
  return isNaN(n) ? 1 : n;
}

function boundingBox(ring, building) {
  if (!ring.length) {
    var d = 0.0004;
    return { minLng: building.lng - d, maxLng: building.lng + d, minLat: building.lat - d, maxLat: building.lat + d };
  }
  var box = { minLng: Infinity, maxLng: -Infinity, minLat: Infinity, maxLat: -Infinity };
  ring.forEach(function (p) {
    box.minLng = Math.min(box.minLng, p.lng);
    box.maxLng = Math.max(box.maxLng, p.lng);
    box.minLat = Math.min(box.minLat, p.lat);
    box.maxLat = Math.max(box.maxLat, p.lat);
  });
  return box;
}

function pointInRing(lng, lat, ring) {
  var inside = false;
  for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    var xi = ring[i].lng;
    var yi = ring[i].lat;
    var xj = ring[j].lng;
    var yj = ring[j].lat;
    var intersects = yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function haversineM(lng1, lat1, lng2, lat2) {
  var R = 6371000;
  var toRad = Math.PI / 180;
  var dLat = (lat2 - lat1) * toRad;
  var dLng = (lng2 - lng1) * toRad;
  var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function mulberry32(seed) {
  var state = (seed >>> 0) || 1;
  return function () {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

function clone(obj) {
  var out = {};
  Object.keys(obj).forEach(function (k) {
    out[k] = obj[k];
  });
  return out;
}

function toJsArray(c3Array) {
  var out = [];
  if (!c3Array) return out;
  c3Array.each(function (item) {
    out.push(item);
  });
  return out;
}
