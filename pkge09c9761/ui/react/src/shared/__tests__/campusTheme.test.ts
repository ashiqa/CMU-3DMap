import { buildingColor, clockLabel, floorIndex, forecastHeadline, haversineM, levelOf, mixHex, relativeWindow } from '../campusTheme';
import { CrowdForecast } from '../../Interfaces';

describe('campusTheme helpers', () => {
  describe('levelOf', () => {
    it('maps occupancy fractions onto the five crowd levels', () => {
      expect([0, 0.24, 0.25, 0.49, 0.5, 0.69, 0.7, 0.89, 0.9, 1.1].map(levelOf)).toEqual([0, 0, 1, 1, 2, 2, 3, 3, 4, 4]);
    });
  });

  describe('clockLabel', () => {
    it('formats minutes of the day as 12-hour clock text', () => {
      expect(clockLabel(0)).toBe('12:00 AM');
      expect(clockLabel(850)).toBe('2:10 PM');
      expect(clockLabel(12 * 60 + 5)).toBe('12:05 PM');
    });

    it('wraps past midnight and negative values', () => {
      expect(clockLabel(1440 + 90)).toBe('1:30 AM');
      expect(clockLabel(-30)).toBe('11:30 PM');
    });
  });

  describe('relativeWindow', () => {
    const now = Date.parse('2026-11-17T19:00:00Z');
    const iso = (offsetMin: number) => new Date(now + offsetMin * 60000).toISOString();

    it('reports upcoming windows as "starts in"', () => {
      expect(relativeWindow(iso(40), iso(100), now)).toEqual({ label: 'starts in 40 min', live: false, expired: false });
    });

    it('reports live windows with the minutes left', () => {
      expect(relativeWindow(iso(-12), iso(25), now)).toEqual({ label: 'about 25 min left', live: true, expired: false });
    });

    it('reports past windows as ended', () => {
      expect(relativeWindow(iso(-120), iso(-5), now)).toEqual({ label: 'ended', live: false, expired: true });
    });

    it('returns an empty label when the pin has no times', () => {
      expect(relativeWindow(undefined, undefined, now).label).toBe('');
    });
  });

  describe('floorIndex', () => {
    it('parses numeric floors and letter basements', () => {
      expect(floorIndex('4')).toBe(4);
      expect(floorIndex('A')).toBe(0);
      expect(floorIndex('LL')).toBe(-1);
      expect(floorIndex(undefined)).toBe(1);
    });
  });

  describe('haversineM', () => {
    it('measures the Fence to Hunt Library at roughly 190 m', () => {
      const d = haversineM(-79.9438, 40.44285, -79.9438, 40.44117);
      expect(d).toBeGreaterThan(180);
      expect(d).toBeLessThan(200);
    });
  });

  describe('mixHex / buildingColor', () => {
    it('mixes two colours linearly', () => {
      expect(mixHex('#000000', '#ffffff', 0.5)).toBe('#808080');
      expect(mixHex('#c41230', '#c41230', 0.3)).toBe('#c41230');
    });

    it('returns the plain facade colour when there is no crowd data', () => {
      expect(buildingColor('Concrete', -1, false)).toBe('#a9a69f');
      expect(buildingColor(undefined, -1, false)).toBe('#c9a98a');
    });

    it('tints toward Carnegie Red as the crowd level rises', () => {
      const quiet = buildingColor('Limestone', 0, false);
      const full = buildingColor('Limestone', 4, false);
      const red = (hex: string) => parseInt(hex.slice(1, 3), 16);
      const green = (hex: string) => parseInt(hex.slice(3, 5), 16);
      expect(quiet).toBe('#e6e0d2');
      expect(red(full) - green(full)).toBeGreaterThan(80);
    });

    it('darkens every facade in rain', () => {
      const dry = buildingColor('Buff brick', 2, false);
      const wet = buildingColor('Buff brick', 2, true);
      const lum = (hex: string) => [1, 3, 5].reduce((a, i) => a + parseInt(hex.slice(i, i + 2), 16), 0);
      expect(lum(wet)).toBeLessThan(lum(dry));
    });
  });

  describe('forecastHeadline', () => {
    const base: CrowdForecast = {
      zone: { id: 'z', name: 'Sorrells Library', kind: 'Library', lng: 0, lat: 0, capacity: 180 },
      scenario: { minuteOfDay: 850, rain: true, eventNearby: false, examWeek: false, seed: 1 },
      minutesAhead: [0, 10],
      p10: [0.5, 0.6],
      p50: [0.6, 0.7],
      p90: [0.7, 0.8],
      nowFraction: 0.6,
      peakFraction: 0.7,
      drivers: [],
      method: 'test',
    };

    it('names the time capacity is reached when the forecast has one', () => {
      expect(forecastHeadline({ ...base, timeToCapacityMin: 70, capacityAtLabel: '3:20 PM' })).toBe('Full at 3:20 PM');
    });

    it('falls back to the peak percentage otherwise', () => {
      expect(forecastHeadline(base)).toBe('Peaks at 70%');
    });
  });
});
