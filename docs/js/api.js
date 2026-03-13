// ── Supabase client ──────────────────────────────────────────────────────────
const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── Helpers ──────────────────────────────────────────────────────────────────
function extractVideoId(url) {
  const patterns = [
    /[?&]v=([a-zA-Z0-9_-]{11})/,
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /shorts\/([a-zA-Z0-9_-]{11})/,
  ];
  for (const re of patterns) {
    const m = url.match(re);
    if (m) return m[1];
  }
  return null;
}

async function fetchVideoPreview(url) {
  const videoId = extractVideoId(url);
  if (!videoId) return null;
  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
    const res = await fetch(oembedUrl);
    if (!res.ok) return null;
    const data = await res.json();
    return {
      videoId,
      title:     data.title,
      thumbnail: `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
      author:    data.author_name,
      url:       `https://www.youtube.com/watch?v=${videoId}`,
    };
  } catch { return null; }
}

// ── Users ────────────────────────────────────────────────────────────────────
async function apiUpsertUser({ telegram_id, username, first_name }) {
  // Update profile fields only — never touches group_id
  const { data: updated } = await db.from('users')
    .update({ username, first_name })
    .eq('telegram_id', telegram_id)
    .select().maybeSingle();
  if (updated) return updated;
  // New user — insert fresh row
  const { data } = await db.from('users')
    .insert({ telegram_id, username, first_name })
    .select().single();
  return data;
}

async function apiGetUser(telegram_id) {
  // Try PostgREST join (works after FK migration 002 is applied)
  const { data, error } = await db.from('users')
    .select('*, groups(*), user_groups(group_id, groups(*))')
    .eq('telegram_id', telegram_id)
    .maybeSingle();
  if (!error) return data;

  // Fallback: fetch user + memberships separately (no FK needed)
  const { data: user } = await db.from('users')
    .select('*')
    .eq('telegram_id', telegram_id)
    .maybeSingle();
  if (!user) return null;

  const { data: memberships } = await db.from('user_groups')
    .select('group_id, groups(*)')
    .eq('user_telegram_id', telegram_id);
  user.user_groups = memberships || [];
  return user;
}

// ── Group management (MiniApp-native, no bot required) ────────────────────────
async function apiCreateGroup(name, userId) {
  const part = () => Math.random().toString(36).slice(2, 6).toUpperCase();
  const invite_code = part() + part();

  const { data: group, error } = await db.from('groups')
    .insert({ name, invite_code, created_by: userId })
    .select().single();
  if (error) throw error;

  await db.from('user_groups').upsert({ user_telegram_id: userId, group_id: group.id });
  await db.from('users').update({ group_id: group.id }).eq('telegram_id', userId);
  return group;
}

async function apiJoinGroup(code, userId) {
  const { data: group, error } = await db.from('groups')
    .select('*').eq('invite_code', code.toUpperCase().trim()).maybeSingle();
  if (error) throw error;
  if (!group) throw new Error('Группа не найдена');

  await db.from('user_groups').upsert({ user_telegram_id: userId, group_id: group.id });
  await db.from('users').update({ group_id: group.id }).eq('telegram_id', userId);
  return group;
}

async function apiSwitchGroup(userId, groupId) {
  const { error } = await db.from('users').update({ group_id: groupId }).eq('telegram_id', userId);
  if (error) throw error;
}

async function apiGetGroupMembers(groupId) {
  const { data: memberships, error } = await db.from('user_groups')
    .select('user_telegram_id').eq('group_id', groupId);
  if (error) throw error;
  if (!memberships?.length) return [];

  const { data: users, error: e2 } = await db.from('users')
    .select('telegram_id, first_name, username')
    .in('telegram_id', memberships.map(m => m.user_telegram_id));
  if (e2) throw e2;
  return users || [];
}

async function apiKickMember(groupId, memberTelegramId) {
  const { error } = await db.from('user_groups').delete()
    .eq('group_id', groupId).eq('user_telegram_id', memberTelegramId);
  if (error) throw error;
  // Clear active group for that user if it was this group
  await db.from('users').update({ group_id: null })
    .eq('telegram_id', memberTelegramId).eq('group_id', groupId);
}

async function apiDeleteGroup(groupId) {
  // Clear group_id for all members who have this as their active group
  const { data: members } = await db.from('user_groups')
    .select('user_telegram_id').eq('group_id', groupId);
  if (members?.length) {
    await db.from('users').update({ group_id: null })
      .in('telegram_id', members.map(m => m.user_telegram_id))
      .eq('group_id', groupId);
  }
  // Delete group (CASCADE removes user_groups rows)
  const { error } = await db.from('groups').delete().eq('id', groupId);
  if (error) throw error;
}

// ── Videos ───────────────────────────────────────────────────────────────────
async function apiFetchVideos({ userId, groupId, scope, archived = false }) {
  let query = db.from('videos')
    .select('*')
    .eq('is_archived', archived)
    .order('priority', { ascending: false })
    .order('created_at', { ascending: false });

  if (scope === 'group' && groupId) {
    query = query.eq('group_id', groupId);
  } else {
    query = query.eq('user_id', userId).is('group_id', null);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

async function apiAddVideo({ userId, groupId, addedByName, videoData, scope, tags, priority }) {
  const row = {
    user_id:       scope === 'personal' ? userId : null,
    group_id:      scope === 'group'    ? groupId : null,
    added_by:      userId,
    added_by_name: addedByName,
    url:           videoData.url,
    video_id:      videoData.videoId,
    title:         videoData.title,
    thumbnail:     videoData.thumbnail,
    tags:          tags,
    priority:      priority,
    status:        'pending',
    timecode:      0,
    is_archived:   false,
  };
  const { data, error } = await db.from('videos').insert(row).select().single();
  if (error) throw error;
  return data;
}

async function apiUpdateStatus(id, status, timecode = 0) {
  const update = { status };
  if (status === 'in_progress') update.timecode = timecode;
  if (status === 'watched') {
    update.watched_at = new Date().toISOString();
    update.is_archived = true;
  }
  const { error } = await db.from('videos').update(update).eq('id', id);
  if (error) throw error;
}

async function apiRestoreVideo(id) {
  const { error } = await db.from('videos')
    .update({ is_archived: false, status: 'pending', watched_at: null })
    .eq('id', id);
  if (error) throw error;
}

async function apiUpdateTimecode(id, timecode) {
  const { error } = await db.from('videos').update({ timecode, status: 'in_progress' }).eq('id', id);
  if (error) throw error;
}

async function apiDeleteVideo(id) {
  const { error } = await db.from('videos').delete().eq('id', id);
  if (error) throw error;
}

// ── Stats ────────────────────────────────────────────────────────────────────
async function apiFetchStats({ userId, groupId }) {
  const results = {};

  // Personal stats
  const { data: personal } = await db.from('videos')
    .select('status, watched_at')
    .eq('added_by', userId);
  results.personal = personal || [];

  // Group stats
  if (groupId) {
    const { data: group } = await db.from('videos')
      .select('status, watched_at, added_by, added_by_name')
      .eq('group_id', groupId);
    results.group = group || [];
  } else {
    results.group = [];
  }

  return results;
}
