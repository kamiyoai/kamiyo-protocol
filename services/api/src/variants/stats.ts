export type SampleStats = {
  n: number;
  mean: number;
  variance: number;
};

export function sampleStats(values: number[]): SampleStats {
  const n = values.length;
  if (n === 0) return { n: 0, mean: 0, variance: 0 };
  const mean = values.reduce((s, v) => s + v, 0) / n;
  if (n < 2) return { n, mean, variance: 0 };
  const sumSq = values.reduce((s, v) => s + (v - mean) * (v - mean), 0);
  return { n, mean, variance: sumSq / (n - 1) };
}

export function welchT(a: SampleStats, b: SampleStats): { t: number; df: number } | null {
  if (a.n < 2 || b.n < 2) return null;
  const va = a.variance / a.n;
  const vb = b.variance / b.n;
  const denom = Math.sqrt(va + vb);
  if (denom === 0) return null;
  const t = (a.mean - b.mean) / denom;
  const num = (va + vb) * (va + vb);
  const df = num / ((va * va) / (a.n - 1) + (vb * vb) / (b.n - 1));
  return { t, df };
}

function logGamma(x: number): number {
  const c = [
    76.180091729471, -86.505320329417, 24.014098240831, -1.23173957245, 0.120865097387e-2,
    -0.539523938495e-5,
  ];
  let y = x;
  let tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.00000000019;
  for (let j = 0; j < 6; j++) {
    y += 1;
    ser += c[j] / y;
  }
  return -tmp + Math.log((2.506628274631 * ser) / x);
}

function betacf(a: number, b: number, x: number): number {
  const maxIter = 200;
  const eps = 3e-7;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < 1e-30) d = 1e-30;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= maxIter; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    c = 1 + aa / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    c = 1 + aa / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < eps) break;
  }
  return h;
}

function betai(a: number, b: number, x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(
    logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x)
  );
  if (x < (a + 1) / (a + b + 2)) return (bt * betacf(a, b, x)) / a;
  return 1 - (bt * betacf(b, a, 1 - x)) / b;
}

export function welchPTwoSided(t: number, df: number): number {
  if (!Number.isFinite(t) || !Number.isFinite(df) || df <= 0) return 1;
  const x = df / (df + t * t);
  return betai(df / 2, 0.5, x);
}

export function sampleNormal(mean: number, stddev: number): number {
  const u1 = Math.random() || 1e-9;
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + stddev * z;
}
