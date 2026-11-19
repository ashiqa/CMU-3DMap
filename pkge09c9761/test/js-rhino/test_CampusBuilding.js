/**
 * Unit tests for CampusBuilding: code lookup and the evacuation-planning sandbox.
 */
const filename = 'test_CampusBuilding';

describe(filename, function () {
  beforeAll(function () {
    this.ctx = TestApi.createContext(filename);
    this.gates = CampusBuilding.forCode('GHC');
    this.plan = this.gates.planEvacuation(400, 7);
    this.planAgain = this.gates.planEvacuation(400, 7);
    this.otherSeed = this.gates.planEvacuation(400, 8);
  });

  afterAll(function () {
    TestApi.teardown(this.ctx);
  });

  describe('#forCode', function () {
    it('returns the building with that CMU Maps code', function () {
      expect(this.gates.name).toBe('Gates & Hillman Centers');
    });

    it('returns null for an unknown code', function () {
      expect(CampusBuilding.forCode('NOPE')).toBeNull();
    });
  });

  describe('#planEvacuation', function () {
    it('distributes exactly the requested occupants across clusters', function () {
      var total = 0;
      this.plan.clusters.each((c) => {
        total += c.count;
      });
      expect(total).toBe(400);
    });

    it('assigns every cluster in both runs', function () {
      expect(this.plan.baseline.assignments.length + this.plan.optimized.assignments.length).toBe(this.plan.clusters.length * 2);
    });

    it('never makes clearance worse than the nearest-exit baseline', function () {
      expect(this.plan.optimized.clearanceSec).toBeLessThanOrEqual(this.plan.baseline.clearanceSec);
    });

    it('accounts for every occupant in the exit loads', function () {
      var assigned = 0;
      this.plan.optimized.exitLoads.each((l) => {
        assigned += l.assigned;
      });
      expect(assigned).toBe(400);
    });

    it('is reproducible from the seed', function () {
      expect(this.planAgain.optimized.clearanceSec).toBe(this.plan.optimized.clearanceSec);
    });

    it('places clusters differently for a different seed', function () {
      expect(this.otherSeed.clusters.first().lng).not.toBe(this.plan.clusters.first().lng);
    });

    it('always carries the safety disclaimer', function () {
      expect(this.plan.disclaimer).toBe('Planning simulation · Synthetic occupants · Not operational emergency guidance.');
    });

    it('refuses buildings without modelled exits', function () {
      var doherty = CampusBuilding.forCode('DH');
      expect(() => doherty.planEvacuation(100, 1)).toThrowError(/No exits are modelled/);
    });
  });
});
