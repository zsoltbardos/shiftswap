/**
 * ShiftSwap - Worker shift swap app with 10-hour rest validation
 */

const MIN_REST_HOURS = 10;

/** @typedef {{ id: string, date: string, start: string, end: string, worker: string, startMs: number, endMs: number }} Shift */

/** @type {Shift[]} */
let rota = [];

/** @type {string|null} */
let currentUser = null;

/** @type {string|null} */
let selectedSwapTarget = null;

/** @type {Shift|null} - For full swap: the shift from the other person we're receiving */
let selectedShiftToReceive = null;

/**
 * Parse CSV rota text into shift objects
 * Format: date,start,end,worker (e.g. 2025-03-03,09:00,17:00,Alice)
 */
function parseRota(csv) {
  const lines = csv.trim().split(/\r?\n/).filter(Boolean);
  const shifts = [];
  const seen = new Set();

  for (let i = 0; i < lines.length; i++) {
    const parts = lines[i].split(',').map((p) => p.trim());
    if (parts.length < 4) continue;

    const [date, start, end, worker] = parts;
    if (!date || !start || !end || !worker) continue;

    const startMs = parseDateTime(date, start);
    let endMs = parseDateTime(date, end);
    if (endMs <= startMs) {
      endMs = parseDateTime(addDays(date, 1), end);
    }

    if (isNaN(startMs) || isNaN(endMs)) continue;

    const id = `${date}-${start}-${worker}-${i}`;
    if (seen.has(id)) continue;
    seen.add(id);

    shifts.push({
      id,
      date,
      start,
      end,
      worker,
      startMs,
      endMs,
    });
  }

  return shifts.sort((a, b) => a.startMs - b.startMs);
}

function parseDateTime(dateStr, timeStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [h, min] = timeStr.split(':').map(Number);
  return new Date(y, m - 1, d, h || 0, min || 0).getTime();
}

function addDays(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const d2 = new Date(y, m - 1, d);
  d2.setDate(d2.getDate() + days);
  return d2.toISOString().slice(0, 10);
}

function formatTime(ms) {
  const d = new Date(ms);
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

/**
 * Check if a person has at least MIN_REST_HOURS between shifts when taking a new shift.
 * Also rejects overlapping shifts.
 */
function hasEnoughRest(shifts, newShift) {
  const personShifts = shifts.sort((a, b) => a.startMs - b.startMs);
  const newStart = newShift.startMs;
  const newEnd = newShift.endMs;

  for (const s of personShifts) {
    if (newStart < s.endMs && newEnd > s.startMs) return false;

    const gapBefore = (newStart - s.endMs) / (1000 * 60 * 60);
    const gapAfter = (s.startMs - newEnd) / (1000 * 60 * 60);

    if (gapBefore >= 0 && gapBefore < MIN_REST_HOURS) return false;
    if (gapAfter >= 0 && gapAfter < MIN_REST_HOURS) return false;
  }

  return true;
}

/**
 * Find workers who can take the given shift (give away - no reciprocation)
 */
function findGiveAwayCandidates(shiftToSwap) {
  const workers = [...new Set(rota.map((s) => s.worker))];
  const candidates = [];

  for (const worker of workers) {
    if (worker === shiftToSwap.worker) continue;

    const workerShifts = rota.filter((s) => s.worker === worker);
    const canTake = hasEnoughRest(workerShifts, shiftToSwap);

    if (canTake) {
      candidates.push(worker);
    }
  }

  return candidates;
}

/**
 * Find workers who can full-swap: they can take my shift AND have a shift I can take.
 * When they give me a shift, they must still have 10hr rest when taking mine.
 */
function findFullSwapCandidates(myShift) {
  const workers = [...new Set(rota.map((s) => s.worker))];
  const candidates = [];

  const myShifts = rota.filter((s) => s.worker === myShift.worker && s.id !== myShift.id);

  for (const worker of workers) {
    if (worker === myShift.worker) continue;

    const theirShifts = rota.filter((s) => s.worker === worker);

    const shiftsICanTake = theirShifts.filter((s) => {
      if (s.date === myShift.date && s.start === myShift.start && s.end === myShift.end) {
        return false;
      }
      if (s.date === myShift.date && s.startMs < myShift.endMs && s.endMs > myShift.startMs) {
        return false;
      }
      const theyCanTakeMine = hasEnoughRest(
        theirShifts.filter((x) => x.id !== s.id),
        myShift
      );
      const iCanTakeTheirs = hasEnoughRest(myShifts, s);
      return theyCanTakeMine && iCanTakeTheirs;
    });

    if (shiftsICanTake.length > 0) {
      candidates.push({ worker, shiftsICanTake });
    }
  }

  return candidates;
}

function loadRota() {
  const input = document.getElementById('rota-input');
  const text = input.value.trim();
  if (!text) {
    showError('Please enter rota data');
    return;
  }

  rota = parseRota(text);
  if (rota.length === 0) {
    showError('No valid shifts found. Use format: date,start,end,worker');
    return;
  }

  persistRota();
  renderRota();
  renderSwapSection();
  clearError();
}

function loadSampleRota() {
  const sample = `2025-03-03,06:00,14:00,Alice
2025-03-03,14:00,22:00,Bob
2025-03-04,06:00,14:00,Charlie
2025-03-04,14:00,22:00,Dana
2025-03-05,06:00,14:00,Eve
2025-03-05,14:00,22:00,Frank
2025-03-06,06:00,14:00,Alice
2025-03-06,14:00,22:00,Bob
2025-03-07,06:00,14:00,Charlie
2025-03-07,14:00,22:00,Dana
2025-03-08,06:00,14:00,Eve
2025-03-08,14:00,22:00,Frank
2025-03-10,06:00,14:00,Alice
2025-03-10,14:00,22:00,Bob
2025-03-11,06:00,14:00,Charlie
2025-03-11,14:00,22:00,Dana
2025-03-12,06:00,14:00,Eve
2025-03-12,14:00,22:00,Frank
2025-03-13,06:00,14:00,Alice
2025-03-13,14:00,22:00,Bob
2025-03-14,06:00,14:00,Charlie
2025-03-14,14:00,22:00,Dana
2025-03-15,06:00,14:00,Eve
2025-03-15,14:00,22:00,Frank
2025-03-17,06:00,14:00,Alice
2025-03-17,14:00,22:00,Bob
2025-03-18,06:00,14:00,Charlie
2025-03-18,14:00,22:00,Dana
2025-03-19,06:00,14:00,Eve
2025-03-19,14:00,22:00,Frank`;

  document.getElementById('rota-input').value = sample;
  loadRota();
}

function persistRota() {
  try {
    localStorage.setItem('shiftSwap_rota', JSON.stringify(rota));
  } catch (_) {}
}

function loadPersistedRota() {
  try {
    const stored = localStorage.getItem('shiftSwap_rota');
    if (stored) {
      rota = JSON.parse(stored);
      renderRota();
      renderSwapSection();
    }
  } catch (_) {}
}

function renderRota() {
  const container = document.getElementById('rota-table-container');

  if (rota.length === 0) {
    container.innerHTML = '<div class="empty-state">Load a rota to get started</div>';
    return;
  }

  const html = `
    <table>
      <thead>
        <tr>
          <th>Date</th>
          <th>Start</th>
          <th>End</th>
          <th>Worker</th>
        </tr>
      </thead>
      <tbody>
        ${rota
          .map(
            (s) => `
          <tr>
            <td>${formatDate(s.date)}</td>
            <td>${s.start}</td>
            <td>${s.end}</td>
            <td>${s.worker}</td>
          </tr>
        `
          )
          .join('')}
      </tbody>
    </table>
  `;
  container.innerHTML = html;
}

function renderSwapSection() {
  const myShiftSelect = document.getElementById('my-shift');
  const candidatesList = document.getElementById('candidates-list');
  const swapConfirm = document.getElementById('swap-confirm');

  myShiftSelect.innerHTML = '<option value="">— Choose shift —</option>';

  if (rota.length === 0) {
    candidatesList.innerHTML = '';
    swapConfirm.innerHTML = '<span class="pending">Load a rota first</span>';
    swapConfirm.className = 'swap-confirm pending';
    return;
  }

  const uniqueShifts = rota.map((s) => ({
    id: s.id,
    label: `${formatDate(s.date)} ${s.start}–${s.end} (${s.worker})`,
  }));

  uniqueShifts.forEach((s) => {
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = s.label;
    myShiftSelect.appendChild(opt);
  });

  function handleShiftChange() {
    const id = myShiftSelect.value;
    selectedSwapTarget = null;
    selectedShiftToReceive = null;
    swapConfirm.innerHTML = '<span class="pending">Select a candidate</span>';
    swapConfirm.className = 'swap-confirm pending';

    if (!id) {
      candidatesList.innerHTML = '';
      document.getElementById('candidates-hint').textContent = 'People with 10+ hours between shifts';
      return;
    }

    const shift = rota.find((s) => s.id === id);
    if (!shift) return;

    currentUser = shift.worker;
    const swapType = document.querySelector('input[name="swap-type"]:checked')?.value || 'giveaway';

    if (swapType === 'giveaway') {
      const candidates = findGiveAwayCandidates(shift);
      document.getElementById('candidates-hint').textContent = 'People who can take your shift (10+ hours rest)';

      if (candidates.length === 0) {
        candidatesList.innerHTML = '<div class="no-candidates">No one can take this shift with 10+ hours rest</div>';
        return;
      }

      candidatesList.innerHTML = candidates
        .map(
          (c) => `
          <div class="candidate-card">
            <span class="info"><strong>${c}</strong> can take your shift</span>
            <button class="swap-btn" data-candidate="${c}" data-type="giveaway">Give to ${c}</button>
          </div>
        `
        )
        .join('');

      candidatesList.querySelectorAll('.swap-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          selectedSwapTarget = btn.dataset.candidate;
          selectedShiftToReceive = null;
          renderSwapConfirm(shift, 'giveaway');
        });
      });
    } else {
      const candidates = findFullSwapCandidates(shift);
      document.getElementById('candidates-hint').textContent = 'People you can exchange shifts with (both need 10+ hours rest)';

      if (candidates.length === 0) {
        candidatesList.innerHTML = '<div class="no-candidates">No one available for full swap</div>';
        return;
      }

      candidatesList.innerHTML = candidates
        .map(
          (c) => `
          <div class="candidate-card full-swap">
            <span class="info"><strong>${c.worker}</strong> — pick a shift to receive:</span>
            <div class="shift-picks">
              ${c.shiftsICanTake
                .map(
                  (s) => `
                <button class="shift-pick-btn" data-candidate="${c.worker}" data-shift-id="${s.id}">
                  ${formatDate(s.date)} ${s.start}–${s.end}
                </button>
              `
                )
                .join('')}
            </div>
          </div>
        `
        )
        .join('');

      candidatesList.querySelectorAll('.shift-pick-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          selectedSwapTarget = btn.dataset.candidate;
          selectedShiftToReceive = rota.find((s) => s.id === btn.dataset.shiftId);
          renderSwapConfirm(shift, 'full');
        });
      });
    }
  }

  myShiftSelect.onchange = handleShiftChange;

  swapConfirm.innerHTML = '<span class="pending">Select your shift first</span>';
  swapConfirm.className = 'swap-confirm pending';
}

function renderSwapConfirm(shift, swapType) {
  const swapConfirm = document.getElementById('swap-confirm');
  if (!selectedSwapTarget) return;

  swapConfirm.className = 'swap-confirm';

  if (swapType === 'giveaway') {
    swapConfirm.innerHTML = `
      <div class="summary">
        Give your shift to <strong>${selectedSwapTarget}</strong><br>
        ${formatDate(shift.date)} ${shift.start}–${shift.end}
      </div>
      <p>${selectedSwapTarget} takes this shift. You get the time off.</p>
      <button class="btn btn-primary confirm-btn" id="confirm-swap">Confirm Give Away</button>
    `;
  } else {
    if (!selectedShiftToReceive) return;
    swapConfirm.innerHTML = `
      <div class="summary">
        <strong>${shift.worker}</strong> ↔ <strong>${selectedSwapTarget}</strong><br>
        You give: ${formatDate(shift.date)} ${shift.start}–${shift.end}<br>
        You receive: ${formatDate(selectedShiftToReceive.date)} ${selectedShiftToReceive.start}–${selectedShiftToReceive.end}
      </div>
      <p>Full swap — you exchange shifts. Both have 10+ hours rest.</p>
      <button class="btn btn-primary confirm-btn" id="confirm-swap">Confirm Full Swap</button>
    `;
  }

  document.getElementById('confirm-swap').addEventListener('click', () => {
    executeSwap(shift, swapType);
  });
}

function executeSwap(shift, swapType) {
  const idx = rota.findIndex((s) => s.id === shift.id);
  if (idx === -1) return;

  const swapConfirm = document.getElementById('swap-confirm');

  if (swapType === 'giveaway') {
    rota[idx] = { ...shift, worker: selectedSwapTarget };
    persistRota();
    renderRota();
    renderSwapSection();
    swapConfirm.innerHTML = `<div class="success-msg">Done. ${selectedSwapTarget} now has this shift. You have the time off.</div>`;
  } else {
    const receiveIdx = rota.findIndex((s) => s.id === selectedShiftToReceive.id);
    if (receiveIdx === -1) return;

    rota[idx] = { ...shift, worker: selectedSwapTarget };
    rota[receiveIdx] = { ...selectedShiftToReceive, worker: shift.worker };
    persistRota();
    renderRota();
    renderSwapSection();
    swapConfirm.innerHTML = `<div class="success-msg">Full swap complete. You now have ${formatDate(selectedShiftToReceive.date)} ${selectedShiftToReceive.start}–${selectedShiftToReceive.end}. ${selectedSwapTarget} has your former shift.</div>`;
  }

  swapConfirm.className = 'swap-confirm';
  selectedSwapTarget = null;
  selectedShiftToReceive = null;
}

function showError(msg) {
  const el = document.getElementById('error-msg');
  if (el) {
    el.textContent = msg;
    el.style.display = 'block';
  }
}

function clearError() {
  const el = document.getElementById('error-msg');
  if (el) el.style.display = 'none';
}

document.getElementById('load-rota').addEventListener('click', loadRota);
document.getElementById('sample-rota').addEventListener('click', loadSampleRota);

document.querySelector('.swap-section').addEventListener('change', (e) => {
  if (e.target.matches('input[name="swap-type"]')) {
    const myShiftSelect = document.getElementById('my-shift');
    if (myShiftSelect.value) myShiftSelect.dispatchEvent(new Event('change'));
  }
});

loadPersistedRota();
if (rota.length === 0) {
  renderRota();
  renderSwapSection();
}
