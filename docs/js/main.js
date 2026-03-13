/* ============================================================
   main.js  –  Watchlist Mini App  •  Application logic
   ============================================================ */

const tg = window.Telegram?.WebApp;

// ── State ────────────────────────────────────────────────────────────────────
const state = {
  user:             null,
  group:            null,   // active group
  groups:           [],     // all groups user belongs to
  tab:              'group',
  page:             'watch',
  pendingVideo:     null,
  pendingTcId:      null,
  selectedPriority: 0,
  selectedScope:    'group',
  activeTag:        null,
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
    try {
      state.user = await apiUpsertUser({
        telegram_id: tgUser.id,
        username:    tgUser.username   || null,
        first_name:  tgUser.first_name || 'User',
      });
    } catch (e) {
      console.error('apiUpsertUser failed:', e);
    }
    // Fallback: use Telegram data directly if DB call failed
    if (!state.user) {
      state.user = {
        telegram_id: tgUser.id,
        first_name:  tgUser.first_name || 'User',
        username:    tgUser.username   || null,
        group_id:    null,
      };
    }
  } else {
    // Dev fallback for browser testing
    state.user = { telegram_id: 0, first_name: 'Dev', username: null, group_id: null };
  }

  try {
    const full = state.user.telegram_id
      ? await apiGetUser(state.user.telegram_id)
      : null;

    // Build list of all groups (multi-group support via user_groups junction table)
    const allGroups = (full?.user_groups || []).map(ug => ug.groups).filter(Boolean);
    // Fallback for pre-migration state: use direct FK join
    if (!allGroups.length && full?.groups) allGroups.push(full.groups);

    state.groups = allGroups;
    state.user.group_id = full?.group_id || null;
    // Active group = one pointed to by users.group_id (or first available)
    state.group = allGroups.find(g => g.id === full?.group_id) || allGroups[0] || null;
  } catch (e) {
    console.error('apiGetUser failed:', e);
  }
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
    // Show active group name in the group tab
    const groupTab = document.querySelector('.tab[data-tab="group"]');
    if (groupTab) groupTab.textContent = state.group.name;
  }
  renderGroupSwitcher();
}

function setPage(page) {
  state.page = page;
  const pages = document.querySelectorAll('.page');
  pages.forEach(p => p.classList.toggle('active', p.id === `page-${page}`));

  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach(n => n.classList.toggle('active', n.dataset.page === page));

  const tabsEl = document.getElementById('tabs');
  tabsEl.hidden = page !== 'watch' || !state.group;

  if (page === 'watch') renderGroupSwitcher();
  else document.getElementById('groupSwitcher').style.display = 'none';

  const titles = { watch: 'Че Посмотрим', archive: 'Архив', stats: 'Статистика' };
  document.getElementById('headerTitle').textContent = titles[page];

  loadPage();
}

function setTab(tab) {
  state.tab = tab;
  document.querySelectorAll('.tab').forEach(t =>
    t.classList.toggle('active', t.dataset.tab === tab));
  renderGroupSwitcher();
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
    el.innerHTML = `<div class="empty-state"><div class="empty-title">Ошибка загрузки</div><div class="empty-desc">${e.message}</div></div>`;
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
    el.innerHTML = `<div class="empty-state"><div class="empty-title">Ошибка</div><div class="empty-desc">${e.message}</div></div>`;
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
      ${state.group ? `<div class="stats-section-title">${state.group.name}</div>
      <div class="stats-grid">
        <div class="stat-card"><div class="stat-value">${group.length}</div><div class="stat-label">Добавлено</div></div>
        <div class="stat-card"><div class="stat-value">${group.filter(v=>v.status==='watched').length}</div><div class="stat-label">Просмотрено</div></div>
        <div class="stat-card"><div class="stat-value">${group.filter(v=>v.status==='pending').length}</div><div class="stat-label">В очереди</div></div>
        <div class="stat-card"><div class="stat-value">${group.filter(v=>v.status==='in_progress').length}</div><div class="stat-label">На паузе</div></div>
      </div>` : ''}

      <div class="stats-section-title">Личная статистика</div>
      <div class="stats-grid">
        <div class="stat-card"><div class="stat-value">${personal.length}</div><div class="stat-label">Добавлено</div></div>
        <div class="stat-card"><div class="stat-value">${personal.filter(v=>v.status==='watched').length}</div><div class="stat-label">Просмотрено</div></div>
      </div>

      ${Object.keys(byPerson).length > 1 ? `
      <div class="stats-section-title">По участникам</div>
      <div class="stats-grid">
        ${Object.entries(byPerson).sort((a,b)=>b[1]-a[1]).map(([name, count]) =>
          `<div class="stat-card"><div class="stat-value">${count}</div><div class="stat-label">${name}</div></div>`
        ).join('')}
      </div>` : ''}
    `;
  } catch (e) {
    el.innerHTML = `<div class="empty-state"><div class="empty-title">Ошибка</div></div>`;
  }
}

// ── Render helpers ────────────────────────────────────────────────────────────
function renderVideoList(container, videos, isArchive) {
  if (!videos.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-title">${isArchive ? 'Архив пуст' : 'Список пуст'}</div>
        <div class="empty-desc">${isArchive ? 'Просмотренные видео будут здесь.' : 'Добавьте первое видео — нажмите «+» или пришлите ссылку боту.'}</div>
      </div>`;
    return;
  }

  const tagFilterHtml = !isArchive ? renderTagFilter(videos) : '';

  const filtered = state.activeTag
    ? videos.filter(v => (v.tags || []).includes(state.activeTag))
    : videos;

  container.innerHTML = tagFilterHtml + filtered.map(v => renderCard(v, isArchive)).join('');

  container.querySelectorAll('.tag-pill').forEach(pill =>
    pill.addEventListener('click', () => {
      state.activeTag = state.activeTag === pill.dataset.tag ? null : pill.dataset.tag;
      renderVideoList(container, videos, isArchive);
    }));
}

function renderTagFilter(videos) {
  const allTags = [...new Set(videos.flatMap(v => v.tags || []))];
  if (!allTags.length) return '';
  const pills = allTags.map(t =>
    `<button class="tag-pill${state.activeTag === t ? ' active' : ''}" data-tag="${escHtml(t)}">${escHtml(t)}</button>`
  ).join('');
  return `<div class="tag-filter">${pills}</div>`;
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
  const statusClass = { pending: 'status-pending', in_progress: 'status-progress', watched: 'status-watched' }[v.status] || 'status-pending';
  const statusLabel = { pending: 'Не смотрели', in_progress: 'На паузе', watched: 'Просмотрено' }[v.status] || '';
  const tags = (v.tags || []).map(t => `<span class="tag">${escHtml(t)}</span>`).join('');
  const timecodeHtml = v.status === 'in_progress' && v.timecode
    ? `<div class="timecode-label">${secondsToTime(v.timecode)}</div>` : '';

  const priorityLabels = ['', 'Среднее', 'Важно'];
  const priorityBadge = v.priority > 0
    ? `<span class="priority-badge priority-${v.priority}">${priorityLabels[v.priority]}</span>` : '';

  const continueBtn = v.status === 'in_progress' && v.timecode
    ? `<a class="btn btn-continue" href="https://youtu.be/${v.video_id}?t=${v.timecode}" target="_blank">Продолжить с ${secondsToTime(v.timecode)}</a>`
    : (v.status !== 'watched' ? `<a class="btn btn-ghost" href="${v.url}" target="_blank">Смотреть</a>` : '');

  let actionButtons = '';
  if (!isArchive) {
    if (v.status === 'pending') {
      actionButtons = `
        <button class="btn btn-outline" data-action="timecode" data-id="${v.id}">Остановились</button>
        <button class="btn btn-watched" data-action="watched" data-id="${v.id}">Просмотрено</button>`;
    } else if (v.status === 'in_progress') {
      actionButtons = `
        <button class="btn btn-outline" data-action="timecode" data-id="${v.id}">Изменить время</button>
        <button class="btn btn-watched" data-action="watched" data-id="${v.id}">Просмотрено</button>`;
    }
    actionButtons += `<button class="btn btn-danger" data-action="delete" data-id="${v.id}">Удалить</button>`;
  } else {
    actionButtons = `<button class="btn btn-outline" data-action="restore" data-id="${v.id}">Вернуть в список</button>`;
  }

  const watchedLabel = isArchive && v.watched_at
    ? `<div class="watched-date">Просмотрено ${formatDate(v.watched_at)}</div>` : '';

  return `
    <div class="video-card priority-${v.priority}" data-id="${v.id}">
      <div class="card-top">
        <div class="card-thumb">
          <img src="${v.thumbnail || ''}" alt="" loading="lazy" onerror="this.style.display='none'">
          <span class="status-dot ${statusClass}" title="${statusLabel}"></span>
        </div>
        <div class="card-info">
          <div class="card-title-row">
            <div class="card-title">${escHtml(v.title)}</div>
            ${priorityBadge}
          </div>
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

  // Groups modal
  document.getElementById('btnGroups').addEventListener('click', openGroupsModal);
  document.getElementById('closeGroups').addEventListener('click', closeGroupsModal);

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

  // Card actions (delegated — watch list and archive)
  document.getElementById('videoList').addEventListener('click', onCardAction);
  document.getElementById('archiveList').addEventListener('click', onCardAction);
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
  initScopeButtons(); // refresh with current active group
  state.pendingVideo = null;
  document.getElementById('videoUrl').value = '';
  document.getElementById('videoTags').value = '';
  document.getElementById('videoPreview').style.display = 'none';
  document.getElementById('addFormExtra').style.display = 'none';
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
    showToast('Не удалось загрузить видео. Проверь ссылку.');
    return;
  }

  state.pendingVideo = info;
  document.getElementById('previewThumb').src = info.thumbnail;
  document.getElementById('previewTitle').textContent = info.title;
  document.getElementById('previewAuthor').textContent = info.author;
  document.getElementById('videoPreview').style.display = 'flex';
  document.getElementById('addFormExtra').style.display = 'block';
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
    showToast('Видео добавлено');

    // Reload if we're on matching tab
    if (state.page === 'watch' && state.tab === state.selectedScope) {
      loadWatchList();
    } else {
      setPage('watch');
      setTab(state.selectedScope);
    }
  } catch (e) {
    showToast('Ошибка: ' + e.message);
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
    showToast('Таймкод сохранён');
    loadWatchList();
  } catch (e) {
    showToast('Ошибка: ' + e.message);
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
      showToast('Отмечено как просмотренное');
      loadWatchList();
    } catch (e) {
      showToast('Ошибка: ' + e.message);
      btn.disabled = false;
    }
  } else if (action === 'restore') {
    btn.disabled = true;
    try {
      await apiRestoreVideo(id);
      showToast('Видео возвращено в список');
      loadArchive();
    } catch (e) {
      showToast('Ошибка: ' + e.message);
      btn.disabled = false;
    }
  } else if (action === 'delete') {
    if (!confirm('Удалить видео из списка?')) return;
    try {
      await apiDeleteVideo(id);
      state.page === 'archive' ? loadArchive() : loadWatchList();
    } catch (e) {
      showToast('Ошибка удаления');
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

// ── Group switcher (multi-group pill row below tabs) ──────────────────────────
function renderGroupSwitcher() {
  const el = document.getElementById('groupSwitcher');
  const show = state.tab === 'group' && state.page === 'watch' && state.groups.length > 1;
  el.style.display = show ? 'flex' : 'none';
  if (!show) return;

  el.innerHTML = state.groups.map(g =>
    `<button class="group-chip${g.id === state.group?.id ? ' active' : ''}" data-gid="${escHtml(g.id)}">${escHtml(g.name)}</button>`
  ).join('');

  el.querySelectorAll('.group-chip').forEach(btn =>
    btn.addEventListener('click', async () => {
      if (btn.dataset.gid === state.group?.id) return;
      try {
        await apiSwitchGroup(state.user.telegram_id, btn.dataset.gid);
        state.group = state.groups.find(g => g.id === btn.dataset.gid);
        state.user.group_id = state.group.id;
        renderGroupSwitcher();
        loadWatchList();
      } catch (e) { showToast('Ошибка: ' + e.message); }
    }));
}

// ── Groups modal ──────────────────────────────────────────────────────────────
function tgConfirm(message) {
  return new Promise(resolve => {
    if (tg?.showConfirm) tg.showConfirm(message, resolve);
    else resolve(confirm(message));
  });
}

async function openGroupsModal() {
  document.getElementById('modalGroups').classList.add('open');
  await renderGroupsModal();
}

function closeGroupsModal() {
  document.getElementById('modalGroups').classList.remove('open');
}

async function renderGroupsModal() {
  const body = document.getElementById('groupsModalBody');
  body.innerHTML = '<div class="loader"><div class="spinner"></div></div>';

  // Load members for groups where current user is the creator
  const memberMap = {};
  for (const g of state.groups) {
    if (String(g.created_by) === String(state.user.telegram_id)) {
      try { memberMap[g.id] = await apiGetGroupMembers(g.id); }
      catch { memberMap[g.id] = []; }
    }
  }

  const groupsHtml = state.groups.length
    ? '<div class="modal-section-title">Мои группы</div>' +
      state.groups.map(g => {
        const isActive    = g.id === state.group?.id;
        const isCreator   = String(g.created_by) === String(state.user.telegram_id);
        const members     = memberMap[g.id] || [];

        const membersHtml = isCreator ? `
          <div class="members-list">
            <div class="members-title">Участники (${members.length})</div>
            ${members.map(m => {
              const isSelf = String(m.telegram_id) === String(state.user.telegram_id);
              const name   = m.username ? `@${m.username}` : escHtml(m.first_name);
              return `<div class="member-row">
                <span class="member-name">${name}</span>
                ${isSelf
                  ? '<span class="badge-self">Вы</span>'
                  : `<button class="btn btn-danger btn-kick"
                       data-gid="${escHtml(g.id)}" data-uid="${m.telegram_id}"
                       data-name="${name}">Кик</button>`}
              </div>`;
            }).join('')}
          </div>
          <button class="btn-delete-group" data-gid="${escHtml(g.id)}" data-name="${escHtml(g.name)}">
            Удалить группу
          </button>` : '';

        return `
          <div class="group-row">
            <div class="group-row-info">
              <div class="group-row-name">
                ${escHtml(g.name)}
                ${isCreator ? '<span class="badge-creator">Создатель</span>' : ''}
              </div>
              <div class="group-row-code">
                Код: <span class="code-chip">${escHtml(g.invite_code)}</span>
                <button class="btn-copy-code" data-code="${escHtml(g.invite_code)}">Скопировать</button>
              </div>
              ${membersHtml}
            </div>
            <div class="group-row-aside">
              ${isActive
                ? '<span class="badge-active">Активна</span>'
                : `<button class="btn btn-outline btn-switch-group" data-gid="${escHtml(g.id)}">Выбрать</button>`}
            </div>
          </div>`;
      }).join('')
    : '';

  body.innerHTML = `
    ${groupsHtml}
    <div class="modal-section-title">Создать группу</div>
    <div class="input-group">
      <input type="text" id="newGroupName" placeholder="Название группы…" />
      <button id="btnCreateGroup">Создать</button>
    </div>
    <div class="modal-section-title">Вступить по коду</div>
    <div class="input-group">
      <input type="text" id="joinGroupCode" placeholder="Код приглашения…" autocapitalize="characters" />
      <button id="btnJoinGroup">Вступить</button>
    </div>
  `;

  body.querySelectorAll('.btn-copy-code').forEach(btn =>
    btn.addEventListener('click', () =>
      navigator.clipboard?.writeText(btn.dataset.code)
        .then(() => showToast('Код скопирован'))
        .catch(() => showToast('Код: ' + btn.dataset.code))));

  body.querySelectorAll('.btn-switch-group').forEach(btn =>
    btn.addEventListener('click', () => switchToGroup(btn.dataset.gid)));

  body.querySelectorAll('.btn-kick').forEach(btn =>
    btn.addEventListener('click', () =>
      onKickMember(btn.dataset.gid, btn.dataset.uid, btn.dataset.name)));

  body.querySelectorAll('.btn-delete-group').forEach(btn =>
    btn.addEventListener('click', () =>
      onDeleteGroup(btn.dataset.gid, btn.dataset.name)));

  document.getElementById('btnCreateGroup').addEventListener('click', onCreateGroup);
  document.getElementById('btnJoinGroup').addEventListener('click', onJoinGroup);
}

async function switchToGroup(groupId) {
  try {
    await apiSwitchGroup(state.user.telegram_id, groupId);
    state.group = state.groups.find(g => g.id === groupId);
    state.user.group_id = groupId;
    await renderGroupsModal();
    checkTabVisibility();
    initScopeButtons();
    if (state.page === 'watch' && state.tab === 'group') loadWatchList();
  } catch (e) { showToast('Ошибка: ' + e.message); }
}

async function onKickMember(groupId, memberTelegramId, memberName) {
  if (!await tgConfirm(`Исключить ${memberName} из группы?`)) return;
  try {
    await apiKickMember(groupId, memberTelegramId);
    showToast(`${memberName} исключён`);
    await renderGroupsModal();
  } catch (e) { showToast('Ошибка: ' + e.message); }
}

async function onDeleteGroup(groupId, groupName) {
  if (!await tgConfirm(`Удалить группу «${groupName}»?\nВсе участники будут исключены.`)) return;
  try {
    await apiDeleteGroup(groupId);
    state.groups = state.groups.filter(g => g.id !== groupId);
    if (state.group?.id === groupId) {
      state.group = state.groups[0] || null;
      state.user.group_id = state.group?.id || null;
    }
    showToast(`Группа «${groupName}» удалена`);
    closeGroupsModal();
    checkTabVisibility();
    initScopeButtons();
    if (state.group) loadWatchList(); else loadPage();
  } catch (e) { showToast('Ошибка: ' + e.message); }
}

async function onCreateGroup() {
  const input = document.getElementById('newGroupName');
  const name = input.value.trim();
  if (!name) { showToast('Введи название группы'); return; }

  const btn = document.getElementById('btnCreateGroup');
  btn.disabled = true; btn.textContent = '…';
  try {
    const group = await apiCreateGroup(name, state.user.telegram_id);
    if (!state.groups.find(g => g.id === group.id)) state.groups.push(group);
    state.group = group;
    state.user.group_id = group.id;
    showToast(`Группа создана! Код: ${group.invite_code}`);
    closeGroupsModal();
    checkTabVisibility();
    initScopeButtons();
    if (state.tab !== 'group') setTab('group'); else loadWatchList();
  } catch (e) { showToast('Ошибка: ' + e.message); }
  finally { btn.disabled = false; btn.textContent = 'Создать'; }
}

async function onJoinGroup() {
  const input = document.getElementById('joinGroupCode');
  const code = input.value.trim();
  if (!code) { showToast('Введи код приглашения'); return; }

  const btn = document.getElementById('btnJoinGroup');
  btn.disabled = true; btn.textContent = '…';
  try {
    const group = await apiJoinGroup(code, state.user.telegram_id);
    if (!state.groups.find(g => g.id === group.id)) state.groups.push(group);
    state.group = group;
    state.user.group_id = group.id;
    showToast(`Вступил в группу "${group.name}"!`);
    closeGroupsModal();
    checkTabVisibility();
    initScopeButtons();
    if (state.tab !== 'group') setTab('group'); else loadWatchList();
  } catch (e) { showToast('Ошибка: ' + e.message); }
  finally { btn.disabled = false; btn.textContent = 'Вступить'; }
}
