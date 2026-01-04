import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { createApp } from "../src/app.js";

function setupTempDataDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bmi-test-"));
  process.env.APP_DATA_DIR = dir;
  return dir;
}

test("register, login, add entry, view profile", async () => {
  const dir = setupTempDataDir();
  const app = await createApp();

  const register = await request(app)
    .post("/register")
    .type("form")
    .send({
      username: "testuser",
      password: "secret123",
      birthMonth: "6",
      birthYear: "2012",
      gender: "female",
      height: "150",
      heightUnit: "cm"
    });

  assert.equal(register.status, 302);
  const cookie = register.headers["set-cookie"][0];

  const addEntry = await request(app)
    .post("/u/testuser/entries")
    .set("Cookie", cookie)
    .type("form")
    .send({
      entryDate: "2025-01-01",
      weight: "45",
      weightUnit: "kg",
      height: "152",
      heightUnit: "cm"
    });

  assert.equal(addEntry.status, 302);

  const profile = await request(app).get("/u/testuser");
  assert.equal(profile.status, 200);
  assert.match(profile.text, /testuser/);
  assert.match(profile.text, /BMI/);

  fs.rmSync(dir, { recursive: true, force: true });
});
