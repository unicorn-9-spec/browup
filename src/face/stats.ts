// Small robust statistics. Pure functions.

export function median(values: readonly number[]): number | null {
  const v = values.filter(Number.isFinite);
  if (v.length === 0) return null;
  const s = [...v].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

/** Median absolute deviation (unscaled). */
export function mad(values: readonly number[]): number | null {
  const m = median(values);
  if (m === null) return null;
  return median(values.filter(Number.isFinite).map((v) => Math.abs(v - m)));
}

export function quantile(values: readonly number[], q: number): number | null {
  const v = values.filter(Number.isFinite);
  if (v.length === 0) return null;
  const s = [...v].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo]! + (s[hi]! - s[lo]!) * (pos - lo);
}

/** Running median over the last n values; reset() on a discontinuity. */
export class RunningMedian {
  private buf: number[] = [];
  constructor(private readonly n: number) {}
  push(v: number): number {
    this.buf.push(v);
    if (this.buf.length > this.n) this.buf.shift();
    return median(this.buf)!;
  }
  reset(): void {
    this.buf = [];
  }
}
