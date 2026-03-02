# ShiftSwap

A web app for workers to swap shifts. Validates that every swap leaves at least **10 hours** between shifts for both parties.

## Features

- **Load rota**: Paste a 3-week rota as CSV (`date,start,end,worker`)
- **View schedule**: See all shifts in a clear table
- **Request swap**: Select your shift and see who can take it
- **10-hour rule**: Only workers with 10+ hours between their shifts are shown as candidates
- **Persistent**: Rota and swaps are saved in the browser

## CSV Format

Shifts are **6am–2pm** or **2pm–10pm**:

```
2025-03-03,06:00,14:00,Alice
2025-03-03,14:00,22:00,Bob
2025-03-04,06:00,14:00,Charlie
```

Columns: `date` (YYYY-MM-DD), `start` (HH:MM), `end` (HH:MM), `worker` (name)

## Run locally

```bash
npm install
npm start
```

Then open http://localhost:3000

Or open `index.html` directly in a browser (no server needed).

## Deploy to GitHub Pages

1. Create a new repo on GitHub (e.g. `shift-swap`)
2. Push this project:

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/shift-swap.git
git push -u origin main
```

3. In the repo: **Settings → Pages**
4. **Source:** Deploy from a branch
5. **Branch:** main, folder: `/` (root)
6. Save — your app will be at `https://YOUR_USERNAME.github.io/shift-swap/`
