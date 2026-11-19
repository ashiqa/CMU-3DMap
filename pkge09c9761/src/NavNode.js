var log = Logger.for('NavNode');

var NODE_INCLUDE = 'id, lng, lat, kind, label, building.id, building.code, building.name, floor, zone.id, dataStatus';

function nearest(lng, lat, buildingCode, floor) {
  var filter = null;
  if (buildingCode) {
    filter = Filter.eq('building.code', buildingCode);
    if (floor) filter = filter.and(Filter.eq('floor', floor));
  } else {
    filter = Filter.intersects('kind', [NavNode.Kind.OUTDOOR, NavNode.Kind.DOOR, NavNode.Kind.LANDMARK]);
  }
  var best = null;
  var bestD = Infinity;
  NavNode.fetchObjStream({ filter: filter, include: NODE_INCLUDE }).each(function (n) {
    var d = squaredDegrees(n.lng, n.lat, lng, lat) + (n.kind === NavNode.Kind.ROOM ? 0 : 1e-12);
    if (d < bestD) {
      bestD = d;
      best = n;
    }
  });
  if (!best && buildingCode && floor) {
    log.info('No node on {} floor {}; falling back to building doors', buildingCode, floor);
    return nearest(lng, lat, buildingCode, null);
  }
  return best;
}

function squaredDegrees(lng1, lat1, lng2, lat2) {
  var dx = (lng1 - lng2) * Math.cos((lat1 * Math.PI) / 180);
  var dy = lat1 - lat2;
  return dx * dx + dy * dy;
}
