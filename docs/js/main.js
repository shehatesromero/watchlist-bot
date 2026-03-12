/* ============================================================
   main.js  –  Watchlist Mini App  •  Application logic
   ============================================================ */

const tg = window.Telegram?.WebApp;

// ── State ────────────────────────────────────────────────────────────────────
const state = {
  user:             null,   // { telegram_id, first_name, username, group_id }
  group:            null,   // groups row or null
  tab:              'group',    // 'group' | 'personal'
  page:             'watch',    // 'watch' | 'archive' | 'stats'
  pendingVideo:     null,   // preview data while adding
  pendingTcId:      null,   // video id awaiting timecode input
  selectedPriority: 0,
  selectedScope:    'group',
};

// ── Boot ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  if (tg) { tg.ready(); tg.expand(); }
  await initUser();
  setupListeners();
  initScopeButtons();
  checkTabVisibility();
  await loadPage();
});

async function initUser() {
  const tgUser = tg?.initDataUnsafe?.user;

  if (tgUser) {
    state.user = await apiUpsertUser({
      telegram_id: tgUser.id,
      username:    tgUser.username  || null,
      first_name:  tgUser.first_name || 'User',
    });
  } else {
    // Dev fallback: mock user for browser testing
    state.user = { telegram_id: 0, first_name: 'Dev', username: null, group_id: null };
  }

  const full = state.user?.telegram_id
    ? await apiGetUser(state.user.telegram_id)
    : null;
  state.group = full?.groups || null;
  if (state.user) state.user.group_id = full?.group_id || null;
}

// ── Navigation ────────────────────────────────────────────────────────────────
function checkTabVisibility() {
  const tabsEl = document.getElementById('tabs');
  if (!state.group) {
    // No group — force personal tab, hide switcher
    state.tab = 'personal';
    tabsEl.hidden = true;
  } else {
    tabsEl.hidden = false;
  }
}

function setPage(page) {
  state.page = page;
  const pages = document.querySelectorAll('.page');
  pages.forEach(p => p.classList.toggle('active', p.id === `page-${page}`));

  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach(n => n.classList.toggle('active', n.dataset.page === page));

  const tabsEl = document.getElementById('tabs');
  tabsEl.hidden = page !== 'watch' || !state.group;

  const titles = { watch: 'Что посмотреть', archive: 'Архив', stats: 'Статистика' };
  document.getElementById('headerTitle').textContent = titles[page];

  loadPage();
}

function setTab(tab) {
  state.tab = tab;
  document.querySelectorAll('.tab').forEach(t =>
    t.classList.toggle('active', t.dataset.tab === tab));
  loadWatchList();
}

// ── Page loaders ─────────────────────────────────────────────────────────────
async function loadPage() {
  if (state.page === 'watch')   loadWatchList();
  if (state.page === 'archive') loadArchive();
  if (state.page === 'stats')   loadStats();
}

async function loadWatchList() {
  const el = document.getElementById('videoList');
  el.innerHTML = '<div class="loader"><div class="spinner"></div></div>';
  try {
    const videos = await apiFetchVideos({
      userId:   state.user.telegram_id,
      groupId:  state.group?.id,
      scope:    state.tab,
      archived: false,
    });
    renderVideoList(el, videos, false);
  } catch (e) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><div class="empty-title">Ошибка загрузки</div><div class="empty-desc">${e.message}</div></div>`;
  }
}

async function loadArchive() {
  const el = document.getElementById('archiveList');
  el.innerHTML = '<div class="loader"><div class="spinner"></div></div>';
  try {
    const [groupVids, personalVids] = await Promise.all([
      state.group
        ? apiFetchVideos({ userId: state.user.telegram_id, groupId: state.group.id, scope: 'group',    archived: true })
        : Promise.resolve([]),
      apiFetchVideos({ userId: state.user.telegram_id, groupId: state.group?.id,  scope: 'personal', archived: true }),
    ]);
    const all = [...groupVids, ...personalVids].sort((a, b) =>
      new Date(b.watched_at) - new Date(a.watched_at));
    renderVideoList(el, all, true);
  } catch (e) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><div class="empty-title">Ошибка</div><div class="empty-desc">${e.message}</div></div>`;
  }
}

async function loadStats() {
  const el = document.getElementById('statsContent');
  el.innerHTML = '<div class="loader"><div class="spinner"></div></div>';
  try {
    const { personal, group } = await apiFetchStats({
      userId:  state.user.telegram_id,
      groupId: state.group?.id,
    });

    const allWatched = [...personal, ...group].filter(v => v.status === 'watched');
    const byPerson = {};
    group.forEach(v => {
      byPerson[v.added_by_name] = (byPerson[v.added_by_name] || 0) + (v.status === 'watched' ? 1 : 0);
    });

    el.innerHTML = `
      ${state.group ? `<div class="stats-section-title">👫 ${state.group.name}</div>
      <div class="stats-grid">
        <div class="stat-card"><div class="stat-value">${group.length}</div><div class="stat-label">Добавлено</div></div>
        <div class="stat-card"><div class="stat-value">${group.filter(v=>v.status==='watched').length}</div><div class="stat-label">Просмотрено</div></div>
        <div class="stat-card"><div class="stat-value">${group.filter(v=>v.status==='pending').length}</div><div class="stat-label">В очереди</div></div>
        <div class="stat-card"><div class="stat-value">${group.filter(v=>v.status==='in_progress').length}</div><div class="stat-label">На паузе ⏸</div></div>
      </div>` : ''}

      <div class="stats-section-title">🔒 Личная статистика</div>
      <div class="stats-grid">
        <div class="stat-card"><div class="stat-value">${personal.length}</div><div class="stat-label">Добавлено</div></div>
        <div class="stat-card"><div class="stat-value">${personal.filter(v=>v.status==='watched').length}</div><div class="stat-label">Просмотрено</div></div>
      </div>

      ${Object.keys(byPerson).length > 1 ? `
      <div class="stats-section-title">🏆 Кто больше смотрит</div>
      <div class="stats-grid">
        ${Object.entries(byPerson).sort((a,b)=>b[1]-a[1]).map(([name, count]) =>
          `<div class="stat-card"><div class="stat-value">${count}</div><div class="stat-label">${name}</div></div>`
        ).join('')}
      </div>` : ''}
    `;
  } catch (e) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><div class="empty-title">Ошибка</div></div>`;
  }
}

// ── Render helpers ────────────────────────────────────────────────────────────
function renderVideoList(container, videos, isArchive) {
  if (!videos.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">${isArchive ? '📁' : '🎬'}</div>
        <div class="empty-title">${isArchive ? 'Архив пуст' : 'Список пуст'}</div>
        <div class="empty-desc">${isArchive ? 'Просмотренные видео появятся здесь через 7 дней.' : 'Добавьте первое видео — нажмите «+» или пришлите ссылку боту.'}</div>
      </div>`;
    return;
  }
  container.innerHTML = videos.map(v => renderCard(v, isArchive)).join('');
}

function secondsToTime(s) {
  if (!s) return '0:00';
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (h > 0) return `${h}:${pad(m)}:${pad(sec)}`;
  return `${m}:${pad(sec)}`;
}
const pad = n => String(n).padStart(2, '0');

function timeToSeconds(str) {
  const parts = str.trim().split(':').map(Number);
  if (parts.length === 3) return parts[0]*3600 + parts[1]*60 + parts[2];
  if (parts.length === 2) return parts[0]*60 + parts[1];
  return parseInt(str) || 0;
}

function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('ru-RU', { day:'numeric', month:'short' });
}

function renderCard(v, isArchive) {
  const statusIcon = { pending: '📋', in_progress: '⏸', watched: '✅' }[v.status] || '📋';
  const tags = (v.tags || []).map(t => `<span class="tag">${t}</span>`).join('');
  const timecodeHtml = v.status === 'in_progress' && v.timecode
    ? `<div class="timecode-label">${secondsToTime(v.timecode)}</div>` : '';

  const continueBtn = v.status === 'in_progress' && v.timecode
    ? `<a class="btn btn-continue" href="https://youtu.be/${v.video_id}?t=${v.timecode}" target="_blank">▶ Продолжить с ${secondsToTime(v.timecode)}</a>`
    : (v.status !== 'watched' ? `<a class="btn btn-ghost" href="${v.url}" target="_blank">▶ Смотреть</a>` : '');

  let actionButtons = '';
  if (!isArchive) {
    if (v.status === 'pending') {
      actionButtons = `
        <button class="btn btn-outline" data-action="timecode" data-id="${v.id}">⏸ Остановились</button>
        <button class="btn btn-watched" data-action="watched" data-id="${v.id}">✅ Просмотрено</button>`;
    } else if (v.status === 'in_progress') {
      actionButtons = `
        <button class="btn btn-outline" data-action="timecode" data-id="${v.id}">✏️ Изменить время</button>
        <button class="btn btn-watched" data-action="watched" data-id="${v.id}">✅ Просмотрено</button>`;
    }
    actionButtons += `<button class="btn btn-danger" data-action="delete" data-id="${v.id}">🗑</button>`;
  }

  const watchedLabel = isArchive && v.watched_at
    ? `<div class="watched-date">Просмотрено ${formatDate(v.watched_at)}</div>` : '';

  return `
    <div class="video-card priority-${v.priority}" data-id="${v.id}">
      <div class="card-top">
        <div class="card-thumb">
          <img src="${v.thumbnail || ''}" alt="" loading="lazy" onerror="this.style.display='none'">
          <span class="status-badge">${statusIcon}</span>
        </div>
        <div class="card-info">
          <div class="card-title">${escHtml(v.title)}</div>
          <div class="card-meta"><span class="added-by">${escHtml(v.added_by_name)}</span></div>
          ${tags ? `<div class="tags">${tags}</div>` : ''}
          ${timecodeHtml}
        </div>
      </div>
      ${watchedLabel}
      <div class="card-actions">
        ${continueBtn}
        ${actionButtons}
      </div>
    </div>`;
}

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Event listeners ───────────────────────────────────────────────────────────
function setupListeners() {
  // Bottom nav
  document.querySelectorAll('.nav-item').forEach(btn =>
    btn.addEventListener('click', () => setPage(btn.dataset.page)));

  // Tabs
  document.querySelectorAll('.tab').forEach(t =>
    t.addEventListener('click', () => setTab(t.dataset.tab)));

  // Open add modal
  document.getElementById('btnAdd').addEventListener('click', openAddModal);
  document.getElementById('closeAdd').addEventListener('click', closeAddModal);

  // Fetch video info
  document.getElementById('btnFetch').addEventListener('click', onFetchVideo);
  document.getElementById('videoUrl').addEventListener('keydown', e => {
    if (e.key === 'Enter') onFetchVideo();
  });

  // Priority selector
  document.querySelectorAll('.priority-btn').forEach(btn =>
    btn.addEventListener('click', () => {
      document.querySelectorAll('.priority-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.selectedPriority = parseInt(btn.dataset.priority);
    }));

  // Save video
  document.getElementById('btnSaveVideo').addEventListener('click', onSaveVideo);

  // Timecode modal
  document.getElementById('closeTimecode').addEventListener('click', closeTimecodeModal);
  document.getElementById('btnSaveTimecode').addEventListener('click', onSaveTimecode);
  document.getElementById('timecodeInput').addEventListener('input', formatTimecodeInput);

  // Card actions (delegated)
  document.getElementById('videoList').addEventListener('click', onCardAction);
}

function initScopeButtons() {
  const container = document.getElementById('scopeGroup');
  const hasGroup = !!state.group;

  if (hasGroup) {
    container.innerHTML = `
      <button class="scope-btn active" data-scope="group">👫 ${escHtml(state.group.name)}</button>
      <button class="scope-btn" data-scope="personal">🔒 Моё</button>`;
    state.selectedScope = 'group';
  } else {
    container.innerHTML = `<button class="scope-btn active" data-scope="personal">🔒 Моё</button>`;
    state.selectedScope = 'personal';
  }

  container.querySelectorAll('.scope-btn').forEach(btn =>
    btn.addEventListener('click', () => {
      container.querySelectorAll('.scope-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.selectedScope = btn.dataset.scope;
    }));
}

// ── Add video flow ────────────────────────────────────────────────────────────
function openAddModal() {
  state.pendingVideo = null;
  document.getElementById('videoUrl').value = '';
  document.getElementById('videoTags').value = '';
  document.getElementById('videoPreview').hidden = true;
  document.getElementById('addFormExtra').hidden = true;
  document.getElementById('btnSaveVideo').disabled = true;
  document.querySelectorAll('.priority-btn').forEach((b,i) => b.classList.toggle('active', i===0));
  state.selectedPriority = 0;
  document.getElementById('modalAdd').classList.add('open');
  setTimeout(() => document.getElementById('videoUrl').focus(), 350);
}

function closeAddModal() {
  document.getElementById('modalAdd').classList.remove('open');
}

async function onFetchVideo() {
  const url = document.getElementById('videoUrl').value.trim();
  if (!url) return;
  const btn = document.getElementById('btnFetch');
  btn.textContent = '…';
  btn.disabled = true;

  const info = await fetchVideoPreview(url);
  btn.textContent = 'Найти';
  btn.disabled = false;

  if (!info) {
    showToast('❌ Не удалось загрузить видео. Проверь ссылку.');
    return;
  }

  state.pendingVideo = info;
  document.getElementById('previewThumb').src = info.thumbnail;
  document.getElementById('previewTitle').textContent = info.title;
  document.getElementById('previewAuthor').textContent = info.author;
  document.getElementById('videoPreview').hidden = false;
  document.getElementById('addFormExtra').hidden = false;
  document.getElementById('btnSaveVideo').disabled = false;
}

async function onSaveVideo() {
  if (!state.pendingVideo) return;
  const btn = document.getElementById('btnSaveVideo');
  btn.disabled = true;
  btn.textContent = 'Сохраняем…';

  const rawTags = document.getElementById('videoTags').value;
  const tags = rawTags.split(',').map(t=>t.trim()).filter(Boolean);

  try {
    await apiAddVideo({
      userId:      state.user.telegram_id,
      groupId:     state.group?.id,
      addedByName: state.user.username || state.user.first_name,
      videoData:   state.pendingVideo,
      scope:       state.selectedScope,
      tags,
      priority:    state.selectedPriority,
    });
    closeAddModal();
    showToast('✅ Видео добавлено!');

    // Reload if we're on matching tab
    if (state.page === 'watch' && state.tab === state.selectedScope) {
      loadWatchList();
    } else {
      setPage('watch');
      setTab(state.selectedScope);
    }
  } catch (e) {
    showToast('❌ Ошибка: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Добавить';
  }
}

// ── Timecode flow ─────────────────────────────────────────────────────────────
function openTimecodeModal(videoId) {
  state.pendingTcId = videoId;
  document.getElementById('timecodeInput').value = '';
  document.getElementById('modalTimecode').classList.add('open');
  setTimeout(() => document.getElementById('timecodeInput').focus(), 350);
}

function closeTimecodeModal() {
  document.getElementById('modalTimecode').classList.remove('open');
  state.pendingTcId = null;
}

function formatTimecodeInput(e) {
  let v = e.target.value.replace(/[^0-9]/g, '');
  if (v.length > 4) v = v.slice(0,2)+':'+v.slice(2,4)+':'+v.slice(4,6);
  else if (v.length > 2) v = v.slice(0,2)+':'+v.slice(2);
  e.target.value = v;
}

async function onSaveTimecode() {
  const raw = document.getElementById('timecodeInput').value;
  const seconds = timeToSeconds(raw);
  if (!seconds && raw !== '0:00' && raw !== '00:00') {
    showToast('Введи время в формате 13:45');
    return;
  }
  try {
    await apiUpdateTimecode(state.pendingTcId, seconds);
    closeTimecodeModal();
    showToast('⏸ Таймкод сохранён');
    loadWatchList();
  } catch (e) {
    showToast('❌ Ошибка: ' + e.message);
  }
}

// ── Card actions ──────────────────────────────────────────────────────────────
async function onCardAction(e) {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const { action, id } = btn.dataset;

  if (action === 'timecode') {
    openTimecodeModal(id);
  } else if (action === 'watched') {
    btn.disabled = true;
    try {
      await apiUpdateStatus(id, 'watched');
      showToast('✅ Отмечено как просмотренное');
      loadWatchList();
    } catch (e) {
      showToast('❌ Ошибка: ' + e.message);
      btn.disabled = false;
    }
  } else if (action === 'delete') {
    if (!confirm('Удалить видео из списка?')) return;
    try {
      await apiDeleteVideo(id);
      loadWatchList();
    } catch (e) {
      showToast('❌ Ошибка удаления');
    }
  }
}

// ── Toast ─────────────────────────────────────────────────────────────────────
let toastTimer;
function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2500);
}
