/**
 * Unit tests for the CampusPulse assistant (deterministic parser path) and place resolution.
 */
const filename = 'test_CampusPulse';

describe(filename, function () {
  beforeAll(function () {
    this.ctx = TestApi.createContext(filename);
    this.scenario = CampusPulse.Scenario.make({ minuteOfDay: 850, rain: false, eventNearby: false, examWeek: false, seed: 1 });
    var ask = (q) => CampusPulse.ask(q, this.scenario, null, null);
    this.robotics = ask('anything interesting related to robotics today?');
    this.bathroom = ask('closest bathroom to Hunt Library 2nd floor');
    this.printer = ask('where can I print in colour near Wean?');
    this.calmRoute = ask('avoid crowds getting to Gates 5th floor');
    this.rainStudy = ask("it's raining, where should I study?");
    this.forecast = ask('will Sorrells be busy?');
    this.locate = ask('where is Doherty Hall');
    this.help = ask('xyzzy');
    this.sorrellsPlace = CampusPulse.resolvePlace('sorrells');
    this.gatesPlace = CampusPulse.resolvePlace('late for 15-122 in Gates 5th floor');
  });

  afterAll(function () {
    TestApi.teardown(this.ctx);
  });

  describe('#ask', function () {
    it('finds robotics events by topic', function () {
      expect(this.robotics.intent).toBe('events_about');
    });

    it('returns only event pins for a topic question', function () {
      this.robotics.pins.each((p) => {
        expect(p.kind).withContext(p.name).toBe(CampusPin.Kind.EVENT);
      });
    });

    it('opens the best match on the map', function () {
      var kinds = this.robotics.actions.mapToStr((a) => a.kind);
      expect(kinds.contains(CampusPulse.MapAction.Kind.OPEN_PIN)).toBeTrue();
    });

    it('picks the Hunt 2F restroom as the closest bathroom to Hunt Library floor 2', function () {
      expect(this.bathroom.pins.first().id).toBe('pin_bath_hl2');
    });

    it('draws a route to the bathroom it found', function () {
      var kinds = this.bathroom.actions.mapToStr((a) => a.kind);
      expect(kinds.contains(CampusPulse.MapAction.Kind.DRAW_ROUTE)).toBeTrue();
    });

    it('only returns colour printers when colour is requested', function () {
      expect(this.printer.pins.first().tags.contains('color')).toBeTrue();
    });

    it('uses Calm mode when the user wants to avoid crowds', function () {
      var draw = null;
      this.calmRoute.actions.each((a) => {
        if (a.kind === CampusPulse.MapAction.Kind.DRAW_ROUTE) draw = a;
      });
      expect(draw.mode).toBe(NavRoute.Mode.CALM);
    });

    it('turns rain on and recommends a study space in one answer', function () {
      var kinds = this.rainStudy.actions.mapToStr((a) => a.kind);
      expect(kinds.contains(CampusPulse.MapAction.Kind.SET_SCENARIO) && this.rainStudy.intent === 'recommend').toBeTrue();
    });

    it('returns a forecast for a crowding question', function () {
      expect(this.forecast.forecast.zone.id).toBe('zone_sorrells');
    });

    it('selects the building for a "where is" question', function () {
      var kinds = this.locate.actions.mapToStr((a) => a.kind);
      expect(kinds.contains(CampusPulse.MapAction.Kind.SELECT_BUILDING)).toBeTrue();
    });

    it('falls back to help for nonsense', function () {
      expect(this.help.intent).toBe('help');
    });

    it('reports the deterministic technique when no LLM is configured', function () {
      if (CampusPulse.llmStatus().configured) pending('LLM configured in this environment');
      expect(this.help.usedLlm).toBeFalse();
    });
  });

  describe('#resolvePlace', function () {
    it('maps "sorrells" to Wean Hall floor 4', function () {
      expect(this.sorrellsPlace.building.code + '/' + this.sorrellsPlace.floor).toBe('WEH/4');
    });

    it('parses an ordinal floor inside a sentence', function () {
      expect(this.gatesPlace.building.code + '/' + this.gatesPlace.floor).toBe('GHC/5');
    });

    it('snaps to a nav node on the requested floor', function () {
      expect(this.gatesPlace.node.floor).toBe('5');
    });

    it('returns null for unknown places', function () {
      expect(CampusPulse.resolvePlace('the moon')).toBeNull();
    });

    it('resolves a floor-plan room number inside a building ("Wean 5403")', function () {
      var p = CampusPulse.resolvePlace('route to wean 5403');
      expect(p.room.number + '/' + p.floor + '/' + p.node.id).toBe('5403/5/nn_WEH_5_5403');
    });

    it('sends a bare building destination to its entrance', function () {
      expect(String(CampusPulse.resolvePlace('navigate to hunt library').node.kind)).toBe('Door');
    });
  });
});
