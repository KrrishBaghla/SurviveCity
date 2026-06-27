// Mulberry32 PRNG — deterministic, seeded
export class RNG {
  private s: number;
  constructor(seed = 1) { this.s = seed >>> 0; }
  next(): number {
    let t = (this.s += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  int(maxExclusive: number): number { return Math.floor(this.next() * maxExclusive); }
  pick<T>(arr: T[]): T { return arr[this.int(arr.length)]; }
  range(min: number, maxExclusive: number): number { return min + this.int(maxExclusive - min); }
}
