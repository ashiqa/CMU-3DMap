var log = Logger.for('CrowdZone');

/* Minutes-of-day when CMU classes let out (MWF 50-min and TR 80-min blocks merged). */
var CLASS_CHANGE_MINUTES = [530, 590, 650, 710, 740, 770, 830, 890, 920, 950, 1010, 1080];
var ZONE_INCLUDE =
  'id, name, kind, lng, lat, building.id, building.code, building.name, floor, capacity, indoor, studySpace, ' +
  'baseProfile, rainSensitivity, eventSensitivity, examSensitivity, classChangeSensitivity, amenities, dataStatus';
var CAPACITY_THRESHOLD = 0.9;
var WALK_METRES_PER_MIN = 80;

function simulate(scenario) {
  var s = normalizeScenario(scenario);
  var zones = CrowdZone.fetch({ include: ZONE_INCLUDE, limit: 200, order: 'name' }).objs;
  var states = CrowdZone.State.arrayBuilder();
  zones.each(function (zone) {
    states.add(stateFor(zone, s));
  });
  return states.build();
}

function forecast(scenario, horizonMin) {
  var zone = this.getMissing({ include: ZONE_INCLUDE });
  return forecastFor(zone, normalizeScenario(scenario), horizonMin || 180);
}

function recommend(scenario) {
  var origin = this.getMissing({ include: ZONE_INCLUDE });
  var s = normalizeScenario(scenario);
  var originForecast = forecastFor(origin, s, 180);
  var candidates = CrowdZone.fetch({
    filter: origin.studySpace ? Filter.eq('studySpace', true) : Filter.eq('kind', origin.kind),
    include: ZONE_INCLUDE,
    limit: 200,
  }).objs;

  var scored = CrowdZone.Alternative.arrayBuilder();
  candidates.each(function (z) {
    if (z.id === origin.id) return;
    var predicted = components(z, s, s.minuteOfDay + 30).total;
    var walk = walkMinutes(origin, z);
    var sim = similarity(origin, z);
    var score = 0.5 * (1 - Math.min(predicted, 1)) + 0.3 * Math.max(0, 1 - walk / 15) + 0.2 * sim;
    scored.add(
      CrowdZone.Alternative.make({
        zone: z,
        predictedFraction: round3(predicted),
        walkMinutes: Math.round(walk * 10) / 10,
        similarity: round3(sim),
        score: round3(score),
        reason: pct(predicted) + ' predicted · ' + Math.round(walk) + ' min walk' + amenityNote(z),
      })
    );
  });
  var ranked = scored.build().sortedBy(true, function (a) {
    return a.score;
  });

  var top = ranked.isEmpty() ? null : ranked.first();
  var alternatives = CrowdZone.Alternative.arrayBuilder();
  var kept = 0;
  ranked.each(function (a) {
    if (kept < 3) {
      alternatives.add(a);
      kept++;
    }
  });

  var summary;
  if (originForecast.timeToCapacityMin != null) {
    summary = origin.name + ' hits ' + pct(originForecast.peakFraction) + ' at ' + originForecast.capacityAtLabel + driverClause(originForecast) + '.';
  } else {
    summary = origin.name + ' stays under capacity for the next 3 hours (peak ' + pct(originForecast.peakFraction) + ')' + driverClause(originForecast) + '.';
  }
  if (top) {
    summary += ' Try ' + top.zone.name + ': ' + pct(top.predictedFraction) + ', ' + Math.round(top.walkMinutes) + ' min away.';
  }

  return CrowdZone.Recommendation.make({
    origin: origin,
    originForecast: originForecast,
    alternatives: alternatives.build(),
    summary: summary,
  });
}

/* ---- simulation model (shared by simulate, forecast, recommend, and NavRoute Calm routing) ---- */

function normalizeScenario(scenario) {
  var s = scenario || CampusPulse.Scenario.make({});
  var minute = s.minuteOfDay;
  if (minute == null) {
    minute = DateTime.now().withZoneOffset(-300).minuteOfDay;
  }
  return CampusPulse.Scenario.make({
    minuteOfDay: ((minute % 1440) + 1440) % 1440,
    rain: !!s.rain,
    eventNearby: !!s.eventNearby,
    examWeek: !!s.examWeek,
    seed: s.seed || 0,
  });
}

function stateFor(zone, s) {
  var now = components(zone, s, s.minuteOfDay).total;
  var later = components(zone, s, s.minuteOfDay + 20).total;
  var trend = later - now > 0.04 ? 'rising' : now - later > 0.04 ? 'falling' : 'steady';
  return CrowdZone.State.make({
    zone: zone,
    occupancy: Math.round(now * zone.capacity),
    fraction: round3(now),
    level: levelOf(now),
    trend: trend,
  });
}

function forecastFor(zone, s, horizon) {
  var minutes = ArrayType.ofInt().makeBuilder();
  var p10 = ArrayType.ofDbl().makeBuilder();
  var p50 = ArrayType.ofDbl().makeBuilder();
  var p90 = ArrayType.ofDbl().makeBuilder();
  var peak = -1;
  var peakComp = null;
  var peakMinute = 0;
  var timeToCapacity = null;
  var nowFraction = 0;

  for (var t = 0; t <= horizon; t += 10) {
    var c = components(zone, s, s.minuteOfDay + t);
    var spread = 0.03 + 0.07 * (t / 180) + (s.rain ? 0.02 : 0) + (s.eventNearby ? 0.02 : 0);
    minutes.add(t);
    p50.add(round3(c.total));
    p10.add(round3(clamp(c.total - spread, 0, 1.15)));
    p90.add(round3(clamp(c.total + spread * 1.2, 0, 1.2)));
    if (t === 0) nowFraction = c.total;
    if (c.total > peak) {
      peak = c.total;
      peakComp = c;
      peakMinute = s.minuteOfDay + t;
    }
    if (timeToCapacity === null && c.total >= CAPACITY_THRESHOLD) timeToCapacity = t;
  }

  return CrowdZone.Forecast.make({
    zone: zone,
    scenario: s,
    minutesAhead: minutes.build(),
    p10: p10.build(),
    p50: p50.build(),
    p90: p90.build(),
    nowFraction: round3(nowFraction),
    peakFraction: round3(peak),
    timeToCapacityMin: timeToCapacity,
    capacityAtLabel: timeToCapacity === null ? null : clockLabel(s.minuteOfDay + timeToCapacity),
    drivers: driversFor(zone, peakComp, peakMinute, s),
    method:
      'Scenario simulation: typical-day profile + class-change waves + rain/event/exam shifts. ' +
      'The band is the spread across scenario assumptions, not a statistical confidence interval.',
  });
}

function components(zone, s, minute) {
  var m = ((minute % 1440) + 1440) % 1440;
  var base = profileAt(zone.baseProfile, m);
  var bump = 0;
  CLASS_CHANGE_MINUTES.forEach(function (changeAt) {
    var d = m - changeAt;
    if (d >= -6 && d <= 30) {
      var g = d < 0 ? Math.exp(-(d * d) / 32) : Math.exp(-d / 12);
      if (g > bump) bump = g;
    }
  });
  var classChange = bump * (zone.classChangeSensitivity || 0) * 0.35;
  var rain = s.rain ? zone.rainSensitivity || 0 : 0;
  var evt = s.eventNearby ? zone.eventSensitivity || 0 : 0;
  var exam = s.examWeek ? zone.examSensitivity || 0 : 0;
  var noise = hashNoise(zone.id + ':' + Math.floor(m / 10) + ':' + s.seed) * 0.02;
  var total = clamp(base + classChange + rain + evt + exam + noise, 0, 1.15);
  return { base: base, classChange: classChange, rain: rain, event: evt, exam: exam, noise: noise, total: total };
}

function driversFor(zone, c, peakMinute, s) {
  var drivers = CrowdZone.Forecast.Driver.arrayBuilder();
  var list = [];
  list.push({ label: dayPart(peakMinute) + ' baseline for ' + kindLabel(zone), contribution: c.base });
  if (c.classChange > 0.005) {
    list.push({ label: 'Class change ' + clockLabel(lastClassChangeBefore(peakMinute)), contribution: c.classChange });
  }
  if (s.rain && c.rain !== 0) {
    list.push({ label: c.rain > 0 ? 'Rain pushes people indoors' : 'Rain clears the lawn', contribution: c.rain });
  }
  if (s.eventNearby && c.event !== 0) list.push({ label: 'Event nearby', contribution: c.event });
  if (s.examWeek && c.exam !== 0) list.push({ label: 'Exam week', contribution: c.exam });
  list.sort(function (a, b) {
    return Math.abs(b.contribution) - Math.abs(a.contribution);
  });
  list.forEach(function (d) {
    drivers.add(CrowdZone.Forecast.Driver.make({ label: d.label, contribution: round3(d.contribution) }));
  });
  return drivers.build();
}

function profileAt(profile, minute) {
  if (!profile || profile.length === 0) return 0.3;
  var h = minute / 60;
  var i0 = Math.floor(h) % 24;
  var i1 = (i0 + 1) % 24;
  var f = h - Math.floor(h);
  return profile[i0] * (1 - f) + profile[i1] * f;
}

function lastClassChangeBefore(minute) {
  var best = CLASS_CHANGE_MINUTES[0];
  CLASS_CHANGE_MINUTES.forEach(function (m) {
    if (m <= minute + 6) best = m;
  });
  return best;
}

function walkMinutes(a, b) {
  var metres = haversineM(a.lng, a.lat, b.lng, b.lat);
  var floorPenalty = (a.floor ? 1 : 0) + (b.floor ? 1 : 0);
  return Math.max(1, metres / WALK_METRES_PER_MIN + floorPenalty);
}

function similarity(a, b) {
  var aa = a.amenities ? toJsArray(a.amenities) : [];
  var bb = b.amenities ? toJsArray(b.amenities) : [];
  var inter = aa.filter(function (x) {
    return bb.indexOf(x) >= 0;
  }).length;
  var union = aa.length + bb.length - inter;
  var jaccard = union === 0 ? 0 : inter / union;
  return clamp(jaccard * 0.8 + (a.kind === b.kind ? 0.2 : 0), 0, 1);
}

function amenityNote(z) {
  if (!z.amenities || z.amenities.length === 0) return '';
  return ' · ' + z.amenities.toString(', ');
}

function driverClause(f) {
  if (!f.drivers || f.drivers.length === 0) return '';
  var names = [];
  f.drivers.each(function (d, i) {
    if (i < 2 && d.contribution > 0.02 && d.label.indexOf('baseline') < 0) names.push(d.label.charAt(0).toLowerCase() + d.label.slice(1));
  });
  return names.length ? ' (' + names.join(', ') + ')' : '';
}

function haversineM(lng1, lat1, lng2, lat2) {
  var R = 6371000;
  var toRad = Math.PI / 180;
  var dLat = (lat2 - lat1) * toRad;
  var dLng = (lng2 - lng1) * toRad;
  var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function hashNoise(str) {
  var h = 2166136261;
  for (var i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h * 16777619) >>> 0;
  }
  return ((h % 10000) / 10000) * 2 - 1;
}

function levelOf(fraction) {
  if (fraction < 0.25) return 0;
  if (fraction < 0.5) return 1;
  if (fraction < 0.7) return 2;
  if (fraction < CAPACITY_THRESHOLD) return 3;
  return 4;
}

function clockLabel(minute) {
  var m = ((Math.round(minute) % 1440) + 1440) % 1440;
  var h = Math.floor(m / 60);
  var mm = m % 60;
  var suffix = h >= 12 ? 'PM' : 'AM';
  var h12 = h % 12 === 0 ? 12 : h % 12;
  return h12 + ':' + (mm < 10 ? '0' : '') + mm + ' ' + suffix;
}

function dayPart(minute) {
  var h = (((minute % 1440) + 1440) % 1440) / 60;
  if (h < 6) return 'Overnight';
  if (h < 11) return 'Morning';
  if (h < 14) return 'Midday';
  if (h < 18) return 'Afternoon';
  return 'Evening';
}

function kindLabel(zone) {
  return String(zone.kind || 'place').toLowerCase().replace('_', ' ');
}

function pct(fraction) {
  return Math.round(fraction * 100) + '%';
}

function clamp(x, lo, hi) {
  return Math.max(lo, Math.min(hi, x));
}

function round3(x) {
  return Math.round(x * 1000) / 1000;
}

function toJsArray(c3Array) {
  var out = [];
  if (!c3Array) return out;
  c3Array.each(function (item) {
    out.push(item);
  });
  return out;
}
