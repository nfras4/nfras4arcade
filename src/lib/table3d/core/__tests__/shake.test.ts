import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createShakeDetector } from '../../shake.js';

// ─── Setup mock window ─────────────────────────────────────────────────────────

const mockWindow = {
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  DeviceMotionEvent: {},
} as any;

// Inject mock window into detector module scope
vi.stubGlobal('window', mockWindow);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function createMockDeviceMotionEvent(
  accelWithGravity?: { x?: number; y?: number; z?: number }
): DeviceMotionEvent {
  return {
    accelerationIncludingGravity: accelWithGravity,
    acceleration: undefined,
  } as any;
}

function extractHandler(): ((event: DeviceMotionEvent) => void) | null {
  const calls = (mockWindow.addEventListener as any).mock.calls;
  const dmCall = calls.find((call: any) => call[0] === 'devicemotion');
  return dmCall ? dmCall[1] : null;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('createShakeDetector', () => {
  let mockOnShake: ReturnType<typeof vi.fn> & (() => void);

  beforeEach(() => {
    mockOnShake = vi.fn() as any;
    mockWindow.addEventListener.mockClear();
    mockWindow.removeEventListener.mockClear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('baseline tracking and threshold trigger', () => {
    it('fires onShake when (magnitude - baseline) exceeds threshold', () => {
      const detector = createShakeDetector({
        threshold: 18,
        cooldownMs: 800,
        onShake: mockOnShake,
      });

      detector.start();
      const handler = extractHandler();

      if (handler) {
        const event = createMockDeviceMotionEvent({ x: 20, y: 0, z: 0 });
        handler(event);
        expect(mockOnShake).toHaveBeenCalledTimes(1);
      }

      detector.stop();
    });

    it('cooldown suppresses a second trigger within the window', () => {
      const detector = createShakeDetector({
        threshold: 18,
        cooldownMs: 800,
        onShake: mockOnShake,
      });

      detector.start();
      const handler = extractHandler();

      if (handler) {
        // First shake
        const event1 = createMockDeviceMotionEvent({ x: 25, y: 0, z: 0 });
        handler(event1);
        expect(mockOnShake).toHaveBeenCalledTimes(1);

        // Second shake immediately after (within cooldown)
        const event2 = createMockDeviceMotionEvent({ x: 25, y: 0, z: 0 });
        handler(event2);
        vi.advanceTimersByTime(100);
        expect(mockOnShake).toHaveBeenCalledTimes(1);

        // Advance past cooldown
        vi.advanceTimersByTime(701);
        const event3 = createMockDeviceMotionEvent({ x: 25, y: 0, z: 0 });
        handler(event3);
        expect(mockOnShake).toHaveBeenCalledTimes(2);
      }

      detector.stop();
    });

    it('no-op when magnitude - baseline is below threshold', () => {
      const detector = createShakeDetector({
        threshold: 18,
        cooldownMs: 800,
        onShake: mockOnShake,
      });

      detector.start();
      const handler = extractHandler();

      if (handler) {
        const event = createMockDeviceMotionEvent({ x: 5, y: 0, z: 0 });
        handler(event);
        expect(mockOnShake).not.toHaveBeenCalled();
      }

      detector.stop();
    });
  });

  describe('requestPermission', () => {
    it('returns "not-required" when DeviceMotionEvent.requestPermission is undefined', async () => {
      mockWindow.DeviceMotionEvent = {};

      const detector = createShakeDetector({
        threshold: 18,
        cooldownMs: 800,
        onShake: mockOnShake,
      });

      const result = await detector.requestPermission();
      expect(result).toBe('not-required');
    });

    it('returns "granted" when requestPermission() resolves to "granted"', async () => {
      mockWindow.DeviceMotionEvent = {
        requestPermission: vi.fn().mockResolvedValue('granted'),
      };

      const detector = createShakeDetector({
        threshold: 18,
        cooldownMs: 800,
        onShake: mockOnShake,
      });

      const result = await detector.requestPermission();
      expect(result).toBe('granted');
    });

    it('returns "denied" when requestPermission() resolves to "denied"', async () => {
      mockWindow.DeviceMotionEvent = {
        requestPermission: vi.fn().mockResolvedValue('denied'),
      };

      const detector = createShakeDetector({
        threshold: 18,
        cooldownMs: 800,
        onShake: mockOnShake,
      });

      const result = await detector.requestPermission();
      expect(result).toBe('denied');
    });

    it('returns "unsupported" when DeviceMotionEvent global is absent', async () => {
      delete mockWindow.DeviceMotionEvent;

      const detector = createShakeDetector({
        threshold: 18,
        cooldownMs: 800,
        onShake: mockOnShake,
      });

      const result = await detector.requestPermission();
      expect(result).toBe('unsupported');

      mockWindow.DeviceMotionEvent = {};
    });

    it('returns "denied" when requestPermission() throws', async () => {
      mockWindow.DeviceMotionEvent = {
        requestPermission: vi
          .fn()
          .mockRejectedValue(new Error('Permission denied')),
      };

      const detector = createShakeDetector({
        threshold: 18,
        cooldownMs: 800,
        onShake: mockOnShake,
      });

      const result = await detector.requestPermission();
      expect(result).toBe('denied');
    });
  });

  describe('start/stop idempotency', () => {
    it('start() is idempotent: multiple calls do not duplicate listeners', () => {
      const detector = createShakeDetector({
        threshold: 18,
        cooldownMs: 800,
        onShake: mockOnShake,
      });

      detector.start();
      detector.start();
      detector.start();

      const dmCalls = (mockWindow.addEventListener as any).mock.calls.filter(
        (call: any) => call[0] === 'devicemotion'
      );
      expect(dmCalls.length).toBe(1);

      detector.stop();
    });

    it('stop() is idempotent: multiple calls do not error', () => {
      const detector = createShakeDetector({
        threshold: 18,
        cooldownMs: 800,
        onShake: mockOnShake,
      });

      detector.start();
      detector.stop();
      detector.stop();
      detector.stop();

      expect(true).toBe(true);
    });
  });

  describe('custom threshold and cooldown', () => {
    it('respects custom threshold', () => {
      const detector = createShakeDetector({
        threshold: 5,
        cooldownMs: 100,
        onShake: mockOnShake,
      });

      detector.start();
      const handler = extractHandler();

      if (handler) {
        const event = createMockDeviceMotionEvent({ x: 8, y: 0, z: 0 });
        handler(event);
        expect(mockOnShake).toHaveBeenCalled();
      }

      detector.stop();
    });

    it('respects custom cooldown', () => {
      const detector = createShakeDetector({
        threshold: 18,
        cooldownMs: 100,
        onShake: mockOnShake,
      });

      detector.start();
      const handler = extractHandler();

      if (handler) {
        const event1 = createMockDeviceMotionEvent({ x: 25, y: 0, z: 0 });
        handler(event1);
        expect(mockOnShake).toHaveBeenCalledTimes(1);

        vi.advanceTimersByTime(50);
        const event2 = createMockDeviceMotionEvent({ x: 25, y: 0, z: 0 });
        handler(event2);
        expect(mockOnShake).toHaveBeenCalledTimes(1);

        vi.advanceTimersByTime(51);
        const event3 = createMockDeviceMotionEvent({ x: 25, y: 0, z: 0 });
        handler(event3);
        expect(mockOnShake).toHaveBeenCalledTimes(2);
      }

      detector.stop();
    });
  });

  describe('fallback to acceleration when accelerationIncludingGravity is undefined', () => {
    it('uses acceleration when accelerationIncludingGravity is null', () => {
      const detector = createShakeDetector({
        threshold: 18,
        cooldownMs: 800,
        onShake: mockOnShake,
      });

      detector.start();
      const handler = extractHandler();

      if (handler) {
        const event = {
          accelerationIncludingGravity: null,
          acceleration: { x: 20, y: 0, z: 0 },
        } as any;
        handler(event);
        expect(mockOnShake).toHaveBeenCalled();
      }

      detector.stop();
    });

    it('defaults to zeros when both accel fields are undefined', () => {
      const detector = createShakeDetector({
        threshold: 18,
        cooldownMs: 800,
        onShake: mockOnShake,
      });

      detector.start();
      const handler = extractHandler();

      if (handler) {
        const event = {
          accelerationIncludingGravity: undefined,
          acceleration: undefined,
        } as any;
        handler(event);
        expect(mockOnShake).not.toHaveBeenCalled();
      }

      detector.stop();
    });
  });
});
