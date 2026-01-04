function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getUTCFullYear();
  const month = date.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function todayText() {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  const day = String(now.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function layout({ title, body, user }) {
  const authLinks = user
    ? `<form class="inline" method="post" action="/logout"><button type="submit">Log out</button></form>`
    : `<a href="/login">Log in</a> <a href="/register">Register</a>`;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <link rel="stylesheet" href="/styles.css" />
</head>
<body>
  <header class="site-header">
    <div class="brand">
      <a href="/">BMI Tracker</a>
      <span>CDC percentiles for ages 2-20</span>
    </div>
    <nav>${authLinks}</nav>
  </header>
  <main>${body}</main>
  <footer>Data source: CDC BMI-for-age LMS tables (bmiagerev.csv).</footer>
</body>
</html>`;
}

function homeView({ user }) {
  const body = `
    <section class="hero">
      <h1>Track BMI, percentile, weight, and height over time.</h1>
      <p>Public profiles for sharing. Editing requires a password.</p>
      <div class="hero-actions">
        <a class="button" href="/register">Claim a username</a>
        <a class="button ghost" href="/login">Log in</a>
      </div>
    </section>
    <section class="card">
      <h2>How it works</h2>
      <ol>
        <li>Register a username and set birth details.</li>
        <li>Add weight and height entries in metric or imperial units.</li>
        <li>See BMI percentiles (ages 2-20) and trend charts.</li>
      </ol>
    </section>
  `;
  return layout({ title: "BMI Tracker", body, user });
}

function registerView({ errors = [], values = {} }) {
  const errorList = errors.length
    ? `<div class="alert">${errors.map(escapeHtml).join("<br />")}</div>`
    : "";
  const body = `
    <section class="card">
      <h1>Claim a username</h1>
      ${errorList}
      <form method="post" action="/register" class="stack">
        <label>Username <input name="username" required value="${escapeHtml(values.username || "")}" /></label>
        <label>Password <input type="password" name="password" required /></label>
        <label>Birth month
          <select name="birthMonth" required>
            <option value="">Select</option>
            ${Array.from({ length: 12 }, (_, i) => {
              const month = String(i + 1);
              const selected = values.birthMonth === month ? "selected" : "";
              return `<option value="${month}" ${selected}>${month}</option>`;
            }).join("")}
          </select>
        </label>
        <label>Birth year <input type="number" name="birthYear" min="1900" max="2100" required value="${escapeHtml(values.birthYear || "")}" /></label>
        <label>Gender
          <select name="gender" required>
            <option value="">Select</option>
            <option value="male" ${values.gender === "male" ? "selected" : ""}>Male</option>
            <option value="female" ${values.gender === "female" ? "selected" : ""}>Female</option>
          </select>
        </label>
        <button type="submit">Create profile</button>
      </form>
    </section>
  `;
  return layout({ title: "Register", body, user: null });
}

function loginView({ error }) {
  const body = `
    <section class="card">
      <h1>Log in</h1>
      ${error ? `<div class="alert">${escapeHtml(error)}</div>` : ""}
      <form method="post" action="/login" class="stack">
        <label>Username <input name="username" required /></label>
        <label>Password <input type="password" name="password" required /></label>
        <button type="submit">Log in</button>
      </form>
    </section>
  `;
  return layout({ title: "Log in", body, user: null });
}

function svgLineChart({ title, unit, points, emptyMessage }) {
  if (!points || points.length === 0) {
    return `<div class="chart-empty">${escapeHtml(emptyMessage || "No data yet.")}</div>`;
  }
  const width = 600;
  const height = 220;
  const padding = 30;
  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const xStep = (width - padding * 2) / (points.length - 1 || 1);
  const scaled = points.map((point, index) => {
    const x = padding + index * xStep;
    const y = padding + (height - padding * 2) * (1 - (point.value - min) / range);
    return { x, y, label: point.label, value: point.value };
  });
  const path = scaled.map((point, index) => `${index === 0 ? "M" : "L"}${point.x},${point.y}`).join(" ");
  const circles = scaled
    .map(
      (point) =>
        `<circle cx="${point.x}" cy="${point.y}" r="3" /><text x="${point.x}" y="${point.y - 8}">${point.value.toFixed(1)}</text>`
    )
    .join("");
  const labels = scaled
    .map(
      (point) =>
        `<text class="x-label" x="${point.x}" y="${height - 8}">${escapeHtml(point.label)}</text>`
    )
    .join("");
  return `
    <div class="chart">
      <div class="chart-title">${escapeHtml(title)} <span>${escapeHtml(unit)}</span></div>
      <svg viewBox="0 0 ${width} ${height}" role="img">
        <path d="${path}" />
        ${circles}
        ${labels}
      </svg>
      <div class="chart-range">min ${min.toFixed(1)} ${escapeHtml(unit)} · max ${max.toFixed(1)} ${escapeHtml(unit)}</div>
    </div>
  `;
}

function profileView({ user, profileUser, profile, entries, stats, isOwner }) {
  const entryRows = entries
    .map((entry) => {
      const bmiText = entry.bmi ? entry.bmi.toFixed(1) : "-";
      const percText = entry.percentile ? `${entry.percentile.toFixed(1)}%` : "-";
      return `
        <tr>
          <td>${escapeHtml(entry.entry_date)}</td>
          <td>${entry.weight_kg ? entry.weight_kg.toFixed(1) : "-"} kg</td>
          <td>${entry.height_cm ? entry.height_cm.toFixed(1) : "-"} cm</td>
          <td>${bmiText}</td>
          <td>${percText}</td>
          ${isOwner ? `<td>
            <form method="post" action="/u/${encodeURIComponent(profileUser.username)}/entries/${entry.id}" class="row">
              <input type="text" name="entryDate" value="${escapeHtml(formatDate(entry.entry_date))}" placeholder="YYYY-MMM-DD" required />
              <input type="number" step="0.1" name="weight" value="${escapeHtml(entry.weight_kg ?? "")}" placeholder="kg" />
              <input type="number" step="0.1" name="height" value="${escapeHtml(entry.height_cm ?? "")}" placeholder="cm" />
              <input type="hidden" name="unit" value="metric" />
              <button type="submit">Update</button>
            </form>
          </td>` : ""}
        </tr>
      `;
    })
    .join("");

  const entryForm = isOwner
    ? `
      <section class="card">
        <h2>Add entry</h2>
        <form method="post" action="/u/${encodeURIComponent(profileUser.username)}/entries" class="stack">
          <label>Date <input type="text" name="entryDate" value="${escapeHtml(todayText())}" placeholder="YYYY-MMM-DD" required /></label>
          <label>Weight
            <div class="row">
              <input type="number" step="0.1" name="weight" />
              <select name="weightUnit">
                <option value="kg">kg</option>
                <option value="lb">lb</option>
              </select>
            </div>
          </label>
          <label>Height
            <div class="row">
              <input type="number" step="0.1" name="height" />
              <select name="heightUnit">
                <option value="cm">cm</option>
                <option value="in">in</option>
              </select>
            </div>
          </label>
          <button type="submit">Save entry</button>
        </form>
      </section>
    `
    : "";

  const profileForm = isOwner
    ? `
      <section class="card">
        <h2>Profile settings</h2>
        <form method="post" action="/u/${encodeURIComponent(profileUser.username)}/profile" class="stack">
          <label>Birth month
            <select name="birthMonth" required>
              ${Array.from({ length: 12 }, (_, i) => {
                const month = String(i + 1);
                const selected = Number(profile.birth_month) === i + 1 ? "selected" : "";
                return `<option value="${month}" ${selected}>${month}</option>`;
              }).join("")}
            </select>
          </label>
          <label>Birth year <input type="number" name="birthYear" min="1900" max="2100" required value="${escapeHtml(profile.birth_year)}" /></label>
          <label>Gender
            <select name="gender" required>
              <option value="male" ${profile.gender === "male" ? "selected" : ""}>Male</option>
              <option value="female" ${profile.gender === "female" ? "selected" : ""}>Female</option>
            </select>
          </label>
          <button type="submit">Update profile</button>
        </form>
      </section>
    `
    : "";

  const latestStat = stats.latest
    ? `<div class="stat"><strong>Latest BMI</strong><span>${stats.latest.bmi != null ? stats.latest.bmi.toFixed(1) : "-"}</span><span>${stats.latest.category || ""}</span></div>
       <div class="stat"><strong>Latest percentile</strong><span>${stats.latest.percentile != null ? stats.latest.percentile.toFixed(1) + "%" : "-"}</span><span>${stats.latest.percentileCategory || ""}</span></div>`
    : "";

  const weightEmpty = stats.weightSeries.length
    ? null
    : "Add weight entries to see this chart.";
  const heightEmpty = stats.heightSeries.length
    ? null
    : "Add height entries to see this chart.";
  const bmiEmpty = stats.bmiSeries.length
    ? null
    : stats.weightSeries.length && stats.heightSeries.length
      ? "Add height on or before a weight date to compute BMI."
      : "Add both height and weight to compute BMI.";
  const percentileEmpty = stats.percentileSeries.length
    ? null
    : stats.bmiSeries.length
      ? "Percentiles are shown for ages 2–20."
      : "Percentiles need BMI plus age 2–20.";

  const body = `
    <section class="profile">
      <div>
        <h1>${escapeHtml(profileUser.username)}</h1>
        <p>Birth: ${escapeHtml(profile.birth_month)}/${escapeHtml(profile.birth_year)} · ${escapeHtml(profile.gender)}</p>
      </div>
      <div class="stats">${latestStat}</div>
    </section>
    <section class="charts">
      ${svgLineChart({
        title: "Weight",
        unit: "kg",
        points: stats.weightSeries,
        emptyMessage: weightEmpty
      })}
      ${svgLineChart({
        title: "Height",
        unit: "cm",
        points: stats.heightSeries,
        emptyMessage: heightEmpty
      })}
      ${svgLineChart({
        title: "BMI",
        unit: "",
        points: stats.bmiSeries,
        emptyMessage: bmiEmpty
      })}
      ${svgLineChart({
        title: "Percentile",
        unit: "%",
        points: stats.percentileSeries,
        emptyMessage: percentileEmpty
      })}
    </section>
    ${entryForm}
    ${profileForm}
    <section class="card">
      <h2>Entries</h2>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Weight</th>
              <th>Height</th>
              <th>BMI</th>
              <th>Percentile</th>
              ${isOwner ? "<th>Edit</th>" : ""}
            </tr>
          </thead>
          <tbody>${entryRows || "<tr><td colspan=\"6\">No entries yet.</td></tr>"}</tbody>
        </table>
      </div>
    </section>
  `;

  return layout({ title: `${profileUser.username} · BMI`, body, user });
}

export { homeView, loginView, registerView, profileView, formatDate };
