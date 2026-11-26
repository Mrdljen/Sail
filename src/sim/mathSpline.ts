/**
 * Binary search & natural cubic spline ported directly from:
 * - bythelee/public_html/js/leeboard/core/Util.js:L55-77 (bsearch)
 * - bythelee/public_html/js/leeboard/core/Math.js:L410-506 (CSpline)
 */

// ref: bythelee/public_html/js/leeboard/core/Util.js:L55-77
export function bsearch(array: readonly number[], value: number): number {
  const lastIndex = array.length - 1;
  if (value < array[0]) return -1;
  if (value >= array[lastIndex]) return lastIndex;

  let low = 0;
  let high = lastIndex;
  while (high - low > 1) {
    const mid = (low + high) >> 1;
    if (value < array[mid]) high = mid;
    else low = mid;
  }
  return low;
}

// ref: bythelee/public_html/js/leeboard/core/Math.js:L410-506
export class CSpline {
  private xs: readonly number[];
  private ys: readonly number[];
  private y2s: number[];

  constructor(xs: readonly number[], ys: readonly number[]) {
    this.xs = xs;
    this.ys = ys;
    const end = xs.length - 1;
    const u = new Array<number>(xs.length).fill(0);
    this.y2s = new Array<number>(xs.length).fill(0);

    for (let i = 1; i < end; i++) {
      const sig = (xs[i] - xs[i - 1]) / (xs[i + 1] - xs[i - 1]);
      const p = sig * this.y2s[i - 1] + 2;
      this.y2s[i] = (sig - 1) / p;
      u[i] =
        (ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]) -
        (ys[i] - ys[i - 1]) / (xs[i] - xs[i - 1]);
      u[i] = ((6 * u[i]) / (xs[i + 1] - xs[i - 1]) - sig * u[i - 1]) / p;
    }

    for (let i = end - 1; i >= 0; i--) {
      this.y2s[i] = this.y2s[i] * this.y2s[i + 1] + u[i];
    }
  }

  findLowIndex(x: number): number {
    return bsearch(this.xs, x);
  }

  interpolate(x: number, lowIn?: number): number {
    let low = lowIn !== undefined ? lowIn : this.findLowIndex(x);
    let high = low + 1;
    if (low < 0) {
      low = 0;
      high = 1;
    } else if (high >= this.xs.length) {
      high = this.xs.length - 1;
      low = high - 1;
    }

    const delta = this.xs[high] - this.xs[low];
    const a = (this.xs[high] - x) / delta;
    const b = (x - this.xs[low]) / delta;
    return (
      a * this.ys[low] +
      b * this.ys[high] +
      (((a * a * a - a) * this.y2s[low] + (b * b * b - b) * this.y2s[high]) *
        (delta * delta)) /
        6
    );
  }
}
