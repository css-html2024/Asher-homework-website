/* =========================================================
   Homework Hub — all data lives in localStorage
   ========================================================= */
const STORAGE_KEY = 'homeworkHub.v1';
const POINTS_PER_ITEM = 20;

const pad = n => String(n).padStart(2, '0');
const esc = s => String(s ?? '').replace(/[&<>"']/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const monthKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;

/* ---------------- State ---------------- */
let state = loadState();

function loadState() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch (e) { s = null; }
  if (!s || typeof s !== 'object') s = {};

  s.users      = (s.users && typeof s.users === 'object') ? s.users : {};
  s.homework   = Array.isArray(s.homework) ? s.homework : [];
  s.currentUser = typeof s.currentUser === 'string' ? s.currentUser : '';

  Object.keys(s.users).forEach(name => {
    if (typeof s.users[name]?.points !== 'number') s.users[name] = { points: 0 };
  });

  // Monthly reset on load (e.g. page opened in a new month)
  if (s.monthKey !== monthKey()) {
    s.monthKey = monthKey();
    Object.keys(s.users).forEach(n => { s.users[n].points = 0; });
  }
  return s;
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

/* ---------------- User ---------------- */
function commitUser() {
  const name = userInput.value.trim();
  if (!name) return false;
  if (!state.users[name]) state.users[name] = { points: 0 };
  state.currentUser = name;
  save();
  render();
  return true;
}

function addPoints(name, amount) {
  if (!state.users[name]) state.users[name] = { points: 0 };
  state.users[name].points = Math.max(0, state.users[name].points + amount);
}

/* ---------------- Homework actions ---------------- */
function addHomework(subject, title, due) {
  state.homework.push({
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    user: state.currentUser,
    subject: subject.trim(),
    title: title.trim(),
    due,
    createdAt: Date.now(),
    done: false
  });
  addPoints(state.currentUser, POINTS_PER_ITEM);
  save();
  render();
}

function toggleDone(id) {
  const item = state.homework.find(h => h.id === id);
  if (!item) return;
  item.done = !item.done;
  save();
  render();
}

function deleteHomework(id) {
  const idx = state.homework.findIndex(h => h.id === id);
  if (idx === -1) return;
  const item = state.homework[idx];
  if (item.user !== state.currentUser) return; // only your own
  state.homework.splice(idx, 1);
  addPoints(item.user, -POINTS_PER_ITEM); // remove the reward to prevent farming
  save();
  render();
  toast('Homework removed');
}

/* ---------------- Sorting ---------------- */
function compareHomework(a, b) {
  // 1) subject (alphabetical)
  const s = a.subject.localeCompare(b.subject, undefined, { sensitivity: 'base' });
  if (s !== 0) return s;
  // 2) unfinished before finished
  if (a.done !== b.done) return a.done ? 1 : -1;
  // 3) due date (earliest first, no date last)
  const ad = a.due || '9999-12-31';
  const bd = b.due || '9999-12-31';
  if (ad !== bd) return ad < bd ? -1 : 1;
  // 4) creation time
  return a.createdAt - b.createdAt;
}

function formatDue(date) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((date - today) / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays === -1) return 'Yesterday';
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

/* ---------------- Rendering ---------------- */
function render() {
  renderPointsPill();
  renderHomework();
  renderLeaderboard();
}

function renderPointsPill() {
  const pts = state.users[state.currentUser]?.points ?? 0;
  myPoints.textContent = pts;
}

function renderHomework() {
  const container = document.getElementById('homeworkList');

  if (!state.homework.length) {
    container.innerHTML = `<div class="empty">No homework yet.<br>Tap the <b>+</b> button to add your first assignment 🎉</div>`;
    return;
  }

  const sorted = [...state.homework].sort(compareHomework);

  // group by subject (already sorted)
  const groups = new Map();
  sorted.forEach(item => {
    const key = item.subject || 'Other';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  });

  const today = new Date(); today.setHours(0, 0, 0, 0);
  let html = '';

  for (const [subject, list] of groups) {
    html += `<div class="subject-group">
      <h3 class="subject-head">${esc(subject)} <span class="count">${list.length}</span></h3>`;

    for (const item of list) {
      const dueDate = item.due ? new Date(item.due + 'T00:00:00') : null;
      const overdue = !!dueDate && dueDate < today && !item.done;
      const mine = item.user === state.currentUser;

      html += `<div class="hw-item ${item.done ? 'done' : ''} ${overdue ? 'overdue' : ''}">
        <button class="check" data-action="toggle" data-id="${item.id}" aria-label="Mark done">${item.done ? '✓' : ''}</button>
        <div class="hw-body">
          <div class="hw-title">${esc(item.title)}</div>
          <div class="hw-meta">
            <span class="chip due">📅 ${dueDate ? formatDue(dueDate) : 'No due date'}</span>
            <span class="chip user">👤 ${esc(item.user)}</span>
          </div>
        </div>
        ${mine ? `<button class="del" data-action="delete" data-id="${item.id}" title="Delete">✕</button>` : ''}
      </div>`;
    }
    html += `</div>`;
  }

  container.innerHTML = html;
}

function renderLeaderboard() {
  const list = document.getElementById('leaderboard');
  const rows = Object.entries(state.users)
    .map(([name, data]) => ({ name, points: data.points || 0 }))
    .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));

  if (!rows.length) {
    list.innerHTML = `<li class="empty-lb">No players yet — be the first! 🚀</li>`;
    return;
  }

  const medals = ['🥇', '🥈', '🥉'];
  list.innerHTML = rows.map((u, i) => `
    <li class="lb-row ${u.name === state.currentUser ? 'me' : ''}">
      <span class="rank">${medals[i] || (i + 1)}</span>
      <span class="lb-name">${esc(u.name)}</span>
      <span class="lb-points">${u.points}</span>
    </li>`).join('');
}

/* ---------------- Monthly countdown ---------------- */
function nextResetDate() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0);
}

function tickCountdown() {
  const now = new Date();

  // If the month rolled over while the page is open → reset everyone
  if (monthKey(now) !== state.monthKey) {
    state.monthKey = monthKey();
    Object.keys(state.users).forEach(n => { state.users[n].points = 0; });
    save();
    render();
    toast('🔁 New month — leaderboard reset!');
  }

  const next = nextResetDate();
  const diff = Math.max(0, next - now);

  const d = Math.floor(diff / 86400000);
  const h = Math.floor(diff / 3600000) % 24;
  const m = Math.floor(diff / 60000) % 60;
  const s = Math.floor(diff / 1000) % 60;

  document.getElementById('countdown').textContent = `${d}d ${pad(h)}h ${pad(m)}m ${pad(s)}s`;
  document.getElementById('resetDate').textContent =
    'Resets on ' + next.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' }) + ' · 12:00 AM';
  document.getElementById('monthLabel').textContent =
    now.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

/* ---------------- Toast ---------------- */
let toastTimer;
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

/* ---------------- DOM wiring ---------------- */
const userInput = document.getElementById('userInput');
const overlay   = document.getElementById('overlay');
const addForm   = document.getElementById('addForm');
const subjectInput = document.getElementById('subjectInput');
const titleInput   = document.getElementById('titleInput');
const dueInput     = document.getElementById('dueInput');

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function openModal() {
  subjectInput.value = '';
  titleInput.value = '';
  dueInput.value = todayISO();
  overlay.classList.add('open');
  setTimeout(() => subjectInput.focus(), 60);
}

function closeModal() { overlay.classList.remove('open'); }

/* Name input */
userInput.value = state.currentUser;
userInput.addEventListener('change', () => {
  if (!commitUser()) toast('Enter a name to start earning points ✍️');
});
userInput.addEventListener('keydown', e => { if (e.key === 'Enter') userInput.blur(); });

/* + button */
document.getElementById('fab').addEventListener('click', () => {
  if (!commitUser()) { userInput.focus(); toast('Enter your name first ✍️'); return; }
  openModal();
});

/* Modal buttons */
document.getElementById('cancelBtn').addEventListener('click', closeModal);
overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

/* Submit new homework */
addForm.addEventListener('submit', e => {
  e.preventDefault();
  const subject = subjectInput.value.trim();
  const title   = titleInput.value.trim();
  const due     = dueInput.value;

  if (!subject || !title || !due) return;
  if (!commitUser()) { closeModal(); userInput.focus(); return; }

  addHomework(subject, title, due);
  closeModal();
  toast(`+${POINTS_PER_ITEM} points! 🎉`);
});

/* Homework list actions (event delegation) */
document.getElementById('homeworkList').addEventListener('click', e => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const { action, id } = btn.dataset;
  if (action === 'toggle') toggleDone(id);
  if (action === 'delete') deleteHomework(id);
});

/* ---------------- Start ---------------- */
render();
tickCountdown();
setInterval(tickCountdown, 1000);
