var log = Logger.for('CampusPin');

function resetDemoClock() {
  var now = DateTime.now().withTime(DateTime.now().hourOfDay, DateTime.now().minuteOfHour, 0, 0);
  var updates = CampusPin.arrayBuilder();
  CampusPin.fetchObjStream({
    filter: Filter.gt('demoDurationMin', 0),
    include: 'id, demoStartOffsetMin, demoDurationMin',
  }).each(function (pin) {
    var start = now.plusMinutes(pin.demoStartOffsetMin || 0);
    updates.add(CampusPin.make({ id: pin.id, startsAt: start, expiresAt: start.plusMinutes(pin.demoDurationMin) }));
  });
  var batch = updates.build();
  if (batch.isEmpty()) return 0;
  CampusPin.mergeBatch(batch);
  log.info('Re-anchored {} demo pins to {}', batch.length, now.toString());
  return batch.length;
}
