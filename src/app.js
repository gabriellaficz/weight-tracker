import crypto from "crypto";
import express from "express";
import cookieParser from "cookie-parser";
import bcrypt from "bcryptjs";
import path from "path";
import { fileURLToPath } from "url";
import { openDb, applyMigrations } from "./db.js";
import {
  bmiFromMetric,
  bmiPercentile,
  bmiCategoryByAge,
  bmiCategoryChild
} from "./bmi.js";
import { homeView, loginView, registerView, profileView } from "./views.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SESSION_DAYS = 30;
const SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME || "session_id";

function nowIso() {
  return new Date().toISOString();
}

function toKg(weight, unit) {
  if (weight == null || weight === "") return null;
  const value = Number(weight);
  if (!Number.isFinite(value)) return null;
  return unit === "lb" ? value * 0.45359237 : value;
}

function toCm(height, unit) {
  if (height == null || height === "") return null;
  const value = Number(height);
  if (!Number.isFinite(value)) return null;
  return unit === "in" ? value * 2.54 : value;
}

function ageInMonths(birthYear, birthMonth, entryDate) {
  const entry = new Date(entryDate);
  if (Number.isNaN(entry.getTime())) return null;
  const birth = new Date(Date.UTC(birthYear, birthMonth - 1, 15));
  const years = entry.getUTCFullYear() - birth.getUTCFullYear();
  const months = entry.getUTCMonth() - birth.getUTCMonth();
  const total = years * 12 + months;
  return total + (entry.getUTCDate() >= 15 ? 0.5 : 0);
}

function parseDateInput(value) {
  if (!value) return null;
  const text = String(value).trim();
  const isoMatch = text.match(/^(\d{4})-(\d{1,2})-(\d{2})$/);
  const shortMatch = text.match(/^(\d{4})-([A-Za-z]{3})-(\d{2})$/);
  if (!isoMatch && !shortMatch) return null;
  const year = Number((isoMatch || shortMatch)[1]);
  const day = Number((isoMatch || shortMatch)[3]);
  const months = {
    jan: 0,
    feb: 1,
    mar: 2,
    apr: 3,
    may: 4,
    jun: 5,
    jul: 6,
    aug: 7,
    sep: 8,
    oct: 9,
    nov: 10,
    dec: 11
  };
  const month = isoMatch
    ? Number(isoMatch[2]) - 1
    : months[shortMatch[2].toLowerCase()];
  if (!Number.isFinite(month) || !day || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month, day));
  if (Number.isNaN(date.getTime())) return null;
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  const iso = date.toISOString().slice(0, 10);
  return iso;
}

function dateToUtcTimestamp(dateKey, hourOffset) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return Date.UTC(year, month - 1, day, hourOffset, 0, 0);
}

function distributeTimestamps(dateKey, count) {
  if (count <= 0) return [];
  if (count === 1) {
    return [dateToUtcTimestamp(dateKey, 12)];
  }
  const start = 6;
  const end = 18;
  const step = (end - start) / (count - 1);
  return Array.from({ length: count }, (_, i) =>
    dateToUtcTimestamp(dateKey, start + step * i)
  );
}

function computeStats(profile, entries) {
  const weightSeries = [];
  const weightSeriesImperial = [];
  const heightSeries = [];
  const heightSeriesImperial = [];
  const bmiSeries = [];
  const percentileSeries = [];
  let latest = null;

  const entriesByDate = new Map();

  for (const entry of entries) {
    const dateKey = entry.entry_date;
    if (!entriesByDate.has(dateKey)) {
      entriesByDate.set(dateKey, []);
    }
    entriesByDate.get(dateKey).push(entry);
  }

  const dates = Array.from(entriesByDate.keys()).sort();
  const entryX = new Map();
  const combinedPoints = [];
  const weightPoints = [];
  const heightPoints = [];

  for (const dateKey of dates) {
    const dayEntries = entriesByDate.get(dateKey).slice().sort((a, b) => {
      if (a.updated_at === b.updated_at) return a.id - b.id;
      return a.updated_at.localeCompare(b.updated_at);
    });
    const weightEntries = dayEntries.filter((entry) => entry.weight_kg != null);
    const heightEntries = dayEntries.filter((entry) => entry.height_cm != null);
    const weightTimes = distributeTimestamps(dateKey, weightEntries.length);
    const heightTimes = distributeTimestamps(dateKey, heightEntries.length);

    for (const entry of dayEntries) {
      let x = null;
      if (entry.weight_kg != null) {
        const idx = weightEntries.indexOf(entry);
        x = weightTimes[idx] ?? dateToUtcTimestamp(dateKey, 12);
      } else if (entry.height_cm != null) {
        const idx = heightEntries.indexOf(entry);
        x = heightTimes[idx] ?? dateToUtcTimestamp(dateKey, 12);
      }
      if (x == null) continue;
      entryX.set(entry.id, x);
      combinedPoints.push({ entry, x });
      if (entry.weight_kg != null) {
        weightPoints.push({ x, value: entry.weight_kg });
        weightSeries.push({
          label: entry.entry_date,
          value: entry.weight_kg,
          x
        });
        weightSeriesImperial.push({
          label: entry.entry_date,
          value: entry.weight_kg * 2.20462262,
          x
        });
      }
      if (entry.height_cm != null) {
        heightPoints.push({ x, value: entry.height_cm });
        heightSeries.push({
          label: entry.entry_date,
          value: entry.height_cm,
          x
        });
        heightSeriesImperial.push({
          label: entry.entry_date,
          value: entry.height_cm * 0.393700787,
          x
        });
      }
    }
  }

  const interpolateAt = (points, x) => {
    if (!points.length) return null;
    const sorted = points.slice().sort((a, b) => a.x - b.x);
    if (x <= sorted[0].x) return sorted[0].value;
    if (x >= sorted[sorted.length - 1].x) return sorted[sorted.length - 1].value;
    let left = 0;
    let right = sorted.length - 1;
    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      const midX = sorted[mid].x;
      if (midX === x) return sorted[mid].value;
      if (midX < x) left = mid + 1;
      else right = mid - 1;
    }
    const lower = sorted[right];
    const upper = sorted[left];
    const span = upper.x - lower.x;
    const ratio = span === 0 ? 0 : (x - lower.x) / span;
    return lower.value + (upper.value - lower.value) * ratio;
  };

  const combinedSorted = combinedPoints.slice().sort((a, b) => a.x - b.x);
  for (const point of combinedSorted) {
    const entry = point.entry;
    const x = point.x;
    const weightAt = interpolateAt(weightPoints, x);
    const heightAt = interpolateAt(heightPoints, x);
    const bmi = bmiFromMetric(weightAt, heightAt);
    const ageMonths = ageInMonths(
      profile.birth_year,
      profile.birth_month,
      entry.entry_date
    );
    let percentileInfo = null;
    if (ageMonths != null && ageMonths >= 24) {
      const percentileAge = ageMonths > 240 ? 240 : ageMonths;
      percentileInfo = bmiPercentile({
        bmi,
        ageMonths: percentileAge,
        gender: profile.gender
      });
    }
    entry.bmi = bmi;
    entry.percentile = percentileInfo ? percentileInfo.percentile : null;
    if (bmi != null) {
      bmiSeries.push({ label: entry.entry_date, value: bmi, x });
    }
    if (percentileInfo?.percentile != null) {
      percentileSeries.push({
        label: entry.entry_date,
        value: percentileInfo.percentile,
        x
      });
    }
    if (bmi != null) {
      latest = {
        bmi,
        percentile: percentileInfo?.percentile ?? null,
        category: bmiCategoryByAge({ bmi, ageMonths, gender: profile.gender }),
        percentileCategory:
          percentileInfo?.percentile != null
            ? bmiCategoryChild(percentileInfo.percentile)
            : null
      };
    }
  }

  return {
    weightSeries,
    weightSeriesImperial,
    heightSeries,
    heightSeriesImperial,
    bmiSeries,
    percentileSeries,
    latest
  };
}

function asyncHandler(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

export async function createApp() {
  const app = express();
  const db = await openDb();
  await applyMigrations(db);

  app.set("trust proxy", 1);
  app.use(express.urlencoded({ extended: false }));
  app.use(cookieParser());
  app.use(express.static(path.join(__dirname, "..", "public")));

  app.use(
    asyncHandler(async (req, res, next) => {
      const sessionId = req.cookies[SESSION_COOKIE_NAME];
      if (!sessionId) {
        req.user = null;
        return next();
      }
      const session = await db.get(
        "SELECT sessions.id, sessions.user_id, sessions.expires_at, users.username FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.id = ?",
        sessionId
      );
      if (!session) {
        res.clearCookie(SESSION_COOKIE_NAME);
        req.user = null;
        return next();
      }
      if (new Date(session.expires_at) < new Date()) {
        await db.run("DELETE FROM sessions WHERE id = ?", sessionId);
        res.clearCookie(SESSION_COOKIE_NAME);
        req.user = null;
        return next();
      }
      req.user = { id: session.user_id, username: session.username };
      next();
    })
  );

  app.get("/", (req, res) => {
    res.send(homeView({ user: req.user }));
  });

  app.get(
    "/api/username-available",
    asyncHandler(async (req, res) => {
      const username = String(req.query.username || "").trim();
      if (!username || !/^[a-zA-Z0-9_-]{3,20}$/.test(username)) {
        return res.json({ available: false });
      }
      const existing = await db.get(
        "SELECT id FROM users WHERE username = ?",
        username
      );
      res.json({ available: !existing });
    })
  );

  app.get("/register", (req, res) => {
    res.send(registerView({}));
  });

  app.post(
    "/register",
    asyncHandler(async (req, res) => {
      const { username, password, birthMonth, birthYear, gender } = req.body;
      const errors = [];
      if (!username || !/^[a-zA-Z0-9_-]{3,20}$/.test(username)) {
        errors.push("Username must be 3-20 characters (letters, numbers, _ or -).");
      }
      if (!password || password.length < 6) {
        errors.push("Password must be at least 6 characters.");
      }
      const month = Number(birthMonth);
      const year = Number(birthYear);
      if (!month || month < 1 || month > 12) {
        errors.push("Birth month must be 1-12.");
      }
      if (!year || year < 1900 || year > 2100) {
        errors.push("Birth year must be valid.");
      }
      if (gender !== "male" && gender !== "female") {
        errors.push("Gender must be selected.");
      }

      if (errors.length) {
        return res
          .status(400)
          .send(
            registerView({
              errors,
              values: { username, birthMonth, birthYear, gender }
            })
          );
      }

      const existing = await db.get(
        "SELECT id FROM users WHERE username = ?",
        username
      );
      if (existing) {
        return res
          .status(400)
          .send(
            registerView({
              errors: ["Username is already taken."],
              values: { username, birthMonth, birthYear, gender }
            })
          );
      }

      const hash = bcrypt.hashSync(password, 10);
      const createdAt = nowIso();
      await db.exec("BEGIN");
      let userId;
      try {
        const result = await db.run(
          "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
          [username, hash, createdAt]
        );
        userId = result.lastID;
        await db.run(
          "INSERT INTO profiles (user_id, birth_month, birth_year, gender, height_cm, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
          [userId, month, year, gender, null, createdAt, createdAt]
        );
        await db.exec("COMMIT");
      } catch (error) {
        await db.exec("ROLLBACK");
        throw error;
      }

      const sessionId = crypto.randomBytes(24).toString("hex");
      const expiresAt = new Date(
        Date.now() + SESSION_DAYS * 86400000
      ).toISOString();
      await db.run(
        "INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
        [sessionId, userId, createdAt, expiresAt]
      );

      res.cookie(SESSION_COOKIE_NAME, sessionId, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.COOKIE_SECURE === "true",
        maxAge: SESSION_DAYS * 86400000
      });

      res.redirect(`/u/${encodeURIComponent(username)}`);
    })
  );

  app.get("/login", (req, res) => {
    res.send(loginView({}));
  });

  app.post(
    "/login",
    asyncHandler(async (req, res) => {
      const { username, password } = req.body;
      const user = await db.get(
        "SELECT id, username, password_hash FROM users WHERE username = ?",
        username
      );
      if (!user || !bcrypt.compareSync(password, user.password_hash)) {
        return res.status(401).send(loginView({ error: "Invalid credentials." }));
      }
      const sessionId = crypto.randomBytes(24).toString("hex");
      const createdAt = nowIso();
      const expiresAt = new Date(
        Date.now() + SESSION_DAYS * 86400000
      ).toISOString();
      await db.run(
        "INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
        [sessionId, user.id, createdAt, expiresAt]
      );

      res.cookie(SESSION_COOKIE_NAME, sessionId, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.COOKIE_SECURE === "true",
        maxAge: SESSION_DAYS * 86400000
      });

      res.redirect(`/u/${encodeURIComponent(user.username)}`);
    })
  );

  app.post(
    "/logout",
    asyncHandler(async (req, res) => {
      const sessionId = req.cookies[SESSION_COOKIE_NAME];
      if (sessionId) {
        await db.run("DELETE FROM sessions WHERE id = ?", sessionId);
        res.clearCookie(SESSION_COOKIE_NAME);
      }
      res.redirect("/");
    })
  );

  app.get(
    "/u/:username",
    asyncHandler(async (req, res) => {
      const { username } = req.params;
      const profileUser = await db.get(
        "SELECT id, username FROM users WHERE username = ?",
        username
      );
      if (!profileUser) {
        return res.status(404).send("User not found");
      }
      const profile = await db.get(
        "SELECT birth_month, birth_year, gender, height_cm FROM profiles WHERE user_id = ?",
        profileUser.id
      );
      const entries = await db.all(
        "SELECT id, entry_date, weight_kg, height_cm, created_at, updated_at FROM entries WHERE user_id = ? ORDER BY entry_date ASC, updated_at ASC, id ASC",
        profileUser.id
      );

      const stats = computeStats(profile, entries);
      const isOwner = req.user && req.user.id === profileUser.id;
      res.send(
        profileView({
          user: req.user,
          profileUser,
          profile,
          entries,
          stats,
          isOwner
        })
      );
    })
  );

  app.post(
    "/u/:username/entries",
    asyncHandler(async (req, res) => {
      const { username } = req.params;
      const user = await db.get(
        "SELECT id FROM users WHERE username = ?",
        username
      );
      if (!user || !req.user || req.user.id !== user.id) {
        return res.status(403).send("Not allowed");
      }
      const { entryDate, weight, weightUnit, height, heightUnit } = req.body;
      const weightKg = toKg(weight, weightUnit || "kg");
      const heightCm = toCm(height, heightUnit || "cm");
      const parsedDate = parseDateInput(entryDate);
      if (!parsedDate) {
        return res
          .status(400)
          .send("Date must be YYYY-MM-DD (or YYYY-MMM-DD).");
      }
      if (weightKg == null && heightCm == null) {
        return res.status(400).send("Weight or height is required.");
      }
      const now = nowIso();
      await db.run(
        "INSERT INTO entries (user_id, entry_date, weight_kg, height_cm, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
        [user.id, parsedDate, weightKg, heightCm, now, now]
      );
      res.redirect(`/u/${encodeURIComponent(username)}`);
    })
  );

  app.post(
    "/u/:username/entries/:id",
    asyncHandler(async (req, res) => {
      const { username, id } = req.params;
      const user = await db.get(
        "SELECT id FROM users WHERE username = ?",
        username
      );
      if (!user || !req.user || req.user.id !== user.id) {
        return res.status(403).send("Not allowed");
      }
      const { entryDate, weight, height } = req.body;
      const weightKg = weight ? Number(weight) : null;
      const heightCm = height ? Number(height) : null;
      const parsedDate = parseDateInput(entryDate);
      if (!parsedDate) {
        return res
          .status(400)
          .send("Date must be YYYY-MM-DD (or YYYY-MMM-DD).");
      }
      if (weightKg == null && heightCm == null) {
        return res.status(400).send("Weight or height is required.");
      }
      await db.run(
        "UPDATE entries SET entry_date = ?, weight_kg = ?, height_cm = ?, updated_at = ? WHERE id = ? AND user_id = ?",
        [parsedDate, weightKg, heightCm, nowIso(), id, user.id]
      );
      res.redirect(`/u/${encodeURIComponent(username)}`);
    })
  );

  app.post(
    "/u/:username/entries/:id/delete",
    asyncHandler(async (req, res) => {
      const { username, id } = req.params;
      const user = await db.get(
        "SELECT id FROM users WHERE username = ?",
        username
      );
      if (!user || !req.user || req.user.id !== user.id) {
        return res.status(403).send("Not allowed");
      }
      await db.run(
        "DELETE FROM entries WHERE id = ? AND user_id = ?",
        [id, user.id]
      );
      res.redirect(`/u/${encodeURIComponent(username)}`);
    })
  );

  app.post(
    "/u/:username/profile",
    asyncHandler(async (req, res) => {
      const { username } = req.params;
      const user = await db.get(
        "SELECT id FROM users WHERE username = ?",
        username
      );
      if (!user || !req.user || req.user.id !== user.id) {
        return res.status(403).send("Not allowed");
      }
      const { birthMonth, birthYear, gender } = req.body;
      const month = Number(birthMonth);
      const year = Number(birthYear);
      if (!month || !year || (gender !== "male" && gender !== "female")) {
        return res.status(400).send("Invalid profile data.");
      }
      await db.run(
        "UPDATE profiles SET birth_month = ?, birth_year = ?, gender = ?, height_cm = ?, updated_at = ? WHERE user_id = ?",
        [month, year, gender, null, nowIso(), user.id]
      );
      res.redirect(`/u/${encodeURIComponent(username)}`);
    })
  );

  app.use((err, req, res, next) => {
    console.error(err);
    const message = err?.message || "Server error";
    const stack = err?.stack || "";
    res
      .status(500)
      .send(
        `<h1>Server error</h1><p>${message}</p><pre>${stack}</pre><p>Please copy this and send it to support.</p>`
      );
  });

  return app;
}
