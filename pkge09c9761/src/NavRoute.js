var log = Logger.for('NavRoute');

var NODE_INCLUDE = 'id, lng, lat, kind, label, building.id, building.code, building.name, floor, zone.id, dataStatus';
var OUTDOOR_M_PER_S = 1.35;
var INDOOR_M_PER_S = 1.15;
var STAIRS_SEC_PER_FLOOR = 20;
var ELEVATOR_SEC_PER_FLOOR = 32;
var CALM_THRESHOLD = 0.55;

function compute(fromNodeId, toNodeId, mode, stepFree, scenario) {
  var routeMode = mode || NavRoute.Mode.FAST;
  var avoidSteps = !!stepFree;
  var graph = loadGraph();
  var from = graph.nodes[fromNodeId];
  var to = graph.nodes[toNodeId];
  if (!from) throw new Error('Unknown start node: ' + fromNodeId);
  if (!to) throw new Error('Unknown destination node: ' + toNodeId);

  var crowd = {};
  if (routeMode === NavRoute.Mode.CALM) {
    CrowdZone.simulate(scenario).each(function (st) {
      crowd[st.zone.id] = st.fraction;
    });
  }

  var result = dijkstra(graph, from.id, to.id, avoidSteps, crowd);
  if (!result) {
    log.info('No route from {} to {} (stepFree={})', fromNodeId, toNodeId, avoidSteps);
    return NavRoute.make({ fromNode: from, toNode: to, mode: routeMode, stepFree: avoidSteps, unreachable: true });
  }

  var points = NavRoute.Point.arrayBuilder();
  var floors = ArrayType.ofStr().makeBuilder();
  var seenFloors = {};
  var steps = NavRoute.Step.arrayBuilder();
  var distance = 0;
  var walkSec = 0;
  var penaltySec = 0;
  var pendingDistance = 0;
  var stepStart = from;

  result.path.forEach(function (nodeId, i) {
    var n = graph.nodes[nodeId];
    points.add(
      NavRoute.Point.make({
        lng: n.lng,
        lat: n.lat,
        floor: n.floor || null,
        buildingCode: n.building ? n.building.code : null,
        indoor: isIndoor(n),
        nodeId: n.id,
      })
    );
    if (n.floor && !seenFloors[n.floor + '@' + n.building.code]) {
      seenFloors[n.floor + '@' + n.building.code] = true;
      floors.add(n.floor);
    }
    if (i === 0) return;
    var prev = graph.nodes[result.path[i - 1]];
    var edge = graph.edgeBetween(prev.id, n.id);
    distance += edge.lengthM;
    pendingDistance += edge.lengthM;
    walkSec += edgeSeconds(prev, n, edge);
    penaltySec += calmPenaltySec(prev, n, edge, crowd);

    var text = transitionText(prev, n, edge);
    // Ride a stair or elevator shaft through several floors as one step ("Take the elevator to floor 4").
    var next = i + 1 < result.path.length ? graph.nodes[result.path[i + 1]] : null;
    if (text && floorDelta(prev, n) > 0 && next && floorDelta(n, next) > 0) text = null;
    if (text) {
      steps.add(stepFor(text, pendingDistance, stepStart));
      pendingDistance = 0;
      stepStart = n;
    }
  });
  steps.add(stepFor('Arrive at ' + (to.label || 'your destination'), pendingDistance, stepStart));

  var totalSec = walkSec + penaltySec;
  return NavRoute.make({
    fromNode: from,
    toNode: to,
    mode: routeMode,
    stepFree: avoidSteps,
    distanceM: Math.round(distance),
    etaMinutes: Math.round((totalSec / 60) * 10) / 10,
    crowdPenaltyMin: Math.round((penaltySec / 60) * 10) / 10,
    points: points.build(),
    steps: steps.build(),
    floorsVisited: floors.build(),
  });
}

function loadGraph() {
  var nodes = {};
  NavNode.fetchObjStream({ include: NODE_INCLUDE }).each(function (n) {
    nodes[n.id] = n;
  });
  var adjacency = {};
  var edges = {};
  NavEdge.fetchObjStream({ include: 'id, fromNode.id, toNode.id, lengthM, hasSteps, indoor' }).each(function (e) {
    var a = e.fromNode.id;
    var b = e.toNode.id;
    if (!nodes[a] || !nodes[b]) return;
    (adjacency[a] = adjacency[a] || []).push({ to: b, edge: e });
    (adjacency[b] = adjacency[b] || []).push({ to: a, edge: e });
    edges[a + '|' + b] = e;
    edges[b + '|' + a] = e;
  });
  return {
    nodes: nodes,
    adjacency: adjacency,
    edgeBetween: function (a, b) {
      return edges[a + '|' + b];
    },
  };
}

function dijkstra(graph, startId, goalId, avoidSteps, crowd) {
  // Binary-heap Dijkstra: the indoor graphs from the floor plans add a few thousand nodes.
  var dist = {};
  var prev = {};
  var visited = {};
  dist[startId] = 0;
  var heap = [[0, startId]];

  function push(item) {
    heap.push(item);
    var i = heap.length - 1;
    while (i > 0) {
      var p = (i - 1) >> 1;
      if (heap[p][0] <= heap[i][0]) break;
      var t = heap[p];
      heap[p] = heap[i];
      heap[i] = t;
      i = p;
    }
  }

  function pop() {
    var top = heap[0];
    var last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      var i = 0;
      for (;;) {
        var l = 2 * i + 1;
        var r = l + 1;
        var m = i;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === i) break;
        var t = heap[m];
        heap[m] = heap[i];
        heap[i] = t;
        i = m;
      }
    }
    return top;
  }

  while (heap.length) {
    var current = pop()[1];
    if (visited[current]) continue;
    visited[current] = true;
    if (current === goalId) break;

    var neighbours = graph.adjacency[current] || [];
    for (var j = 0; j < neighbours.length; j++) {
      var link = neighbours[j];
      if (avoidSteps && link.edge.hasSteps) continue;
      var a = graph.nodes[current];
      var b = graph.nodes[link.to];
      var cost = edgeSeconds(a, b, link.edge) + calmPenaltySec(a, b, link.edge, crowd);
      var alt = dist[current] + cost;
      if (dist[link.to] === undefined || alt < dist[link.to]) {
        dist[link.to] = alt;
        prev[link.to] = current;
        push([alt, link.to]);
      }
    }
  }
  if (dist[goalId] === undefined) return null;
  var path = [goalId];
  while (path[0] !== startId) path.unshift(prev[path[0]]);
  return { path: path, seconds: dist[goalId] };
}

function edgeSeconds(a, b, edge) {
  var floorsChanged = floorDelta(a, b);
  if (floorsChanged > 0) {
    var perFloor = a.kind === NavNode.Kind.ELEVATOR || b.kind === NavNode.Kind.ELEVATOR ? ELEVATOR_SEC_PER_FLOOR : STAIRS_SEC_PER_FLOOR;
    return floorsChanged * perFloor;
  }
  return edge.lengthM / (edge.indoor ? INDOOR_M_PER_S : OUTDOOR_M_PER_S);
}

function calmPenaltySec(a, b, edge, crowd) {
  var fraction = Math.max(zoneFraction(a, crowd), zoneFraction(b, crowd));
  if (fraction <= CALM_THRESHOLD) return 0;
  var base = edge.lengthM / (edge.indoor ? INDOOR_M_PER_S : OUTDOOR_M_PER_S);
  return base * (fraction - CALM_THRESHOLD) * 4;
}

function zoneFraction(node, crowd) {
  if (!node.zone || !node.zone.id) return 0;
  return crowd[node.zone.id] || 0;
}

function floorDelta(a, b) {
  if (!a.floor || !b.floor || !a.building || !b.building || a.building.code !== b.building.code) return 0;
  var fa = floorIndex(a.floor);
  var fb = floorIndex(b.floor);
  return Math.abs(fa - fb);
}

function floorIndex(label) {
  var n = parseInt(label, 10);
  if (!isNaN(n)) return n;
  var letters = { A: 0, B: -1, C: -2, D: -3, E: -4, F: -5, LL: -1, M: 1.5, PH: 10, EV: -1 };
  return letters[label] !== undefined ? letters[label] : 0;
}

function isIndoor(n) {
  return n.kind !== NavNode.Kind.OUTDOOR && n.kind !== NavNode.Kind.LANDMARK && n.kind !== NavNode.Kind.DOOR;
}

function transitionText(prev, n, edge) {
  var prevIndoor = isIndoor(prev);
  var nowIndoor = isIndoor(n);
  var floors = floorDelta(prev, n);
  if (floors > 0) {
    var via = n.kind === NavNode.Kind.ELEVATOR || prev.kind === NavNode.Kind.ELEVATOR ? 'Take the elevator' : 'Take the stairs';
    return via + ' to floor ' + n.floor;
  }
  if (prev.kind === NavNode.Kind.DOOR && nowIndoor) return 'Enter ' + (prev.building ? prev.building.name : 'the building') + (n.floor ? ' (floor ' + n.floor + ')' : '');
  if (prevIndoor && n.kind === NavNode.Kind.DOOR) return 'Exit ' + (n.building ? n.building.name : 'the building') + ' via ' + (n.label || 'the door');
  if (!prevIndoor && prev.kind !== NavNode.Kind.DOOR && n.kind === NavNode.Kind.DOOR) return 'Walk to ' + (n.label || (n.building ? n.building.name : 'the entrance'));
  if (n.kind === NavNode.Kind.LANDMARK) return 'Pass ' + (n.label || 'the landmark');
  return null;
}

function stepFor(text, distanceM, at) {
  return NavRoute.Step.make({
    text: text,
    distanceM: Math.round(distanceM),
    floor: at.floor || null,
    buildingCode: at.building ? at.building.code : null,
    lng: at.lng,
    lat: at.lat,
  });
}
