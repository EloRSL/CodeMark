// The only file in apps/api that reads the real time (G4). Only test.clock sets the fake time,
// and the fake time stands still, so tests get exact times.
let fakeNow: number | null = null;

export const clock = {
  now: (): number => fakeNow ?? Date.now(),
  set: (ms: number | null): void => {
    fakeNow = ms;
  },
};
