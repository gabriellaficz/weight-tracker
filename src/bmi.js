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

export function bmiFromMetric(weightKg, heightCm) {
  if (!weightKg || !heightCm) return null;
  const meters = heightCm / 100;
  if (meters <= 0) return null;
  return weightKg / (meters * meters);
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
