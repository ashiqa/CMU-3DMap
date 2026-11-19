/**
 * Unit tests for CampusPin.resetDemoClock, which re-anchors food and event times to "now".
 */
const filename = 'test_CampusPin';

describe(filename, function () {
  beforeAll(function () {
    this.ctx = TestApi.createContext(filename);
    this.pinId = TestApi.createEntity(this.ctx, 'CampusPin', {
      kind: CampusPin.Kind.FOOD,
      name: filename + ' bagels',
      lng: -79.9445,
      lat: 40.4435,
      demoStartOffsetMin: -10,
      demoDurationMin: 40,
      startsAt: DateTime.fromString('2020-01-01T00:00:00Z'),
      expiresAt: DateTime.fromString('2020-01-01T01:00:00Z'),
      dataStatus: CampusPulse.DataStatus.SYNTHETIC,
    }).id;
    TestApi.waitForSetup(this.ctx);
    this.before = DateTime.now();
    this.updated = CampusPin.resetDemoClock();
    this.pin = CampusPin.forId(this.pinId);
  });

  afterAll(function () {
    TestApi.teardown(this.ctx);
  });

  it('updates every pin that carries a demo duration', function () {
    expect(this.updated).toBeGreaterThanOrEqual(1);
  });

  it('places the start at the configured offset from now', function () {
    var diffMin = (this.pin.startsAt.millis - this.before.millis) / 60000;
    expect(Math.abs(diffMin + 10) < 2).withContext('start offset was ' + diffMin + ' min').toBeTrue();
  });

  it('keeps the configured duration between start and expiry', function () {
    var durationMin = (this.pin.expiresAt.millis - this.pin.startsAt.millis) / 60000;
    expect(durationMin).toBe(40);
  });
});
