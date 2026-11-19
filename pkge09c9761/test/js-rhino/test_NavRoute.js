/**
 * Unit tests for NavRoute.compute: Fast, Calm, and Step-free routing over the campus nav graph.
 */
const filename = 'test_NavRoute';

describe(filename, function () {
  beforeAll(function () {
    this.ctx = TestApi.createContext(filename);
    this.rain = CampusPulse.Scenario.make({ minuteOfDay: 850, rain: true, eventNearby: false, examWeek: false, seed: 1 });
    this.fast = NavRoute.compute('nn_j_fence', 'nn_GHC_5_clsA', NavRoute.Mode.FAST, false, this.rain);
    this.calm = NavRoute.compute('nn_j_fence', 'nn_GHC_5_clsA', NavRoute.Mode.CALM, false, this.rain);
    this.stepFree = NavRoute.compute('nn_j_fence', 'nn_GHC_5_clsA', NavRoute.Mode.FAST, true, this.rain);
    this.crossBuilding = NavRoute.compute('nn_WEH_4_4400', 'nn_HL_2_208', NavRoute.Mode.FAST, false, this.rain);
    // Floor-plan graphs (CMU ESIM plans): Hunt Library 4th-floor open stacks, step-free from the Fence.
    this.huntStepFree = NavRoute.compute('nn_j_fence', 'nn_HL_4_407', NavRoute.Mode.FAST, true, this.rain);
    // An isolated node (no edges) must come back as unreachable rather than throwing.
    this.islandId = TestApi.createEntity(this.ctx, 'NavNode', {
      lng: -79.95,
      lat: 40.45,
      kind: NavNode.Kind.OUTDOOR,
      label: 'Test island',
      dataStatus: CampusPulse.DataStatus.SYNTHETIC,
    }).id;
    TestApi.waitForSetup(this.ctx);
    this.toIsland = NavRoute.compute('nn_j_fence', this.islandId, NavRoute.Mode.FAST, false, this.rain);
  });

  afterAll(function () {
    TestApi.teardown(this.ctx);
  });

  describe('Fast', function () {
    it('reaches the destination with geometry and steps', function () {
      expect(this.fast.points.length > 2 && this.fast.steps.length > 1 && !this.fast.unreachable).toBeTrue();
    });

    it('ends on the destination node', function () {
      expect(this.fast.points[this.fast.points.length - 1].nodeId).toBe('nn_GHC_5_clsA');
    });

    it('visits floor 4 then floor 5 inside Gates', function () {
      expect(this.fast.floorsVisited.toString(',')).toBe('4,5');
    });

    it('has no crowd penalty', function () {
      expect(this.fast.crowdPenaltyMin).toBe(0);
    });
  });

  describe('Calm', function () {
    it('is never faster than Fast for the same endpoints', function () {
      expect(this.calm.etaMinutes).toBeGreaterThanOrEqual(this.fast.etaMinutes);
    });

    it('reports the time it spends avoiding crowds', function () {
      expect(this.calm.crowdPenaltyMin).toBeGreaterThan(0);
    });
  });

  describe('Step-free', function () {
    it('never takes the stairs', function () {
      this.stepFree.steps.each((s) => {
        expect(s.text.indexOf('stairs')).withContext(s.text).toBe(-1);
      });
    });

    it('takes the elevator to change floors', function () {
      var texts = this.stepFree.steps.mapToStr((s) => s.text);
      expect(texts.contains('Take the elevator to floor 5')).toBeTrue();
    });
  });

  describe('indoor to indoor across buildings', function () {
    it('exits Wean and enters Hunt Library', function () {
      var texts = this.crossBuilding.steps.mapToStr((s) => s.text).toString(' | ');
      expect(texts.indexOf('Exit Wean Hall') >= 0 && texts.indexOf('Enter Hunt Library') >= 0).toBeTrue();
    });
  });

  describe('floor-plan graph (Hunt Library)', function () {
    it('enters on floor 1 and climbs to floor 4', function () {
      expect(this.huntStepFree.floorsVisited.toString(',')).toBe('1,2,3,4');
    });

    it('rides the elevator as one step', function () {
      var texts = this.huntStepFree.steps.mapToStr((s) => s.text);
      expect(texts.contains('Take the elevator to floor 4')).toBeTrue();
      expect(texts.contains('Take the elevator to floor 2')).toBeFalse();
    });
  });

  describe('edge cases', function () {
    it('flags an isolated destination as unreachable', function () {
      expect(this.toIsland.unreachable).toBeTrue();
    });

    it('throws for an unknown node id', function () {
      expect(() => NavRoute.compute('does-not-exist', 'nn_j_fence', NavRoute.Mode.FAST, false, this.rain)).toThrowError(/Unknown start node/);
    });
  });
});
