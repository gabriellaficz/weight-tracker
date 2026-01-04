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

function formatDateIso(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function todayText() {
  return formatDate(new Date().toISOString());
}

function todayIso() {
  const now = new Date();
  return now.toISOString().slice(0, 10);
}

function dateInputField({ name, value }) {
  const textValue = value ? formatDate(value) : todayText();
  const isoValue = value ? formatDateIso(value) : todayIso();
  return `
    <div class="date-field">
      <input type="text" name="${name}" value="${escapeHtml(textValue)}" data-date-text required />
      <button type="button" class="icon-button" data-date-open aria-label="Pick date"><span aria-hidden="true">📅</span></button>
      <input type="date" value="${escapeHtml(isoValue)}" data-date-picker />
    </div>
  `;
}

function monthKeyFromTimestamp(timestamp) {
  const date = new Date(timestamp);
  const year = date.getUTCFullYear();
  const month = date.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  return `${month} ${year}`;
}

function floorToMonth(timestamp) {
  const date = new Date(timestamp);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
}

function ceilToNextMonth(timestamp) {
  const date = new Date(timestamp);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1);
}

function monthTicks(start, end) {
  const ticks = [];
  let cursor = new Date(start);
  const endDate = new Date(end);
  while (cursor <= endDate) {
    ticks.push(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), 1));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return ticks;
}

function yTicks(minValue, maxValue, step) {
  const start = Math.floor(minValue / step) * step;
  const end = Math.ceil(maxValue / step) * step;
  const ticks = [];
  for (let value = start; value <= end; value += step) {
    ticks.push(value);
  }
  return ticks;
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
  <footer>Data source: <a href="https://www.cdc.gov/growthcharts/" target="_blank" rel="noreferrer">CDC BMI-for-age LMS tables</a>.</footer>
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
        <label>Username
          <input name="username" id="username-input" required value="${escapeHtml(values.username || "")}" />
          <small id="username-status" class="hint"></small>
        </label>
        <label>Password <input type="password" name="password" required /></label>
        <label>Birth month
          <select name="birthMonth" required>
            <option value="">Select</option>
            ${Array.from({ length: 12 }, (_, i) => {
              const month = String(i + 1);
              const selected = values.birthMonth === month ? "selected" : "";
              const label = new Date(Date.UTC(2000, i, 1)).toLocaleString("en-US", { month: "short", timeZone: "UTC" });
              return `<option value="${month}" ${selected}>${label}</option>`;
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
      <script>
        const nameInput = document.getElementById('username-input');
        const statusEl = document.getElementById('username-status');
        if (nameInput && statusEl) {
          nameInput.addEventListener('blur', async () => {
            const value = nameInput.value.trim();
            statusEl.textContent = '';
            statusEl.className = 'hint';
            if (value.length < 3) return;
            try {
              const res = await fetch('/api/username-available?username=' + encodeURIComponent(value));
              const data = await res.json();
              if (data.available) {
                statusEl.textContent = 'Available';
                statusEl.className = 'hint ok';
              } else {
                statusEl.textContent = 'Taken';
                statusEl.className = 'hint error';
              }
            } catch (error) {
              statusEl.textContent = 'Unable to check';
              statusEl.className = 'hint error';
            }
          });
        }
      </script>
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

function svgLineChart({ title, unit, points, emptyMessage, className, yStep }) {
  if (!points || points.length === 0) {
    return `<div class="chart-empty">${escapeHtml(emptyMessage || "No data yet.")}</div>`;
  }
  const width = 600;
  const height = 220;
  const padding = 36;
  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const dataMinX = Math.min(...points.map((point) => point.x));
  const dataMaxX = Math.max(...points.map((point) => point.x));
  const minX = floorToMonth(dataMinX);
  const maxX = ceilToNextMonth(dataMaxX);
  const xRange = maxX - minX || 1;
  const scaled = points.map((point) => {
    const x =
      padding + ((point.x - minX) / xRange) * (width - padding * 2);
    const y =
      padding + (height - padding * 2) * (1 - (point.value - min) / range);
    return { x, y, value: point.value };
  });
  const path = scaled.map((point, index) => `${index === 0 ? "M" : "L"}${point.x},${point.y}`).join(" ");
  const ticks = monthTicks(minX, maxX);
  const xTicks = ticks
    .map((tick) => {
      const x =
        padding + ((tick - minX) / xRange) * (width - padding * 2);
      return `<line class="tick" x1="${x}" x2="${x}" y1="${height - padding}" y2="${height - padding + 6}" />`;
    })
    .join("");
  const yTickStep = yStep || range / 4 || 1;
  const yTickValues = yTicks(min, max, yTickStep);
  const yTicksSvg = yTickValues
    .map((value) => {
      const y =
        padding + (height - padding * 2) * (1 - (value - min) / range);
      return `<line class="tick" x1="${padding - 6}" x2="${padding}" y1="${y}" y2="${y}" />
        <text class="y-label" x="${padding - 10}" y="${y + 4}">${Number.isInteger(value) ? value : value.toFixed(1)}</text>`;
    })
    .join("");
  const axisLabels = `
    <text class="x-edge" x="${padding}" y="${height - 8}">${monthKeyFromTimestamp(minX)}</text>
    <text class="x-edge" x="${width - padding}" y="${height - 8}" text-anchor="end">${monthKeyFromTimestamp(maxX)}</text>
  `;
  return `
    <div class="chart ${className || ""}">
      <div class="chart-title">${escapeHtml(title)} <span>${escapeHtml(unit)}</span></div>
      <svg viewBox="0 0 ${width} ${height}" role="img">
        <line class="axis" x1="${padding}" x2="${padding}" y1="${padding}" y2="${height - padding}" />
        <line class="axis" x1="${padding}" x2="${width - padding}" y1="${height - padding}" y2="${height - padding}" />
        ${xTicks}
        ${yTicksSvg}
        <path d="${path}" />
      </svg>
      ${axisLabels}
    </div>
  `;
}

function profileView({ user, profileUser, profile, entries, stats, isOwner }) {
  const entryRows = entries
    .map((entry) => {
      const bmiText = entry.bmi ? entry.bmi.toFixed(1) : "-";
      const percText = entry.percentile ? `${entry.percentile.toFixed(1)}%` : "-";
      const weightText = entry.weight_kg != null ? `${entry.weight_kg.toFixed(1)} kg` : "-";
      const heightText = entry.height_cm != null ? `${entry.height_cm.toFixed(1)} cm` : "-";
      return `
        <tr>
          <td>${escapeHtml(formatDate(entry.entry_date))}</td>
          <td class="compact">${weightText}</td>
          <td class="compact">${heightText}</td>
          <td>${bmiText}</td>
          <td>${percText}</td>
          ${isOwner ? `<td>
            <button type="button" class="icon-button" data-entry-edit data-entry-id="${entry.id}" data-entry-date="${escapeHtml(formatDate(entry.entry_date))}" data-entry-weight="${escapeHtml(entry.weight_kg ?? "")}" data-entry-height="${escapeHtml(entry.height_cm ?? "")}" aria-label="Edit entry">
              <span aria-hidden="true">✎</span>
            </button>
            <form method="post" action="/u/${encodeURIComponent(profileUser.username)}/entries/${entry.id}/delete" class="inline">
              <button type="submit" class="icon-button danger" aria-label="Delete entry"><span aria-hidden="true">🗑</span></button>
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
        <form method="post" action="/u/${encodeURIComponent(profileUser.username)}/entries" class="stack entry-form">
          <div class="entry-row">
            <label>Date ${dateInputField({ name: "entryDate" })}</label>
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
          </div>
          <button type="submit">Save entry</button>
        </form>
      </section>
    `
    : "";

  const profileCard = isOwner
    ? `
      <section class="card">
        <div class="card-header">
          <h2>Profile settings</h2>
          <button type="button" class="icon-button" data-profile-edit aria-label="Edit profile">
            <span aria-hidden="true">✎</span>
          </button>
        </div>
        <div class="profile-static">
          <div><strong>Birth month</strong><span>${escapeHtml(profile.birth_month)}</span></div>
          <div><strong>Birth year</strong><span>${escapeHtml(profile.birth_year)}</span></div>
          <div><strong>Gender</strong><span>${escapeHtml(profile.gender)}</span></div>
        </div>
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
    <section class="charts" data-unit="metric">
      <div class="chart-toolbar">
        <button type="button" class="toggle-button" data-unit-toggle>kg/cm</button>
      </div>
      ${svgLineChart({
        title: "Weight",
        unit: "kg",
        points: stats.weightSeries,
        emptyMessage: weightEmpty,
        className: "weight metric",
        yStep: 1
      })}
      ${svgLineChart({
        title: "Weight",
        unit: "lb",
        points: stats.weightSeriesImperial,
        emptyMessage: weightEmpty,
        className: "weight imperial",
        yStep: 1
      })}
      ${svgLineChart({
        title: "Height",
        unit: "cm",
        points: stats.heightSeries,
        emptyMessage: heightEmpty,
        className: "height metric",
        yStep: 10
      })}
      ${svgLineChart({
        title: "Height",
        unit: "in",
        points: stats.heightSeriesImperial,
        emptyMessage: heightEmpty,
        className: "height imperial",
        yStep: 6
      })}
      ${svgLineChart({
        title: "BMI",
        unit: "",
        points: stats.bmiSeries,
        emptyMessage: bmiEmpty,
        className: "bmi",
        yStep: 1
      })}
      ${svgLineChart({
        title: "Percentile",
        unit: "%",
        points: stats.percentileSeries,
        emptyMessage: percentileEmpty,
        className: "percentile",
        yStep: 5
      })}
    </section>
    ${entryForm}
    ${profileCard}
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
              ${isOwner ? "<th>Actions</th>" : ""}
            </tr>
          </thead>
          <tbody>${entryRows || "<tr><td colspan=\"6\">No entries yet.</td></tr>"}</tbody>
        </table>
      </div>
    </section>
    ${isOwner ? `
      <dialog id="entry-edit-dialog">
        <form method="post" class="stack" id="entry-edit-form">
          <h3>Edit entry</h3>
          <label>Date ${dateInputField({ name: "entryDate", value: null })}</label>
          <label>Weight (kg) <input type="number" step="0.1" name="weight" /></label>
          <label>Height (cm) <input type="number" step="0.1" name="height" /></label>
          <div class="row">
            <button type="submit">Save</button>
            <button type="button" class="ghost" data-dialog-close>Cancel</button>
          </div>
        </form>
      </dialog>
      <dialog id="profile-edit-dialog">
        <form method="post" action="/u/${encodeURIComponent(profileUser.username)}/profile" class="stack">
          <h3>Edit profile</h3>
          <label>Birth month
            <select name="birthMonth" required>
              ${Array.from({ length: 12 }, (_, i) => {
                const month = String(i + 1);
                const selected = Number(profile.birth_month) === i + 1 ? "selected" : "";
                const label = new Date(Date.UTC(2000, i, 1)).toLocaleString("en-US", { month: "short", timeZone: "UTC" });
                return `<option value="${month}" ${selected}>${label}</option>`;
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
          <div class="row">
            <button type="submit">Save</button>
            <button type="button" class="ghost" data-dialog-close>Cancel</button>
          </div>
        </form>
      </dialog>
      <script>
        const entryDialog = document.getElementById('entry-edit-dialog');
        const entryFormEl = document.getElementById('entry-edit-form');
        const monthMap = {
          jan: '01',
          feb: '02',
          mar: '03',
          apr: '04',
          may: '05',
          jun: '06',
          jul: '07',
          aug: '08',
          sep: '09',
          oct: '10',
          nov: '11',
          dec: '12'
        };
        const toIsoDate = (text) => {
          const match = String(text || '').match(/^(\\d{4})-([A-Za-z]{3})-(\\d{2})$/);
          if (!match) return '';
          const month = monthMap[match[2].toLowerCase()];
          if (!month) return '';
          return match[1] + '-' + month + '-' + match[3];
        };
        document.querySelectorAll('[data-entry-edit]').forEach((button) => {
          button.addEventListener('click', () => {
            const id = button.getAttribute('data-entry-id');
            const date = button.getAttribute('data-entry-date') || '';
            const weight = button.getAttribute('data-entry-weight') || '';
            const height = button.getAttribute('data-entry-height') || '';
            entryFormEl.action = '/u/${encodeURIComponent(profileUser.username)}/entries/' + id;
            entryFormEl.querySelector('[data-date-text]').value = date;
            entryFormEl.querySelector('[data-date-picker]').value = toIsoDate(date);
            entryFormEl.querySelector('[name="weight"]').value = weight;
            entryFormEl.querySelector('[name="height"]').value = height;
            entryDialog.showModal();
          });
        });
        document.querySelectorAll('[data-date-open]').forEach((button) => {
          button.addEventListener('click', () => {
            const field = button.closest('.date-field');
            const picker = field.querySelector('[data-date-picker]');
            if (picker.showPicker) {
              picker.showPicker();
            } else {
              picker.focus();
            }
          });
        });
        document.querySelectorAll('[data-date-picker]').forEach((picker) => {
          picker.addEventListener('change', () => {
            const field = picker.closest('.date-field');
            const textInput = field.querySelector('[data-date-text]');
            const value = picker.value;
            if (!value) return;
            const date = new Date(value + 'T00:00:00Z');
            const year = date.getUTCFullYear();
            const month = date.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
            const day = String(date.getUTCDate()).padStart(2, '0');
            textInput.value = year + '-' + month + '-' + day;
          });
        });
        document.querySelectorAll('[data-dialog-close]').forEach((button) => {
          button.addEventListener('click', () => {
            button.closest('dialog').close();
          });
        });
        const profileDialog = document.getElementById('profile-edit-dialog');
        const profileButton = document.querySelector('[data-profile-edit]');
        if (profileButton && profileDialog) {
          profileButton.addEventListener('click', () => profileDialog.showModal());
        }
        const chartSection = document.querySelector('.charts');
        const unitToggle = document.querySelector('[data-unit-toggle]');
        if (chartSection && unitToggle) {
          const saved = localStorage.getItem('chartUnits') || 'metric';
          chartSection.setAttribute('data-unit', saved);
          unitToggle.textContent = saved === 'metric' ? 'kg/cm' : 'lb/in';
          unitToggle.addEventListener('click', () => {
            const next = chartSection.getAttribute('data-unit') === 'metric' ? 'imperial' : 'metric';
            chartSection.setAttribute('data-unit', next);
            unitToggle.textContent = next === 'metric' ? 'kg/cm' : 'lb/in';
            localStorage.setItem('chartUnits', next);
          });
        }
      </script>
    ` : ""}
  `;

  return layout({ title: `${profileUser.username} · BMI`, body, user });
}

export { homeView, loginView, registerView, profileView, formatDate };
