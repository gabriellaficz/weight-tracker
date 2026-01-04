# BMI Tracker

Tracks weight, height, BMI, and BMI percentiles (CDC 2-20 years) over time. Public profiles are readable by anyone, editing requires a password. Height is captured per entry.

Entry dates use `YYYY-MMM-DD` (example: `2025-Jan-04`).

## Stack

- Node.js 22 + Express
- SQLite (better-sqlite3)
- Server-rendered HTML

## Data location

Persistent data lives outside the repo:

```
/home/ubuntu/app_data/
  secrets.env
  app.sqlite
```

## Setup

1. Install dependencies:

```
npm install
```

2. Create secrets:

```
mkdir -p /home/ubuntu/app_data
node -e "console.log('SESSION_SECRET=' + require('crypto').randomBytes(32).toString('hex'))" > /home/ubuntu/app_data/secrets.env
```

3. Run locally:

```
npm start
```

## Tests

```
npm test
```

## Systemd + Nginx (production)

Systemd unit and Nginx site are configured on the server. The app listens on port 3000 behind Nginx.

## Backups

After each merge to main, create a backup:

```
cd /home/ubuntu
sudo tar -czf app_backup.tgz app_data
```

Restore:

```
cd /home/ubuntu
sudo tar -xzf app_backup.tgz
sudo systemctl restart weight-tracker
```

## Data source

CDC BMI-for-age LMS tables (bmiagerev.csv) from https://www.cdc.gov/growthcharts/.
