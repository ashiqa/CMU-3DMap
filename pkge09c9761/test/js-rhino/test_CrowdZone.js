/**
 * Unit tests for CrowdZone: the scenario-driven crowd simulation, forecast, and recommendation.
 */
const filename = 'test_CrowdZone';

describe(filename, function () {
  beforeAll(function () {
    this.ctx = TestApi.createContext(filename);
    this.dry = CampusPulse.Scenario.make({ minuteOfDay: 850, rain: false, eventNearby: false, examWeek: false, seed: 1 });
    this.rain = CampusPulse.Scenario.make({ minuteOfDay: 850, rain: true, eventNearby: false, examWeek: false, seed: 1 });
    this.zoneCount = CrowdZone.fetchCount();
    this.dryStates = CrowdZone.simulate(this.dry);
    this.rainStates = CrowdZone.simulate(this.rain);
    this.sorrells = CrowdZone.forId('zone_sorrells');
    this.dryForecast = this.sorrells.forecast(this.dry, 180);
    this.rainForecast = this.sorrells.forecast(this.rain, 180);
    this.recommendation = this.sorrells.recommend(this.rain);
  });

  afterAll(function () {
    TestApi.teardown(this.ctx);
  });

  describe('#simulate', function () {
    it('returns one state per seeded zone', function () {
      expect(this.dryStates.length).toBe(this.zoneCount);
    });

    it('keeps every fraction within the modelled range', function () {
      this.dryStates.each((s) => {
        expect(s.fraction >= 0 && s.fraction <= 1.15)
          .withContext(s.zone.name + ' fraction ' + s.fraction)
          .toBeTrue();
      });
    });

    it('derives the level from the fraction thresholds', function () {
      this.dryStates.each((s) => {
        var expected = s.fraction < 0.25 ? 0 : s.fraction < 0.5 ? 1 : s.fraction < 0.7 ? 2 : s.fraction < 0.9 ? 3 : 4;
        expect(s.level).withContext(s.zone.name).toBe(expected);
      });
    });

    it('is deterministic for the same scenario', function () {
      var again = CrowdZone.simulate(this.dry);
      this.dryStates.each((s, i) => {
        expect(again[i].fraction).withContext(s.zone.name).toBe(s.fraction);
      });
    });

    it('raises indoor occupancy and lowers quads when it rains', function () {
      var dryByZone = {};
      this.dryStates.each((s) => {
        dryByZone[s.zone.id] = s.fraction;
      });
      this.rainStates.each((s) => {
        var delta = s.fraction - dryByZone[s.zone.id];
        if (s.zone.indoor) expect(delta).withContext(s.zone.name + ' should fill in rain').toBeGreaterThan(0);
        else expect(delta).withContext(s.zone.name + ' should empty in rain').toBeLessThan(0);
      });
    });
  });

  describe('#forecast', function () {
    it('samples every ten minutes across the horizon', function () {
      expect(this.dryForecast.minutesAhead.length).toBe(19);
    });

    it('keeps the band ordered p10 <= p50 <= p90 at every sample', function () {
      this.dryForecast.p50.each((p50, i) => {
        expect(this.dryForecast.p10[i] <= p50 && p50 <= this.dryForecast.p90[i])
          .withContext('sample ' + i)
          .toBeTrue();
      });
    });

    it('reports a higher peak for Sorrells in the rain than when dry', function () {
      expect(this.rainForecast.peakFraction).toBeGreaterThan(this.dryForecast.peakFraction);
    });

    it('names a capacity time only when the central estimate reaches 90%', function () {
      var reaches = false;
      this.rainForecast.p50.each((p) => {
        if (p >= 0.9) reaches = true;
      });
      expect(this.rainForecast.timeToCapacityMin != null).toBe(reaches);
    });

    it('lists rain as a driver when it is raining', function () {
      var labels = this.rainForecast.drivers.mapToStr((d) => d.label);
      expect(labels.contains('Rain pushes people indoors')).toBeTrue();
    });
  });

  describe('#recommend', function () {
    it('never recommends the origin itself', function () {
      this.recommendation.alternatives.each((a) => {
        expect(a.zone.id).toBe(a.zone.id === 'zone_sorrells' ? 'not-origin' : a.zone.id);
      });
    });

    it('returns at most three alternatives ordered by score', function () {
      var scores = [];
      this.recommendation.alternatives.each((a) => {
        scores.push(a.score);
      });
      var sorted = scores.slice().sort((a, b) => b - a);
      expect(scores.length <= 3 && JSON.stringify(scores) === JSON.stringify(sorted)).toBeTrue();
    });

    it('only recommends study spaces for a study-space origin', function () {
      this.recommendation.alternatives.each((a) => {
        expect(a.zone.studySpace).withContext(a.zone.name).toBeTrue();
      });
    });

    it('summarises the origin and the top alternative in one sentence', function () {
      var top = this.recommendation.alternatives.first();
      expect(this.recommendation.summary.indexOf('Sorrells Library') === 0 && this.recommendation.summary.indexOf(top.zone.name) > 0).toBeTrue();
    });
  });
});
