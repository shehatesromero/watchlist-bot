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
  const { data } = await db.from('users')
    .upsert({ telegram_id, username, first_name }, { onConflict: 'telegram_id' })
    .select()
    .single();
  return data;
}

async function apiGetUser(telegram_id) {
  const { data } = await db.from('users')
    .select('*, groups(*)')
    .eq('telegram_id', telegram_id)
    .maybeSingle();
  return data;
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
  if (status === 'watched') update.watched_at = new Date().toISOString();
  const { error } = await db.from('videos').update(update).eq('id', id);
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
