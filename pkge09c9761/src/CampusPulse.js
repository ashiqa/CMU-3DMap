var log = Logger.for('CampusPulse');

var PIN_INCLUDE =
  'id, kind, name, lng, lat, building.id, building.code, building.name, floor, details, photos, startsAt, expiresAt, tags, dataStatus';
var ZONE_INCLUDE = 'id, name, kind, lng, lat, building.id, building.code, building.name, floor, capacity, indoor, studySpace, amenities';
var BUILDING_INCLUDE = 'id, code, name, lng, lat, hero, floorLabels, schematicFloors';
var FENCE = { lng: -79.9438, lat: 40.44285 };
var DEFAULT_LLM_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/';

/* Aliases people actually use for the demo buildings. Longest term wins; a matching `floorTerms` key sets the floor. */
var ALIASES = [
  { code: 'WEH', terms: ['sorrells library', 'sorrells', 'sorrell', 'wean hall', 'wean', 'weh'], floorTerms: { sorrells: '4', sorrell: '4' } },
  { code: 'HL', terms: ['hunt library', 'hunt', 'hl'] },
  { code: 'GHC', terms: ['gates hillman', 'gates-hillman', 'gates', 'hillman', 'ghc', 'gates center'] },
  { code: 'DH', terms: ['doherty hall', 'doherty', 'dh'] },
  { code: 'BH', terms: ['baker hall', 'baker', 'bh'] },
  { code: 'PH', terms: ['porter hall', 'porter', 'ph'] },
  { code: 'CUC', terms: ['cohon university center', 'cohon center', 'university center', 'cohon', 'cuc', 'uc', 'rangos'] },
  { code: 'TEP', terms: ['tepper quad', 'tepper school', 'tepper', 'tep'] },
  { code: 'NSH', terms: ['newell-simon', 'newell simon', 'newell', 'nsh'] },
  { code: 'CFA', terms: ['college of fine arts', 'fine arts', 'cfa'] },
  { code: 'HH', terms: ['hamerschlag hall', 'hamerschlag', 'hh'] },
  { code: 'PCA', terms: ['purnell center', 'purnell', 'pca'] },
  { code: 'POS', terms: ['posner hall', 'posner'] },
  { code: 'MM', terms: ['margaret morrison', 'maggie mo', 'mm'] },
  { code: 'HBH', terms: ['hamburg hall', 'hamburg', 'hbh', 'heinz college', 'heinz'] },
  { code: 'CYH', terms: ['cyert hall', 'cyert'] },
  { code: 'WH', terms: ['warner hall', 'warner'] },
  { code: 'SC', terms: ['scott hall', 'scott'] },
  { code: 'MI', terms: ['mellon institute', 'mellon'] },
];

var LANDMARKS = [
  { label: 'the fence', match: ['the fence', 'fence'] },
  { label: 'the cut', match: ['the cut', 'cut'] },
  { label: 'the mall', match: ['the mall', 'mall'] },
];

var SYNONYMS = {
  robotics: ['robot', 'robots', 'robotic', 'drone', 'drones', 'autonomous', 'buggy', 'rov'],
  ai: ['artificial intelligence', 'machine learning', 'ml', 'llm', 'genai', 'generative', 'c3'],
  music: ['concert', 'band', 'jazz', 'orchestra', 'dj'],
  art: ['gallery', 'exhibit', 'film', 'theatre', 'theater', 'cfa'],
  food: ['pizza', 'snack', 'snacks', 'bagels', 'donuts', 'coffee', 'boba', 'lunch', 'free food', 'eat'],
  career: ['recruiting', 'hiring', 'job', 'jobs', 'fair', 'startup', 'startups', 'internship'],
  wellness: ['dogs', 'therapy', 'break', 'relax', 'mindfulness'],
  hackathon: ['hack', 'hacking', 'build', 'challenge'],
};

var STOPWORDS = ('a an the is are any anything interesting things happening happen going on today tonight this week ' +
  'what whats what\'s where when related to about around campus near me show find events event tell there do you know of').split(' ');

/* ---------------------------------------------------------------- public API ---------------------------------------------------------------- */

function ask(text, scenario, nearLng, nearLat) {
  var ctx = newContext(scenario, nearLng, nearLat);
  var status = llmStatus();
  if (status.configured) {
    try {
      return askLlm(text, ctx, status);
    } catch (e) {
      log.error('LLM call failed; using deterministic parser: {}', e.message);
      var fallback = askDeterministic(text, newContext(scenario, nearLng, nearLat));
      return fallback.withTechnique('Deterministic intent parser (LLM unavailable: ' + shortError(e) + ')');
    }
  }
  var reply = askDeterministic(text, ctx);
  return reply.withTechnique(reply.technique + ' · LLM not configured');
}

function llmStatus() {
  var cfg = CampusPulse.Llm.make().config();
  var url = cfg ? cfg.url : null;
  return CampusPulse.LlmStatus.make({
    configured: !!url,
    model: CampusPulse.LlmConfig.inst().configValue('model') || 'gemini-2.5-flash',
    baseUrl: url || DEFAULT_LLM_URL,
  });
}

function resolvePlace(text) {
  return placeFor(text);
}

/* ---------------------------------------------------------------- LLM path ---------------------------------------------------------------- */

function askLlm(text, ctx, status) {
  var config = CampusPulse.LlmConfig.inst();
  var model = config.configValue('model') || 'gemini-2.5-flash';
  var temperature = config.configValue('temperature');
  var maxRounds = config.configValue('maxToolRounds') || 3;
  var messages = [
    { role: 'system', content: systemPrompt(ctx) },
    { role: 'user', content: text },
  ];
  var intents = [];
  var finalText = null;

  for (var round = 0; round <= maxRounds; round++) {
    var body = {
      model: model,
      messages: messages,
      tools: toolSchemas(),
      tool_choice: round < maxRounds ? 'auto' : 'none',
      temperature: temperature == null ? 0.2 : temperature,
    };
    var response = CampusPulse.Llm.chatCompletions(body);
    if (response.statusCode >= 400) {
      throw new Error('LLM HTTP ' + response.statusCode + ': ' + truncate(response.string(), 200));
    }
    var payload = response.json();
    var choice = payload.choices && payload.choices[0];
    if (!choice || !choice.message) throw new Error('LLM returned no choices');
    var message = choice.message;
    var calls = message.tool_calls || [];
    if (!calls.length) {
      finalText = message.content || '';
      break;
    }
    messages.push({ role: 'assistant', content: message.content || null, tool_calls: calls });
    calls.forEach(function (call) {
      var name = call['function'].name;
      var args = {};
      try {
        args = call['function'].arguments ? JSON.parse(call['function'].arguments) : {};
      } catch (parseErr) {
        args = {};
      }
      intents.push(name);
      var result = runTool(ctx, name, args);
      messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) });
    });
  }
  if (finalText === null) finalText = 'I found what I could; see the map.';

  return buildReply(ctx, finalText, intents.length ? intents[0] : 'chat', 'Gemini tool calling (' + model + ')', true);
}

function systemPrompt(ctx) {
  var s = ctx.scenario;
  return (
    'You are Campus Pulse, the assistant for a 3D map of Carnegie Mellon University. ' +
    'Always answer by calling tools; never invent places, rooms, hours, or events. ' +
    'Call search_pins for bathrooms, printers, food, study spaces, and events (use the query for topics like robotics). ' +
    'Call get_route for directions (mode "Calm" when the user wants to avoid crowds; step_free when they need elevators). ' +
    'Call get_forecast or recommend_study_space for crowding questions. Call set_scenario when the user says it is raining or an event is nearby. ' +
    'Reply in at most two short sentences, naming the top result and its building/floor. ' +
    'Pins marked synthetic are demo data; say "demo data" if the user asks whether something is real. ' +
    'Current scenario: time ' +
    clockLabel(s.minuteOfDay) +
    ', rain ' +
    (s.rain ? 'on' : 'off') +
    ', event nearby ' +
    (s.eventNearby ? 'yes' : 'no') +
    ', exam week ' +
    (s.examWeek ? 'yes' : 'no') +
    '.'
  );
}

function toolSchemas() {
  return [
    tool('search_pins', 'Find pins on the campus map by kind and optional topic, near a place.', {
      kind: { type: 'string', enum: ['Food', 'Event', 'Bathroom', 'Printer', 'Study space'], description: 'Kind of pin' },
      query: { type: 'string', description: 'Topic words to match in names, details, and tags, e.g. "robotics" or "colour printer"' },
      near: { type: 'string', description: 'Place text to measure distance from, e.g. "Hunt Library 2nd floor"' },
    }),
    tool('get_route', 'Compute a walking route between two places, indoors and outdoors.', {
      from_place: { type: 'string', description: 'Origin place text; omit to start from the user\'s position' },
      to_place: { type: 'string', description: 'Destination place text, e.g. "Gates 5th floor"' },
      mode: { type: 'string', enum: ['Fast', 'Calm'], description: 'Calm avoids crowded zones' },
      step_free: { type: 'boolean', description: 'Avoid stairs' },
    }),
    tool('get_forecast', 'Occupancy forecast for the next three hours at a place.', {
      place: { type: 'string', description: 'Place text, e.g. "Sorrells"' },
    }),
    tool('recommend_study_space', 'Rank alternative study spaces to a place by crowding, walking time, and similarity.', {
      place: { type: 'string', description: 'Origin place text; omit for the least crowded study spaces overall' },
    }),
    tool('locate_place', 'Highlight a building or landmark on the map and report its current crowding.', {
      place: { type: 'string', description: 'Building or landmark text, e.g. "Doherty Hall" or "the Fence"' },
    }),
    tool('get_crowd', 'Current simulated crowding of every campus zone.', {}),
    tool('set_scenario', 'Change the simulated scenario shown on the map.', {
      rain: { type: 'boolean' },
      event_nearby: { type: 'boolean' },
      exam_week: { type: 'boolean' },
    }),
  ];
}

function tool(name, description, properties) {
  return { type: 'function', 'function': { name: name, description: description, parameters: { type: 'object', properties: properties } } };
}

function runTool(ctx, name, args) {
  if (name === 'search_pins') return toolSearchPins(ctx, args.kind, args.query, args.near);
  if (name === 'get_route') return toolRoute(ctx, args.from_place, args.to_place, args.mode, args.step_free);
  if (name === 'get_forecast') return toolForecast(ctx, args.place);
  if (name === 'recommend_study_space') return toolRecommend(ctx, args.place);
  if (name === 'locate_place') return toolLocate(ctx, args.place) || { error: 'Unknown place: ' + args.place };
  if (name === 'get_crowd') return toolCrowd(ctx);
  if (name === 'set_scenario') return toolSetScenario(ctx, args.rain, args.event_nearby, args.exam_week);
  return { error: 'Unknown tool ' + name };
}

/* ---------------------------------------------------------------- deterministic path ---------------------------------------------------------------- */

function askDeterministic(text, ctx) {
  var q = String(text || '')
    .toLowerCase()
    .replace(/[?!.,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  var technique = 'Deterministic intent parser';

  var scenarioChange = parseScenario(q);
  var otherIntent = /\b(route|direction|directions|navigate|take me|get to|getting to|way to|walk|walking|late for|go to|going to|head to|heading to|closest|nearest|near|bathroom|restroom|toilet|printer|print|food|eat|pizza|hungry|study|event|events|happening|anything|crowd|crowded|busy|full|capacity|forecast|predict|bottleneck|where)\b/.test(q);
  if (scenarioChange) {
    toolSetScenario(ctx, scenarioChange.rain, scenarioChange.eventNearby, scenarioChange.examWeek);
    if (!otherIntent) {
      return buildReply(ctx, scenarioText(ctx.scenario), 'set_scenario', technique, false);
    }
  }

  var namedPin = matchPinName(q);
  if (namedPin) {
    var res0 = toolOpenPin(ctx, namedPin);
    return buildReply(ctx, res0.summary, 'open_pin', technique + ' · pin name match', false);
  }

  var wantsCalm = /\b(avoid(ing)? crowds?|calm|quiet route|less crowded|not crowded)\b/.test(q);
  var stepFree = /\b(step[- ]?free|elevator|elevators|wheelchair|accessible|no stairs|avoid stairs)\b/.test(q);

  var kind = pinKindFor(q);
  var crowdAsk = /\b(crowded|busy|how full|full|capacity|forecast|predict|prediction|bottleneck|packed|quiet place|where should i (study|work)|where can i study|least crowded)\b/.test(q);
  var routeAsk = /\b(route|direction|directions|navigate|take me|get to|getting to|way to|walk to|walking to|how do i get|late for|go to|going to|head to|heading to|from .* to)\b/.test(q);
  var eventAsk = kind === CampusPin.Kind.EVENT || /\b(anything|events?|happening|going on|interesting|what's on|whats on)\b/.test(q);

  if (routeAsk && !crowdAsk) {
    var toText;
    var fromText = null;
    var fromTo = /\bfrom\s+(.+?)\s+(?:to|into|towards?)\s+(.+)$/.exec(q);
    if (fromTo) {
      fromText = fromTo[1];
      toText = fromTo[2];
    } else {
      toText = after(q, /\b(to|into|towards?|at|for)\b/) || q;
      fromText = after(q, /\bfrom\b/);
      if (fromText) toText = toText.replace(/\bfrom\b.*$/, '').trim();
    }
    var r = toolRoute(ctx, fromText, toText, wantsCalm ? NavRoute.Mode.CALM : NavRoute.Mode.FAST, stepFree);
    if (r.error) return buildReply(ctx, r.error, 'route', technique, false);
    return buildReply(ctx, r.summary, 'route', technique + ' · Dijkstra over the campus nav graph' + (wantsCalm ? ' with crowd penalty' : ''), false);
  }

  if (crowdAsk) {
    var placeText = after(q, /\b(at|in|to|for|about|is|will|near)\b/) || q;
    if (kind === CampusPin.Kind.STUDY || /\bwhere (should|can) i (study|work)|least crowded|quiet place|quietest\b/.test(q)) {
      var rec = toolRecommend(ctx, placeFor(placeText) ? placeText : null);
      return buildReply(ctx, rec.summary, 'recommend', technique + ' · scenario forecast + ranked alternatives', false);
    }
    var f = toolForecast(ctx, placeText);
    if (f.error) return buildReply(ctx, f.error, 'forecast', technique, false);
    return buildReply(ctx, f.summary, 'forecast', technique + ' · scenario occupancy forecast', false);
  }

  var locateAsk = /\b(where is|where's|wheres|locate|show me|find|take a look at)\b/.test(q);
  if (locateAsk && !kind && !eventAsk) {
    var loc = toolLocate(ctx, after(q, /\b(is|me|locate|find|at)\b/) || q);
    if (loc) return buildReply(ctx, loc.summary, 'locate', technique + ' · place resolution', false);
  }

  if (kind && kind !== CampusPin.Kind.EVENT) {
    var nearText = after(q, /\b(to|near|nearby|close to|around|at|in|by)\b/);
    var res = toolSearchPins(ctx, kind, tagQuery(q), nearText);
    if (!res.pins.length) return buildReply(ctx, 'I could not find any ' + String(kind).toLowerCase() + ' pins' + (nearText ? ' near ' + nearText : '') + '.', 'find_nearest', technique, false);
    return buildReply(ctx, res.summary, 'find_nearest', technique + ' · nearest-pin ranking', false);
  }

  if (eventAsk) {
    var topic = topicWords(q);
    var ev = toolSearchPins(ctx, CampusPin.Kind.EVENT, topic.join(' '), null);
    if (!ev.pins.length) return buildReply(ctx, 'No events match "' + topic.join(' ') + '" today. Try "robotics", "music", or "career".', 'events_about', technique, false);
    return buildReply(ctx, ev.summary, 'events_about', technique + ' · keyword + synonym search', false);
  }

  return buildReply(
    ctx,
    'Try: "closest bathroom to Hunt Library 2nd floor", "anything interesting related to robotics today?", ' +
      '"avoid crowds getting to Gates 5th floor", "will Sorrells be busy?", or "it\'s raining, where should I study?"',
    'help',
    technique,
    false
  );
}

function parseScenario(q) {
  var change = null;
  if (/\b(rain|raining|rainy|storm|pouring|wet)\b/.test(q)) {
    change = change || {};
    change.rain = !/\b(stop|stopped|off|no longer|cleared|sunny|clear|not raining)\b/.test(q);
  }
  if (/\b(sunny|clear skies|stopped raining|rain off)\b/.test(q)) {
    change = change || {};
    change.rain = false;
  }
  if (/\b(exam|exams|finals)\b/.test(q)) {
    change = change || {};
    change.examWeek = !/\b(over|done|finished|off)\b/.test(q);
  }
  if (/\b(big event|event nearby|concert nearby|carnival)\b/.test(q)) {
    change = change || {};
    change.eventNearby = true;
  }
  return change;
}

function pinKindFor(q) {
  if (/\b(bathroom|bathrooms|restroom|restrooms|toilet|toilets|washroom)\b/.test(q)) return CampusPin.Kind.BATHROOM;
  if (/\b(printer|printers|print|printing)\b/.test(q)) return CampusPin.Kind.PRINTER;
  if (/\b(food|eat|snack|snacks|pizza|hungry|bagels|coffee|boba|lunch|free stuff)\b/.test(q)) return CampusPin.Kind.FOOD;
  if (/\b(study|studying|work on|library seat|desk)\b/.test(q)) return CampusPin.Kind.STUDY;
  if (/\b(event|events|happening|talk|showcase|fair|demo day|concert)\b/.test(q)) return CampusPin.Kind.EVENT;
  return null;
}

function tagQuery(q) {
  var tags = [];
  if (/\bgender[- ]?neutral|all[- ]gender\b/.test(q)) tags.push('gender-neutral');
  if (/\bcolou?r\b/.test(q)) tags.push('color');
  if (/\bquiet\b/.test(q)) tags.push('quiet');
  if (/\bgroup\b/.test(q)) tags.push('group');
  if (/\bstep[- ]?free|accessible|wheelchair\b/.test(q)) tags.push('step-free');
  return tags.join(' ');
}

function topicWords(q) {
  var words = q.split(' ').filter(function (w) {
    return w.length > 2 && STOPWORDS.indexOf(w) < 0;
  });
  return words;
}

function after(q, re) {
  var m = re.exec(q);
  if (!m) return null;
  var rest = q.substring(m.index + m[0].length).trim();
  return rest.length ? rest : null;
}

/* ---------------------------------------------------------------- tools shared by both paths ---------------------------------------------------------------- */

function toolSearchPins(ctx, kind, query, nearText) {
  var anchor = nearText ? placeFor(nearText) : null;
  var origin = anchor ? { lng: anchor.node ? anchor.node.lng : anchor.building.lng, lat: anchor.node ? anchor.node.lat : anchor.building.lat } : ctx.near;
  var filter = kind ? Filter.eq('kind', kind) : null;
  var pins = CampusPin.fetch({ filter: filter, include: PIN_INCLUDE, limit: 200 }).objs;
  var words = expandQuery(query);
  var scored = [];
  pins.each(function (p) {
    var relevance = words.length ? relevanceOf(p, words) : 1;
    if (words.length && relevance === 0 && kind !== CampusPin.Kind.EVENT) relevance = 0.05;
    if (relevance === 0) return;
    var distance = haversineM(origin.lng, origin.lat, p.lng, p.lat);
    if (anchor && anchor.floor && p.building && anchor.building && p.building.code === anchor.building.code) {
      distance += Math.abs(floorIndex(anchor.floor) - floorIndex(p.floor || '1')) * 25;
    } else if (p.floor) {
      distance += 40;
    }
    scored.push({ pin: p, distance: distance, relevance: relevance });
  });
  scored.sort(function (a, b) {
    if (kind === CampusPin.Kind.EVENT && words.length) return b.relevance - a.relevance || a.distance - b.distance;
    return b.relevance * 1000 - a.relevance * 1000 + (a.distance - b.distance) / 10;
  });
  var top = scored.slice(0, 3);
  var result = { pins: [], summary: '' };
  top.forEach(function (s, i) {
    var p = s.pin;
    result.pins.push({
      id: p.id,
      name: p.name,
      kind: p.kind,
      building: p.building ? p.building.name : null,
      floor: p.floor || null,
      details: p.details,
      distance_m: Math.round(s.distance),
      starts_at: p.startsAt ? p.startsAt.toString() : null,
      expires_at: p.expiresAt ? p.expiresAt.toString() : null,
      data_status: p.dataStatus,
    });
    ctx.pins.push(p);
    if (i === 0) {
      ctx.actions.push(action(CampusPulse.MapAction.Kind.SET_LAYER, { layer: layerFor(p.kind) }));
      ctx.actions.push(action(CampusPulse.MapAction.Kind.FLY_TO, { lng: p.lng, lat: p.lat, zoom: 18, targetId: p.id, label: p.name }));
      ctx.actions.push(action(CampusPulse.MapAction.Kind.OPEN_PIN, { targetId: p.id, label: p.name }));
      if (anchor && anchor.node && kind !== CampusPin.Kind.EVENT) {
        var dest = NavNode.nearest(p.lng, p.lat, p.building ? p.building.code : null, p.floor || null);
        if (dest && dest.id !== anchor.node.id) {
          ctx.actions.push(action(CampusPulse.MapAction.Kind.DRAW_ROUTE, { fromNodeId: anchor.node.id, toNodeId: dest.id, mode: NavRoute.Mode.FAST, stepFree: hasTag(p, 'step-free') }));
        }
      }
    } else {
      ctx.actions.push(action(CampusPulse.MapAction.Kind.HIGHLIGHT, { targetId: p.id, label: p.name }));
    }
  });
  if (top.length) {
    var best = top[0].pin;
    var where = (best.building ? best.building.name : 'outdoors') + (best.floor ? ', floor ' + best.floor : '');
    if (kind === CampusPin.Kind.EVENT) {
      var names = top.map(function (s) {
        return s.pin.name + ' (' + (s.pin.building ? s.pin.building.name : 'the Cut') + (s.pin.startsAt ? ', ' + timeLabel(s.pin.startsAt) : '') + ')';
      });
      result.summary = (words.length ? 'Related to "' + query + '": ' : 'Happening today: ') + names.join('; ') + '.';
    } else {
      result.summary =
        (anchor ? 'Closest ' + String(kind).toLowerCase() + ' to ' + anchor.matchedText + ': ' : 'Nearest ' + String(kind).toLowerCase() + ': ') +
        best.name +
        ' — ' +
        where +
        ', about ' +
        Math.round(top[0].distance) +
        ' m away.' +
        (best.details ? ' ' + best.details : '');
    }
  }
  return result;
}

function toolRoute(ctx, fromText, toText, mode, stepFree) {
  var dest = toText ? placeFor(toText) : null;
  if (!dest || !dest.node) return { error: 'I could not find "' + (toText || '') + '" on the campus map. Try a building name like Gates or Hunt Library.' };
  var origin = fromText ? placeFor(fromText) : null;
  var fromNode = origin && origin.node ? origin.node : NavNode.nearest(ctx.near.lng, ctx.near.lat, null, null);
  var routeMode = mode === NavRoute.Mode.CALM || mode === 'Calm' ? NavRoute.Mode.CALM : NavRoute.Mode.FAST;
  var route = NavRoute.compute(fromNode.id, dest.node.id, routeMode, !!stepFree, ctx.scenario);
  ctx.route = route;
  if (route.unreachable) return { error: 'No ' + (stepFree ? 'step-free ' : '') + 'route reaches ' + dest.matchedText + ' in the demo graph.' };
  ctx.actions.push(action(CampusPulse.MapAction.Kind.SET_LAYER, { layer: 'route' }));
  if (dest.room) ctx.actions.push(action(CampusPulse.MapAction.Kind.SELECT_ROOM, { targetId: dest.room.id, floor: dest.room.floor, label: dest.room.name }));
  else if (dest.floor) ctx.actions.push(action(CampusPulse.MapAction.Kind.SELECT_BUILDING, { targetId: dest.building.id, floor: dest.floor, label: dest.building.name }));
  ctx.actions.push(action(CampusPulse.MapAction.Kind.DRAW_ROUTE, { fromNodeId: fromNode.id, toNodeId: dest.node.id, mode: routeMode, stepFree: !!stepFree }));
  var firstStep = route.steps && route.steps.length ? route.steps.first().text : '';
  var summary =
    (routeMode === NavRoute.Mode.CALM ? 'Calm route' : 'Fast route') +
    ' to ' +
    dest.matchedText +
    ': about ' +
    route.etaMinutes +
    ' min, ' +
    route.distanceM +
    ' m' +
    (route.crowdPenaltyMin > 0 ? ', detouring ' + route.crowdPenaltyMin + ' min around crowds' : '') +
    (stepFree ? ', step-free' : '') +
    '. First: ' +
    firstStep +
    '.';
  return {
    summary: summary,
    eta_minutes: route.etaMinutes,
    distance_m: route.distanceM,
    mode: String(routeMode),
    step_free: !!stepFree,
    steps: toJsArray(route.steps).map(function (st) {
      return st.text;
    }),
  };
}

function toolForecast(ctx, placeText) {
  var place = placeText ? placeFor(placeText) : null;
  if (!place || !place.zone) return { error: 'I could not match "' + (placeText || '') + '" to a crowd zone. Try Sorrells, Hunt Library, Gates, or the Cut.' };
  var forecast = place.zone.forecast(ctx.scenario, 180);
  ctx.forecast = forecast;
  ctx.actions.push(action(CampusPulse.MapAction.Kind.SET_LAYER, { layer: 'crowd' }));
  ctx.actions.push(action(CampusPulse.MapAction.Kind.FLY_TO, { lng: place.zone.lng, lat: place.zone.lat, zoom: 17.5, targetId: place.zone.id, label: place.zone.name }));
  ctx.actions.push(action(CampusPulse.MapAction.Kind.SHOW_FORECAST, { targetId: place.zone.id, label: place.zone.name }));
  var drivers = toJsArray(forecast.drivers).map(function (d) {
    return d.label + ' (' + (d.contribution >= 0 ? '+' : '') + Math.round(d.contribution * 100) + '%)';
  });
  var summary = place.zone.name + ' is at ' + pct(forecast.nowFraction) + ' now';
  if (forecast.timeToCapacityMin != null) summary += ' and reaches capacity at ' + forecast.capacityAtLabel;
  else summary += ' and peaks at ' + pct(forecast.peakFraction) + ' in the next 3 hours';
  summary += '. Drivers: ' + drivers.slice(0, 3).join(', ') + '.';
  if (forecast.peakFraction >= 0.7 && place.zone.studySpace) {
    var rec = place.zone.recommend(ctx.scenario);
    ctx.recommendation = rec;
    if (!rec.alternatives.isEmpty()) {
      var alt = rec.alternatives.first();
      summary += ' Try ' + alt.zone.name + ' instead: ' + pct(alt.predictedFraction) + ', ' + Math.round(alt.walkMinutes) + ' min away.';
    }
  }
  return { summary: summary, now: forecast.nowFraction, peak: forecast.peakFraction, capacity_at: forecast.capacityAtLabel, drivers: drivers };
}

function toolRecommend(ctx, placeText) {
  var place = placeText ? placeFor(placeText) : null;
  if (!place || !place.zone || !place.zone.studySpace) return toolQuietStudy(ctx);
  var originZone = place.zone;
  var rec = originZone.recommend(ctx.scenario);
  ctx.recommendation = rec;
  ctx.forecast = rec.originForecast;
  ctx.actions.push(action(CampusPulse.MapAction.Kind.SET_LAYER, { layer: 'crowd' }));
  ctx.actions.push(action(CampusPulse.MapAction.Kind.SHOW_FORECAST, { targetId: originZone.id, label: originZone.name }));
  if (!rec.alternatives.isEmpty()) {
    var best = rec.alternatives.first().zone;
    ctx.actions.push(action(CampusPulse.MapAction.Kind.FLY_TO, { lng: best.lng, lat: best.lat, zoom: 17.5, targetId: best.id, label: best.name }));
    ctx.actions.push(action(CampusPulse.MapAction.Kind.HIGHLIGHT, { targetId: best.id, label: best.name }));
  }
  return {
    summary: rec.summary,
    alternatives: toJsArray(rec.alternatives).map(function (a) {
      return { name: a.zone.name, predicted: a.predictedFraction, walk_minutes: a.walkMinutes, reason: a.reason };
    }),
  };
}

function toolCrowd(ctx) {
  var states = CrowdZone.simulate(ctx.scenario);
  ctx.actions.push(action(CampusPulse.MapAction.Kind.SET_LAYER, { layer: 'crowd' }));
  return {
    zones: toJsArray(states).map(function (st) {
      return { name: st.zone.name, fraction: st.fraction, level: st.level, trend: st.trend };
    }),
  };
}

function toolSetScenario(ctx, rain, eventNearby, examWeek) {
  var s = ctx.scenario;
  ctx.scenario = CampusPulse.Scenario.make({
    minuteOfDay: s.minuteOfDay,
    rain: rain == null ? s.rain : !!rain,
    eventNearby: eventNearby == null ? s.eventNearby : !!eventNearby,
    examWeek: examWeek == null ? s.examWeek : !!examWeek,
    seed: s.seed,
  });
  ctx.actions.push(action(CampusPulse.MapAction.Kind.SET_SCENARIO, { rain: ctx.scenario.rain, eventNearby: ctx.scenario.eventNearby, examWeek: ctx.scenario.examWeek }));
  return { rain: ctx.scenario.rain, event_nearby: ctx.scenario.eventNearby, exam_week: ctx.scenario.examWeek };
}

function toolQuietStudy(ctx) {
  var states = [];
  CrowdZone.simulate(ctx.scenario).each(function (st) {
    if (st.zone.studySpace) states.push(st);
  });
  states.sort(function (a, b) {
    return a.fraction - b.fraction;
  });
  if (!states.length) throw new Error('No study-space zones are seeded');
  var top = states.slice(0, 3);
  var best = top[0];
  ctx.actions.push(action(CampusPulse.MapAction.Kind.SET_LAYER, { layer: 'crowd' }));
  ctx.actions.push(action(CampusPulse.MapAction.Kind.FLY_TO, { lng: best.zone.lng, lat: best.zone.lat, zoom: 17.5, targetId: best.zone.id, label: best.zone.name }));
  ctx.actions.push(action(CampusPulse.MapAction.Kind.SHOW_FORECAST, { targetId: best.zone.id, label: best.zone.name }));
  top.slice(1).forEach(function (st) {
    ctx.actions.push(action(CampusPulse.MapAction.Kind.HIGHLIGHT, { targetId: st.zone.id, label: st.zone.name }));
  });
  ctx.forecast = best.zone.forecast(ctx.scenario, 180);
  var summary =
    'Quietest study spaces right now' +
    (ctx.scenario.rain ? ' (rain is pushing people indoors)' : '') +
    ': ' +
    top
      .map(function (st) {
        return st.zone.name + ' ' + pct(st.fraction) + (st.trend === 'rising' ? ' ↑' : st.trend === 'falling' ? ' ↓' : '');
      })
      .join(', ') +
    '.';
  return {
    summary: summary,
    alternatives: top.map(function (st) {
      return { name: st.zone.name, predicted: st.fraction, trend: st.trend };
    }),
  };
}

function toolLocate(ctx, text) {
  var place = placeFor(text);
  if (!place || !place.node) return null;
  if (place.room) {
    var r = place.room;
    ctx.actions.push(action(CampusPulse.MapAction.Kind.FLY_TO, { lng: r.labelLng, lat: r.labelLat, zoom: 18.6, targetId: r.id, label: r.name }));
    ctx.actions.push(action(CampusPulse.MapAction.Kind.SELECT_ROOM, { targetId: r.id, floor: r.floor, label: r.name }));
    var detail = [r.number ? 'room ' + r.number : null, r.areaSqFt ? thousands(r.areaSqFt) + ' sq ft' : null, r.department || null].filter(function (x) {
      return !!x;
    });
    var roomSummary =
      r.name +
      ' is on ' +
      (r.floor === 'LL' ? 'the lower level' : 'floor ' + r.floor) +
      ' of ' +
      r.building.name +
      (detail.length ? ' (' + detail.join(', ') + ')' : '') +
      ' — highlighted on the floor plan.' +
      (r.nameSource === CampusBuilding.Room.NameSource.INFERRED ? ' The name is inferred from the plan, not printed on it.' : '') +
      ' Say "navigate to ' +
      r.name +
      '" for a route.';
    return { summary: roomSummary, building: r.building.name, room: r.name, floor: r.floor };
  }
  var target = place.building || place.node;
  ctx.actions.push(action(CampusPulse.MapAction.Kind.FLY_TO, { lng: target.lng, lat: target.lat, zoom: place.building ? 17.6 : 18, targetId: place.building ? place.building.id : place.node.id, label: place.matchedText }));
  if (place.building) ctx.actions.push(action(CampusPulse.MapAction.Kind.SELECT_BUILDING, { targetId: place.building.id, floor: place.floor || null, label: place.building.name }));
  else ctx.actions.push(action(CampusPulse.MapAction.Kind.HIGHLIGHT, { targetId: place.node.id, label: place.matchedText }));
  var summary;
  if (place.building) {
    var floors = place.building.floorLabels && place.building.floorLabels.length ? place.building.floorLabels.length + ' floors' : 'no floor list';
    summary = place.building.name + ' (' + place.building.code + ') is highlighted on the map — ' + floors + (place.floor ? ', showing floor ' + place.floor : '') + '. Say "navigate to ' + place.building.name + '" for a route.';
  } else {
    summary = place.matchedText.charAt(0).toUpperCase() + place.matchedText.slice(1) + ' is highlighted on the map.';
  }
  if (place.zone) {
    var st = null;
    CrowdZone.simulate(ctx.scenario).each(function (x) {
      if (x.zone.id === place.zone.id) st = x;
    });
    if (st) summary += ' Currently ' + pct(st.fraction) + ' full (simulated).';
  }
  return { summary: summary, building: place.building ? place.building.name : null };
}

function toolOpenPin(ctx, pin) {
  ctx.pins.push(pin);
  ctx.actions.push(action(CampusPulse.MapAction.Kind.SET_LAYER, { layer: layerFor(pin.kind) }));
  ctx.actions.push(action(CampusPulse.MapAction.Kind.FLY_TO, { lng: pin.lng, lat: pin.lat, zoom: 18, targetId: pin.id, label: pin.name }));
  ctx.actions.push(action(CampusPulse.MapAction.Kind.OPEN_PIN, { targetId: pin.id, label: pin.name }));
  var where = (pin.building ? pin.building.name : 'outdoors') + (pin.floor ? ', floor ' + pin.floor : '');
  var when = '';
  if (pin.startsAt) when = ' Starts ' + timeLabel(pin.startsAt) + (pin.expiresAt ? ', until ' + timeLabel(pin.expiresAt) : '') + '.';
  var summary = pin.name + ' — ' + String(pin.kind).toLowerCase() + ' at ' + where + '.' + (pin.details ? ' ' + pin.details : '') + when + (pin.dataStatus === CampusPulse.DataStatus.SYNTHETIC ? ' (Demo data.)' : '');
  return { summary: summary, id: pin.id, name: pin.name };
}

function matchPinName(q) {
  var best = null;
  var bestScore = 0;
  CampusPin.fetch({ include: PIN_INCLUDE, limit: 200 }).objs.each(function (p) {
    var tokens = String(p.name)
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(function (t) {
        return t.length > 2 && STOPWORDS.indexOf(t) < 0;
      });
    if (tokens.length < 2) return;
    var hits = tokens.filter(function (t) {
      return wordIndex(q, t) >= 0;
    }).length;
    var score = hits / tokens.length;
    if (hits >= 2 && score >= 0.75 && score > bestScore) {
      bestScore = score;
      best = p;
    }
  });
  return best;
}

function busiestStudyZone(ctx) {
  var worst = null;
  CrowdZone.simulate(ctx.scenario).each(function (st) {
    if (!st.zone.studySpace) return;
    if (!worst || st.fraction > worst.fraction) worst = st;
  });
  if (!worst) throw new Error('No study-space zones are seeded');
  return worst.zone;
}

/* ---------------------------------------------------------------- place resolution ---------------------------------------------------------------- */

function placeFor(text) {
  var q = String(text || '').toLowerCase();
  var best = null;
  ALIASES.forEach(function (alias) {
    alias.terms.forEach(function (term) {
      var idx = wordIndex(q, term);
      if (idx >= 0 && (!best || term.length > best.term.length)) best = { alias: alias, term: term, index: idx };
    });
  });
  // A named room wins when the text names it outright, or when the only building mentioned is the room's own.
  var room = matchRoom(q);
  if (room && (!best || best.alias.code === room.room.building.code || room.score >= 1)) return placeForRoom(room.room);
  if (!best) {
    var landmark = null;
    LANDMARKS.forEach(function (l) {
      l.match.forEach(function (m) {
        if (wordIndex(q, m) >= 0 && (!landmark || m.length > landmark.term.length)) landmark = { label: l.label, term: m };
      });
    });
    if (!landmark) return null;
    var node = landmarkNode(landmark.label);
    if (!node) return null;
    return CampusPulse.Place.make({ node: node, zone: zoneNear(node), matchedText: landmark.label });
  }
  var building = CampusBuilding.fetch({ filter: Filter.eq('code', best.alias.code), include: BUILDING_INCLUDE, limit: 1 }).objs.first();
  if (!building) return null;
  var numbered = roomByNumber(q, building.code);
  if (numbered) return placeForRoom(numbered);
  var floor = parseFloor(q) || (best.alias.floorTerms ? best.alias.floorTerms[best.term] : null);
  // Without a floor, a building destination means its entrance, not whichever room node is nearest its centroid.
  var node = (!floor && entranceNode(building)) || NavNode.nearest(building.lng, building.lat, building.code, floor);
  var zone = zoneForBuilding(building, floor);
  return CampusPulse.Place.make({ building: building, floor: floor || null, node: node, zone: zone, matchedText: building.name + (floor ? ' floor ' + floor : '') });
}

function parseFloor(q) {
  if (/\b(lower level|basement)\b/.test(q)) return 'LL';
  var m = /\b(\d{1,2})(?:st|nd|rd|th)?\s*(?:floor|fl|f)\b/.exec(q) || /\bfloor\s*(\d{1,2})\b/.exec(q) || /\b(\d)f\b/.exec(q) || /\blevel\s*(\d{1,2})\b/.exec(q);
  return m ? m[1] : null;
}

/* Words that do not identify a room on their own ("Schatz Dining Room" is found by "schatz"). */
var ROOM_STOPWORDS = (
  'room rooms rm the of and a an dining service services storage office center centre corridor stairs stair elev elevator ' +
  'restroom restrooms women men womens mens cohon university cuc right left main floor level lower studio'
).split(' ');
/* Everyday words for rooms whose plan names differ. Each adds the plan's word to the query. */
var ROOM_SYNONYMS = [
  { re: /\b(post office|mailroom|mail room|mail)\b/, add: 'postal' },
  { re: /\b(gym|basketball)\b/, add: 'gymnasium' },
  { re: /\b(swimming|swim)\b/, add: 'pool' },
  { re: /\b(nursing|pumping)\b/, add: 'lactation' },
  { re: /\b(abp|au bon pain)\b/, add: 'bon pain' },
  { re: /\b(ballroom)\b/, add: 'rangos' },
  { re: /\b(auditorium)\b/, add: 'mcconomy' },
];
var ROOM_INCLUDE =
  'id, building.id, building.code, building.name, building.lng, building.lat, building.floorLabels, building.schematicFloors, floor, number, name, kind, ' +
  'spaceType, areaSqFt, department, nameSource, labelLng, labelLat, navNode.id, navNode.lng, navNode.lat, navNode.kind, navNode.label, navNode.floor';

/**
 * Best named room for free text, or null. Only rooms whose names came from the floor plan or a flagged inference are
 * candidates; generated names ("Office 302") are not. Score = share of the room's identifying words found in the text.
 */
function matchRoom(q) {
  var text = q;
  ROOM_SYNONYMS.forEach(function (s) {
    if (s.re.test(q)) text += ' ' + s.add;
  });
  var num = /\b(?:room|rm)\s*(ll\d{2}[a-z]{0,2}|[1-3]\d{2}[a-z]?)\b/.exec(text);
  var best = null;
  CampusBuilding.Room.fetchObjStream({
    filter: Filter.intersects('nameSource', [CampusBuilding.Room.NameSource.FLOOR_PLAN, CampusBuilding.Room.NameSource.INFERRED]),
    include: ROOM_INCLUDE,
  }).each(function (r) {
    if (r.kind === CampusBuilding.Room.Kind.UTILITY || r.kind === CampusBuilding.Room.Kind.STAIRS || r.kind === CampusBuilding.Room.Kind.ELEVATOR) return;
    var tokens = String(r.name)
      .toLowerCase()
      .replace(/'s\b/g, '')
      .split(/[^a-z0-9]+/)
      .filter(function (t) {
        return t.length > 2 && ROOM_STOPWORDS.indexOf(t) < 0 && !/^\d+$/.test(t);
      });
    if (!tokens.length) return;
    var hits = tokens.filter(function (t) {
      return wordIndex(text, t) >= 0;
    }).length;
    var numberHit = num && r.number && String(r.number).toLowerCase() === num[1] ? 1 : 0;
    var digits = String(r.name).match(/\b\d+\b/);
    var digitHit = digits && wordIndex(text, digits[0]) >= 0 ? 0.5 : 0;
    var score = numberHit ? 1 : hits / tokens.length;
    if (!numberHit && (hits === 0 || score < 0.5)) return;
    var rank = score * 10 + hits + digitHit + (r.areaSqFt || 0) / 100000;
    if (!best || rank > best.rank) best = { room: r, score: score, rank: rank };
  });
  return best;
}

/**
 * Room in `buildingCode` whose plan number appears in the text ("Wean 5403", "Hunt room A24", "NSH 1305"), or null.
 * Course numbers such as "15-122" are ignored (a hyphen next to the token disqualifies it).
 */
function roomByNumber(q, buildingCode) {
  var re = /\b([a-z]{0,3}\d{3,4}[a-z]?|[a-z]\d{1,2}[a-z]?)\b/g;
  var m;
  var tokens = [];
  while ((m = re.exec(q))) {
    var before = q.charAt(m.index - 1);
    var after = q.charAt(m.index + m[0].length);
    if (before === '-' || after === '-' || /^(rm|fl)$/.test(m[1])) continue;
    tokens.push(m[1].toUpperCase());
  }
  for (var i = 0; i < tokens.length; i++) {
    var res = CampusBuilding.Room.fetch({ filter: Filter.eq('building.code', buildingCode).and(Filter.eq('number', tokens[i])), include: ROOM_INCLUDE, limit: 1 });
    if (!res.objs.isEmpty()) return res.objs.first();
  }
  return null;
}

/** Door node of a building nearest its label point, or null when the building has no modelled entrance. */
function entranceNode(building) {
  var best = null;
  var bestD = Infinity;
  NavNode.fetchObjStream({
    filter: Filter.eq('building.code', building.code).and(Filter.eq('kind', NavNode.Kind.DOOR)),
    include: 'id, lng, lat, kind, label, building.id, building.code, building.name, floor, zone.id',
  }).each(function (n) {
    var d = haversineM(n.lng, n.lat, building.lng, building.lat);
    if (d < bestD) {
      bestD = d;
      best = n;
    }
  });
  return best;
}

function placeForRoom(room) {
  var node = room.navNode && room.navNode.id ? room.navNode : NavNode.nearest(room.labelLng, room.labelLat, room.building.code, room.floor);
  var building = room.building;
  return CampusPulse.Place.make({
    building: building,
    floor: room.floor,
    room: room,
    node: node,
    zone: zoneForBuilding(building, room.floor),
    matchedText: room.name + ' (' + building.name + ', ' + floorPhrase(room.floor) + ')',
  });
}

function thousands(n) {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function floorPhrase(floor) {
  return floor === 'LL' ? 'lower level' : 'floor ' + floor;
}

function zoneForBuilding(building, floor) {
  var zones = CrowdZone.fetch({ filter: Filter.eq('building', building.id), include: ZONE_INCLUDE, limit: 20 }).objs;
  if (zones.isEmpty()) return null;
  var match = null;
  zones.each(function (z) {
    if (floor && z.floor === floor) match = z;
  });
  if (match) return match;
  zones.each(function (z) {
    if (!match && !z.floor) match = z;
  });
  return match || zones.first();
}

function landmarkNode(label) {
  var res = NavNode.fetch({ filter: Filter.eq('kind', NavNode.Kind.LANDMARK), include: 'id, lng, lat, kind, label, floor, zone.id', limit: 20 }).objs;
  var found = null;
  res.each(function (n) {
    if (n.label && n.label.toLowerCase() === label) found = n;
  });
  return found;
}

function zoneNear(node) {
  var best = null;
  var bestD = Infinity;
  CrowdZone.fetch({ filter: Filter.eq('kind', CrowdZone.Kind.QUAD), include: ZONE_INCLUDE, limit: 20 }).objs.each(function (z) {
    var d = haversineM(node.lng, node.lat, z.lng, z.lat);
    if (d < bestD) {
      bestD = d;
      best = z;
    }
  });
  return best;
}

/* ---------------------------------------------------------------- helpers ---------------------------------------------------------------- */

function newContext(scenario, nearLng, nearLat) {
  var s = scenario || CampusPulse.Scenario.make({});
  var minute = s.minuteOfDay == null ? DateTime.now().withZoneOffset(-300).minuteOfDay : s.minuteOfDay;
  return {
    scenario: CampusPulse.Scenario.make({ minuteOfDay: minute, rain: !!s.rain, eventNearby: !!s.eventNearby, examWeek: !!s.examWeek, seed: s.seed || 0 }),
    near: nearLng != null && nearLat != null ? { lng: nearLng, lat: nearLat } : FENCE,
    actions: [],
    pins: [],
    route: null,
    forecast: null,
    recommendation: null,
  };
}

function buildReply(ctx, text, intent, technique, usedLlm) {
  var actions = CampusPulse.MapAction.arrayBuilder();
  ctx.actions.forEach(function (a) {
    actions.add(a);
  });
  var pins = CampusPin.arrayBuilder();
  var seen = {};
  ctx.pins.forEach(function (p) {
    if (!seen[p.id]) {
      seen[p.id] = true;
      pins.add(p);
    }
  });
  return CampusPulse.AssistantReply.make({
    text: text,
    intent: intent,
    technique: technique,
    usedLlm: !!usedLlm,
    actions: actions.build(),
    pins: pins.build(),
    route: ctx.route,
    forecast: ctx.forecast,
    recommendation: ctx.recommendation,
  });
}

function action(kind, props) {
  var spec = { kind: kind };
  Object.keys(props || {}).forEach(function (k) {
    if (props[k] !== undefined) spec[k] = props[k];
  });
  return CampusPulse.MapAction.make(spec);
}

function layerFor(kind) {
  if (kind === CampusPin.Kind.FOOD) return 'food';
  if (kind === CampusPin.Kind.EVENT) return 'events';
  if (kind === CampusPin.Kind.BATHROOM) return 'bathrooms';
  if (kind === CampusPin.Kind.PRINTER) return 'printers';
  return 'study';
}

function expandQuery(query) {
  if (!query) return [];
  var words = String(query)
    .toLowerCase()
    .split(/[^a-z0-9\-']+/)
    .filter(function (w) {
      return w.length > 2 && STOPWORDS.indexOf(w) < 0;
    });
  var expanded = [];
  words.forEach(function (w) {
    expanded.push(w);
    Object.keys(SYNONYMS).forEach(function (key) {
      var list = SYNONYMS[key];
      if (w === key || w.indexOf(key) === 0 || list.indexOf(w) >= 0) {
        expanded.push(key);
        list.forEach(function (syn) {
          expanded.push(syn);
        });
      }
    });
  });
  return expanded;
}

function relevanceOf(pin, words) {
  var hay = (pin.name + ' ' + (pin.details || '') + ' ' + (pin.tags ? pin.tags.toString(' ') : '')).toLowerCase();
  var score = 0;
  words.forEach(function (w) {
    if (hay.indexOf(w) >= 0) score += 1;
  });
  return score;
}

function hasTag(pin, tag) {
  return !!pin.tags && pin.tags.contains(tag);
}

function scenarioText(s) {
  return (
    'Scenario updated: rain ' +
    (s.rain ? 'on — people move indoors, libraries fill sooner' : 'off') +
    (s.eventNearby ? ', event nearby' : '') +
    (s.examWeek ? ', exam week' : '') +
    '. The crowd layer, forecast, and Calm routes have been recomputed.'
  );
}

function wordIndex(q, term) {
  var idx = q.indexOf(term);
  while (idx >= 0) {
    var before = idx === 0 ? ' ' : q.charAt(idx - 1);
    var after = idx + term.length >= q.length ? ' ' : q.charAt(idx + term.length);
    if (!/[a-z0-9]/.test(before) && !/[a-z0-9]/.test(after)) return idx;
    idx = q.indexOf(term, idx + 1);
  }
  return -1;
}

function floorIndex(label) {
  if (label === 'LL') return 0;
  var n = parseInt(label, 10);
  return isNaN(n) ? 1 : n;
}

function haversineM(lng1, lat1, lng2, lat2) {
  var R = 6371000;
  var toRad = Math.PI / 180;
  var dLat = (lat2 - lat1) * toRad;
  var dLng = (lng2 - lng1) * toRad;
  var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function clockLabel(minute) {
  var m = ((Math.round(minute) % 1440) + 1440) % 1440;
  var h = Math.floor(m / 60);
  var mm = m % 60;
  return (h % 12 === 0 ? 12 : h % 12) + ':' + (mm < 10 ? '0' : '') + mm + ' ' + (h >= 12 ? 'PM' : 'AM');
}

function timeLabel(dt) {
  var local = dt.withZoneOffset(-300);
  return clockLabel(local.minuteOfDay);
}

function pct(fraction) {
  return Math.round(fraction * 100) + '%';
}

function shortError(e) {
  var msg = String((e && e.message) || e || 'unknown error');
  var parts = msg.split(/Exception: |Error: /);
  return truncate(parts[parts.length - 1].trim(), 120);
}

function truncate(str, n) {
  var s = String(str || '');
  return s.length > n ? s.substring(0, n) + '…' : s;
}

function toJsArray(c3Array) {
  var out = [];
  if (!c3Array) return out;
  c3Array.each(function (item) {
    out.push(item);
  });
  return out;
}
