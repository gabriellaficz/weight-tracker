import fs from "fs";
import path from "path";

const DATA_FILE = path.join(process.cwd(), "data", "cdc_bmiagerev.csv");

let cachedTables = null;

function parseCsvLine(line) {
  return line.split(",").map((value) => value.trim());
}

function loadTables() {
  if (cachedTables) return cachedTables;
  const content = fs.readFileSync(DATA_FILE, "utf8");
  const lines = content.split(/\r?\n/).filter(Boolean);
  const header = parseCsvLine(lines[0]);
  const idx = {
    sex: header.indexOf("Sex"),
    age: header.indexOf("Agemos"),
    l: header.indexOf("L"),
    m: header.indexOf("M"),
    s: header.indexOf("S")
  };
  const tables = { 1: [], 2: [] };
  for (let i = 1; i < lines.length; i += 1) {
    const parts = parseCsvLine(lines[i]);
    if (parts.length < header.length) continue;
    const sex = Number(parts[idx.sex]);
    const row = {
      age: Number(parts[idx.age]),
      l: Number(parts[idx.l]),
      m: Number(parts[idx.m]),
      s: Number(parts[idx.s])
    };
    if (tables[sex]) {
      tables[sex].push(row);
    }
  }
  tables[1].sort((a, b) => a.age - b.age);
  tables[2].sort((a, b) => a.age - b.age);
  cachedTables = tables;
  return tables;
}

export function getLmsTables() {
  return loadTables();
}

function interpolateRow(rows, age) {
  if (!rows.length) return null;
  if (age <= rows[0].age) return rows[0];
  if (age >= rows[rows.length - 1].age) return rows[rows.length - 1];

  let left = 0;
  let right = rows.length - 1;
  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    const value = rows[mid].age;
    if (value === age) return rows[mid];
    if (value < age) left = mid + 1;
    else right = mid - 1;
  }

  const lower = rows[right];
  const upper = rows[left];
  const span = upper.age - lower.age;
  const ratio = span === 0 ? 0 : (age - lower.age) / span;
  return {
    age,
    l: lower.l + (upper.l - lower.l) * ratio,
    m: lower.m + (upper.m - lower.m) * ratio,
    s: lower.s + (upper.s - lower.s) * ratio
  };
}

function erf(x) {
  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * absX);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const poly =
    (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t);
  const approx = 1 - poly * Math.exp(-absX * absX);
  return sign * approx;
}

function normalCdf(z) {
  return 0.5 * (1 + erf(z / Math.SQRT2));
}

function inverseNormalCdf(p) {
  if (p <= 0 || p >= 1) return null;
  const a1 = -39.69683028665376;
  const a2 = 220.9460984245205;
  const a3 = -275.9285104469687;
  const a4 = 138.357751867269;
  const a5 = -30.66479806614716;
  const a6 = 2.506628277459239;
  const b1 = -54.47609879822406;
  const b2 = 161.5858368580409;
  const b3 = -155.6989798598866;
  const b4 = 66.80131188771972;
  const b5 = -13.28068155288572;
  const c1 = -0.007784894002430293;
  const c2 = -0.3223964580411365;
  const c3 = -2.400758277161838;
  const c4 = -2.549732539343734;
  const c5 = 4.374664141464968;
  const c6 = 2.938163982698783;
  const d1 = 0.007784695709041462;
  const d2 = 0.3224671290700398;
  const d3 = 2.445134137142996;
  const d4 = 3.754408661907416;
  const plow = 0.02425;
  const phigh = 1 - plow;
  let q;
  let r;
  if (p < plow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (
      (((((c1 * q + c2) * q + c3) * q + c4) * q + c5) * q + c6) /
      ((((d1 * q + d2) * q + d3) * q + d4) * q + 1)
    );
  }
  if (p > phigh) {
    q = Math.sqrt(-2 * Math.log(1 - p));
    return -(
      (((((c1 * q + c2) * q + c3) * q + c4) * q + c5) * q + c6) /
      ((((d1 * q + d2) * q + d3) * q + d4) * q + 1)
    );
  }
  q = p - 0.5;
  r = q * q;
  return (
    (((((a1 * r + a2) * r + a3) * r + a4) * r + a5) * r + a6) * q /
    (((((b1 * r + b2) * r + b3) * r + b4) * r + b5) * r + 1)
  );
}

export function bmiFromMetric(weightKg, heightCm) {
  if (!weightKg || !heightCm) return null;
  const meters = heightCm / 100;
  if (meters <= 0) return null;
  return weightKg / (meters * meters);
}

export function bmiFromPercentile({ percentile, ageMonths, gender }) {
  if (percentile == null || !ageMonths || !gender) return null;
  const sex = gender === "male" ? 1 : gender === "female" ? 2 : null;
  if (!sex) return null;
  const tables = loadTables();
  const row = interpolateRow(tables[sex], ageMonths);
  if (!row || !row.m || !row.s) return null;
  const z = inverseNormalCdf(percentile / 100);
  if (z == null) return null;
  const l = row.l;
  const m = row.m;
  const s = row.s;
  if (l === 0) {
    return m * Math.exp(s * z);
  }
  return m * Math.pow(1 + l * s * z, 1 / l);
}

export function bmiPercentile({ bmi, ageMonths, gender }) {
  if (!bmi || !ageMonths || !gender) return null;
  const sex = gender === "male" ? 1 : gender === "female" ? 2 : null;
  if (!sex) return null;
  const tables = loadTables();
  const row = interpolateRow(tables[sex], ageMonths);
  if (!row || !row.m || !row.s) return null;
  const l = row.l;
  const m = row.m;
  const s = row.s;
  let z;
  if (l === 0) {
    z = Math.log(bmi / m) / s;
  } else {
    z = (Math.pow(bmi / m, l) - 1) / (l * s);
  }
  const percentile = normalCdf(z) * 100;
  return {
    percentile,
    z
  };
}

export function bmiCategoryAdult(bmi) {
  if (!bmi) return null;
  if (bmi < 18.5) return "Underweight";
  if (bmi < 25) return "Healthy";
  if (bmi < 30) return "Overweight";
  return "Obese";
}

export function bmiCategoryChild(percentile) {
  if (percentile == null) return null;
  if (percentile < 5) return "Underweight";
  if (percentile < 85) return "Healthy";
  if (percentile < 95) return "Overweight";
  return "Obese";
}

export function bmiCategoryByAge({ bmi, ageMonths, gender }) {
  if (!bmi || !ageMonths) return null;
  if (ageMonths < 240) {
    const percentileInfo = bmiPercentile({ bmi, ageMonths, gender });
    return bmiCategoryChild(percentileInfo?.percentile ?? null);
  }
  if (ageMonths >= 300) {
    return bmiCategoryAdult(bmi);
  }
  const p5 = bmiFromPercentile({ percentile: 5, ageMonths: 240, gender });
  const p85 = bmiFromPercentile({ percentile: 85, ageMonths: 240, gender });
  const p95 = bmiFromPercentile({ percentile: 95, ageMonths: 240, gender });
  if (p5 == null || p85 == null || p95 == null) {
    return bmiCategoryAdult(bmi);
  }
  const t = (ageMonths - 240) / 60;
  const under = p5 + (18.5 - p5) * t;
  const over = p85 + (25 - p85) * t;
  const obese = p95 + (30 - p95) * t;
  if (bmi < under) return "Underweight";
  if (bmi < over) return "Healthy";
  if (bmi < obese) return "Overweight";
  return "Obese";
}
