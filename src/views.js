function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function ordinalSuffix(value) {
  const number = Math.round(value);
  const mod10 = number % 10;
  const mod100 = number % 100;
  if (mod10 === 1 && mod100 !== 11) return `${number}st`;
  if (mod10 === 2 && mod100 !== 12) return `${number}nd`;
  if (mod10 === 3 && mod100 !== 13) return `${number}rd`;
  return `${number}th`;
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
      <small class="hint date-hint"></small>
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

function svgLineChart() {
  return "";
}

function chartCard({ id, title, unit, hasData, emptyMessage, unitToggle }) {
  if (!hasData) {
    return `<div class="chart-empty">${escapeHtml(emptyMessage || "No data yet.")}</div>`;
  }
  const unitControl = unitToggle
    ? `<button type="button" class="unit-toggle" data-chart-toggle="${id}" data-unit="${escapeHtml(unit)}" aria-label="Toggle unit">${escapeHtml(unit)}</button>`
    : `<span>${escapeHtml(unit)}</span>`;
  return `
    <div class="chart-card" data-chart="${escapeHtml(id)}">
      <div class="chart-title">${escapeHtml(title)} ${unitControl}</div>
      <div class="chart-body" id="chart-${escapeHtml(id)}"></div>
      <div class="x-range">
        <span class="x-start"></span>
        <span class="x-end"></span>
      </div>
    </div>
  `;
}

function profileView({ user, profileUser, profile, entries, stats, isOwner }) {
  const weightData = stats.weightSeries.map((point) => ({
    x: point.x,
    y: point.value
  }));
  const weightImperialData = stats.weightSeriesImperial.map((point) => ({
    x: point.x,
    y: point.value
  }));
  const heightData = stats.heightSeries.map((point) => ({
    x: point.x,
    y: point.value
  }));
  const heightImperialData = stats.heightSeriesImperial.map((point) => ({
    x: point.x,
    y: point.value
  }));
  const bmiData = stats.bmiSeries.map((point) => ({
    x: point.x,
    y: point.value
  }));
  const percentileData = stats.percentileSeries.map((point) => ({
    x: point.x,
    y: point.value
  }));
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
            <div class="entry-actions">
              <button type="submit">Save</button>
            </div>
          </div>
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
          <div><strong>Birth month</strong><span>${escapeHtml(new Date(Date.UTC(2000, profile.birth_month - 1, 1)).toLocaleString("en-US", { month: "short", timeZone: "UTC" }))}</span></div>
          <div><strong>Birth year</strong><span>${escapeHtml(profile.birth_year)}</span></div>
          <div><strong>Gender</strong><span>${escapeHtml(profile.gender)}</span></div>
        </div>
      </section>
    `
    : "";

  const latestStat = stats.latest
    ? (() => {
        const bmiText = stats.latest.bmi != null ? stats.latest.bmi.toFixed(1) : "-";
        const percentileText =
          stats.latest.percentile != null
            ? `${ordinalSuffix(stats.latest.percentile)}%ile`
            : null;
        const category = stats.latest.category || "";
        const detail = percentileText ? ` (${percentileText})` : "";
        return `<div class="stat wide"><strong>Latest BMI</strong><span>${bmiText}${detail}</span><span>${category}</span></div>`;
      })()
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
        <p>Birth: ${escapeHtml(new Date(Date.UTC(2000, profile.birth_month - 1, 1)).toLocaleString("en-US", { month: "short", timeZone: "UTC" }))} ${escapeHtml(profile.birth_year)} · ${escapeHtml(profile.gender)}</p>
      </div>
      <div class="stats">${latestStat}</div>
    </section>
    <section class="charts">
      ${chartCard({
        id: "weight",
        title: "Weight",
        unit: "kg",
        hasData: stats.weightSeries.length > 0,
        emptyMessage: weightEmpty,
        unitToggle: true
      })}
      ${chartCard({
        id: "height",
        title: "Height",
        unit: "cm",
        hasData: stats.heightSeries.length > 0,
        emptyMessage: heightEmpty,
        unitToggle: true
      })}
      ${chartCard({
        id: "bmi",
        title: "BMI",
        unit: "",
        hasData: stats.bmiSeries.length > 0,
        emptyMessage: bmiEmpty
      })}
      ${chartCard({
        id: "percentile",
        title: "Percentile",
        unit: "%",
        hasData: stats.percentileSeries.length > 0,
        emptyMessage: percentileEmpty
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
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const monthMap = monthNames.reduce((acc, name, index) => {
          acc[name.toLowerCase()] = String(index + 1).padStart(2, '0');
          return acc;
        }, {});
        const parseDateText = (text) => {
          const value = String(text || '').trim();
          const match = value.match(/^(\\d{4})-([A-Za-z]{3}|\\d{1,2})-(\\d{2})$/);
          if (!match) return null;
          const year = Number(match[1]);
          const monthToken = match[2];
          const day = Number(match[3]);
          const monthNumber = /[A-Za-z]/.test(monthToken)
            ? monthMap[monthToken.toLowerCase()]
            : String(Number(monthToken)).padStart(2, '0');
          if (!monthNumber) return null;
          const monthIndex = Number(monthNumber) - 1;
          const date = new Date(Date.UTC(year, monthIndex, day));
          if (Number.isNaN(date.getTime())) return null;
          if (date.getUTCFullYear() !== year || date.getUTCMonth() !== monthIndex || date.getUTCDate() !== day) {
            return null;
          }
          const normalizedText = year + '-' + monthNames[monthIndex] + '-' + String(day).padStart(2, '0');
          const iso = year + '-' + monthNumber + '-' + String(day).padStart(2, '0');
          return { text: normalizedText, iso };
        };
        document.querySelectorAll('[data-entry-edit]').forEach((button) => {
          button.addEventListener('click', () => {
            const id = button.getAttribute('data-entry-id');
            const date = button.getAttribute('data-entry-date') || '';
            const weight = button.getAttribute('data-entry-weight') || '';
            const height = button.getAttribute('data-entry-height') || '';
            entryFormEl.action = '/u/${encodeURIComponent(profileUser.username)}/entries/' + id;
            const parsed = parseDateText(date);
            entryFormEl.querySelector('[data-date-text]').value = parsed ? parsed.text : date;
            entryFormEl.querySelector('[data-date-picker]').value = parsed ? parsed.iso : '';
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
        document.querySelectorAll('[data-date-text]').forEach((input) => {
          input.addEventListener('blur', () => {
            const field = input.closest('.date-field');
            const hint = field.querySelector('.date-hint');
            const result = parseDateText(input.value);
            if (!result) {
              hint.textContent = 'Use YYYY-MMM-DD or YYYY-MM-DD';
              hint.className = 'hint date-hint error';
              input.classList.add('input-error');
              return;
            }
            hint.textContent = '';
            hint.className = 'hint date-hint';
            input.classList.remove('input-error');
            input.value = result.text;
            const picker = field.querySelector('[data-date-picker]');
            picker.value = result.iso;
          });
        });
        document.querySelectorAll('form').forEach((form) => {
          form.addEventListener('submit', (event) => {
            const input = form.querySelector('[data-date-text]');
            if (!input) return;
            const field = input.closest('.date-field');
            const hint = field.querySelector('.date-hint');
            const result = parseDateText(input.value);
            if (!result) {
              event.preventDefault();
              hint.textContent = 'Use YYYY-MMM-DD or YYYY-MM-DD';
              hint.className = 'hint date-hint error';
              input.classList.add('input-error');
            }
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
      </script>
    ` : ""}
    <script src="https://cdn.jsdelivr.net/npm/echarts@5.5.0/dist/echarts.min.js"></script>
    <script>
      const chartPayload = {
        weight: {
          metric: ${JSON.stringify(weightData)},
          imperial: ${JSON.stringify(weightImperialData)}
        },
        height: {
          metric: ${JSON.stringify(heightData)},
          imperial: ${JSON.stringify(heightImperialData)}
        },
        bmi: ${JSON.stringify(bmiData)},
        percentile: ${JSON.stringify(percentileData)}
      };
      const unitConfig = {
        weight: { metric: { unit: 'kg', step: 1 }, imperial: { unit: 'lb', step: 1 } },
        height: { metric: { unit: 'cm', step: 10 }, imperial: { unit: 'in', step: 6 } },
        bmi: { unit: '', step: 1 },
        percentile: { unit: '%', step: 5 }
      };
      const monthLabel = (value) => {
        const date = new Date(value);
        return date.toLocaleString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
      };
      const dateLabel = (value) => {
        const date = new Date(value);
        const year = date.getUTCFullYear();
        const month = date.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
        const day = String(date.getUTCDate()).padStart(2, '0');
        return year + '-' + month + '-' + day;
      };
      const computeRange = (data) => {
        if (!data.length) return null;
        const min = Math.min(...data.map((point) => point.x));
        const max = Math.max(...data.map((point) => point.x));
        const span = max - min;
        const dayMs = 24 * 60 * 60 * 1000;
        const weekMs = 7 * dayMs;
        const minSpan = 3 * dayMs;

        const dayStart = (value) => {
          const date = new Date(value);
          date.setUTCHours(0, 0, 0, 0);
          return date.getTime();
        };
        const dayEnd = (value) => {
          const date = new Date(value);
          date.setUTCHours(0, 0, 0, 0);
          return date.getTime() + dayMs;
        };
        const weekStart = (value) => {
          const date = new Date(value);
          const day = date.getUTCDay();
          const diff = day === 0 ? 6 : day - 1;
          date.setUTCDate(date.getUTCDate() - diff);
          date.setUTCHours(0, 0, 0, 0);
          return date.getTime();
        };
        const weekEnd = (value) => {
          return weekStart(value) + weekMs;
        };
        const monthStart = (value) => {
          const date = new Date(value);
          return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
        };
        const monthEnd = (value) => {
          const date = new Date(value);
          return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1);
        };
        const quarterStart = (value) => {
          const date = new Date(value);
          const month = date.getUTCMonth();
          const quarter = Math.floor(month / 3) * 3;
          return Date.UTC(date.getUTCFullYear(), quarter, 1);
        };
        const quarterEnd = (value) => {
          const start = new Date(quarterStart(value));
          return Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 3, 1);
        };

        let rangeStart;
        let rangeEnd;
        if (span < 15 * dayMs) {
          rangeStart = dayStart(min);
          rangeEnd = dayEnd(max);
          if (rangeEnd - rangeStart < minSpan) {
            const mid = (min + max) / 2;
            rangeStart = dayStart(mid - minSpan / 2);
            rangeEnd = rangeStart + minSpan;
          }
        } else if (span < 12 * weekMs) {
          rangeStart = weekStart(min);
          rangeEnd = weekEnd(max);
        } else if (span < 2 * 365 * dayMs) {
          rangeStart = monthStart(min);
          rangeEnd = monthEnd(max);
        } else {
          rangeStart = quarterStart(min);
          rangeEnd = quarterEnd(max);
        }

        return { min: rangeStart, max: rangeEnd };
      };
      const niceNum = (range, round) => {
        const exponent = Math.floor(Math.log10(range));
        const fraction = range / Math.pow(10, exponent);
        let niceFraction;
        if (round) {
          if (fraction < 1.5) niceFraction = 1;
          else if (fraction < 3) niceFraction = 2;
          else if (fraction < 7) niceFraction = 5;
          else niceFraction = 10;
        } else {
          if (fraction <= 1) niceFraction = 1;
          else if (fraction <= 2) niceFraction = 2;
          else if (fraction <= 5) niceFraction = 5;
          else niceFraction = 10;
        }
        return niceFraction * Math.pow(10, exponent);
      };
      const roundTo = (value, decimals) => {
        if (!Number.isFinite(value)) return value;
        const factor = Math.pow(10, decimals);
        return Math.round(value * factor) / factor;
      };
      const niceScale = (values, options = {}) => {
        if (!values.length) return { min: 0, max: 1, interval: 1 };
        const min = Math.min(...values);
        const max = Math.max(...values);
        const minRange = options.minRange || 0;
        const minInterval = options.minInterval || 0;
        const minFloor = options.minFloor ?? null;
        if (min === max) {
          const base = Math.abs(min) || 1;
          const step = niceNum(base / 2, true);
          const range = Math.max(step * 4, minRange);
          const interval = Math.max(step, minInterval);
          let minValue = min - range / 2;
          let maxValue = max + range / 2;
          if (minFloor != null && minValue < minFloor) {
            minValue = minFloor;
            maxValue = minValue + range;
          }
          const decimals = Math.max(0, Math.ceil(-Math.log10(interval)));
          return {
            min: roundTo(minValue, decimals),
            max: roundTo(maxValue, decimals),
            interval: roundTo(interval, decimals)
          };
        }
        const span = max - min;
        let niceMin;
        let niceMax;
        let interval;
        if (minRange && span < minRange) {
          const mid = (min + max) / 2;
          interval = Math.max(minInterval, minRange / 2);
          niceMin = mid - minRange / 2;
          niceMax = mid + minRange / 2;
        } else {
          const pad = Math.max(span * 0.1, minRange ? minRange / 2 : 0);
          let paddedMin = min - pad;
          let paddedMax = max + pad;
          if (minFloor != null && paddedMin < minFloor) {
            paddedMin = minFloor;
          }
          const range = niceNum(paddedMax - paddedMin, false);
          interval = Math.max(niceNum(range / 4, true), minInterval, 1e-9);
          niceMin = Math.floor(paddedMin / interval) * interval;
          niceMax = Math.ceil(paddedMax / interval) * interval;
        }
        if (minFloor != null && niceMin < minFloor) {
          const spanSize = niceMax - niceMin;
          niceMin = minFloor;
          niceMax = niceMin + spanSize;
        }
        const decimals = Math.max(0, Math.ceil(-Math.log10(interval)));
        return {
          min: roundTo(niceMin, decimals),
          max: roundTo(niceMax, decimals),
          interval: roundTo(interval, decimals)
        };
      };
      const combinedDates = chartPayload.weight.metric.concat(chartPayload.height.metric);
      const globalRange = combinedDates.length ? computeRange(combinedDates) : null;
      const buildChart = (id, data, unit, rangeOverride) => {
        const container = document.getElementById('chart-' + id);
        if (!container || !data.length) return null;
        const chart = echarts.init(container);
        const range = rangeOverride || computeRange(data);
        const minX = range ? range.min : null;
        const maxX = range ? range.max : null;
        const card = container.closest('.chart-card');
        if (card && minX != null && maxX != null) {
          const startEl = card.querySelector('.x-start');
          const endEl = card.querySelector('.x-end');
          if (startEl) startEl.textContent = monthLabel(minX);
          if (endEl) endEl.textContent = monthLabel(maxX);
        }
        const scale = id === 'height'
          ? niceScale(data.map((point) => point.y), {
              minRange: unit === 'in' ? 3 : 10,
              minInterval: unit === 'in' ? 1 : 5,
              minFloor: 0
            })
          : niceScale(data.map((point) => point.y), { minFloor: 0 });
        chart.setOption({
          grid: { left: 48, right: 16, top: 16, bottom: 28 },
          xAxis: {
            type: 'time',
            min: minX,
            max: maxX,
            axisLabel: {
              fontSize: 12,
              formatter: () => ''
            }
          },
          yAxis: {
            type: 'value',
            min: scale.min,
            max: scale.max,
            interval: scale.interval,
            axisLabel: { fontSize: 12 }
          },
          tooltip: {
            trigger: 'axis',
            formatter: (params) => {
              const point = params[0];
              const value = Number(point.data[1]).toFixed(1);
              const unitText = unit ? ' ' + unit : '';
              return dateLabel(point.data[0]) + ': ' + value + unitText;
            }
          },
          series: [
            {
              type: 'line',
              data: data.map((point) => [point.x, point.y]),
              smooth: 0.2,
              showSymbol: true,
              symbolSize: 6,
              lineStyle: { color: '#d16a3a', width: 2 },
              itemStyle: { color: '#1c1b1a' }
            }
          ]
        });
        return chart;
      };
      const initToggleChart = (id) => {
        const button = document.querySelector('[data-chart-toggle=\"' + id + '\"]');
        if (!button) return;
        let mode = 'metric';
        let chart = buildChart(id, chartPayload[id][mode], unitConfig[id][mode].unit, globalRange);
        button.textContent = unitConfig[id][mode].unit;
        button.addEventListener('click', () => {
          mode = mode === 'metric' ? 'imperial' : 'metric';
          button.textContent = unitConfig[id][mode].unit;
          if (!chart) {
            chart = buildChart(id, chartPayload[id][mode], unitConfig[id][mode].unit, globalRange);
            return;
          }
          const scale = id === 'height'
            ? niceScale(chartPayload[id][mode].map((point) => point.y), {
                minRange: unitConfig[id][mode].unit === 'in' ? 3 : 10,
                minInterval: unitConfig[id][mode].unit === 'in' ? 1 : 5,
                minFloor: 0
              })
            : niceScale(chartPayload[id][mode].map((point) => point.y), { minFloor: 0 });
          chart.setOption({
            xAxis: {
              min: globalRange ? globalRange.min : undefined,
              max: globalRange ? globalRange.max : undefined
            },
            yAxis: { min: scale.min, max: scale.max, interval: scale.interval },
            series: [
              {
                data: chartPayload[id][mode].map((point) => [point.x, point.y])
              }
            ]
          });
        });
        window.addEventListener('resize', () => {
          if (chart) chart.resize();
        });
      };
      window.addEventListener('load', () => {
        if (chartPayload.weight.metric.length) initToggleChart('weight');
        if (chartPayload.height.metric.length) initToggleChart('height');
        if (chartPayload.bmi.length) buildChart('bmi', chartPayload.bmi, unitConfig.bmi.unit, globalRange);
        if (chartPayload.percentile.length) buildChart('percentile', chartPayload.percentile, unitConfig.percentile.unit, globalRange);
      });
    </script>
  `;

  return layout({ title: `${profileUser.username} · BMI`, body, user });
}

export { homeView, loginView, registerView, profileView, formatDate };
