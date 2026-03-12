import uuid
from datetime import datetime, timezone, timedelta
from supabase import create_client, Client
from config import SUPABASE_URL, SUPABASE_KEY, ARCHIVE_AFTER_DAYS

_client: Client | None = None


def get_client() -> Client:
    global _client
    if _client is None:
        _client = create_client(SUPABASE_URL, SUPABASE_KEY)
    return _client


# ── Users ──────────────────────────────────────────────────────────────────────

async def upsert_user(telegram_id: int, username: str | None, first_name: str) -> dict:
    client = get_client()
    data = {
        "telegram_id": telegram_id,
        "username": username,
        "first_name": first_name,
    }
    res = client.table("users").upsert(data, on_conflict="telegram_id").execute()
    return res.data[0] if res.data else data


async def get_user(telegram_id: int) -> dict | None:
    client = get_client()
    res = client.table("users").select("*, groups(*)").eq("telegram_id", telegram_id).maybe_single().execute()
    return res.data


# ── Groups ─────────────────────────────────────────────────────────────────────

async def create_group(name: str, creator_id: int) -> dict:
    client = get_client()
    invite_code = str(uuid.uuid4())[:8].upper()
    group = client.table("groups").insert({
        "name": name,
        "invite_code": invite_code,
        "created_by": creator_id,
    }).execute().data[0]

    client.table("users").update({"group_id": group["id"]}).eq("telegram_id", creator_id).execute()
    return group


async def join_group(invite_code: str, user_id: int) -> dict | None:
    client = get_client()
    res = client.table("groups").select("*").eq("invite_code", invite_code.upper()).maybe_single().execute()
    if not res.data:
        return None
    group = res.data
    client.table("users").update({"group_id": group["id"]}).eq("telegram_id", user_id).execute()
    return group


# ── Videos ────────────────────────────────────────────────────────────────────

async def add_video(
    user_id: int,
    added_by_name: str,
    video_data: dict,
    scope: str,  # "group" | "personal"
    group_id: str | None = None,
) -> dict:
    client = get_client()
    row = {
        "user_id": user_id if scope == "personal" else None,
        "group_id": group_id if scope == "group" else None,
        "added_by": user_id,
        "added_by_name": added_by_name,
        "url": video_data["url"],
        "video_id": video_data["video_id"],
        "title": video_data["title"],
        "thumbnail": video_data["thumbnail"],
        "tags": [],
        "priority": 0,
        "status": "pending",
        "timecode": 0,
        "is_archived": False,
    }
    res = client.table("videos").insert(row).execute()
    return res.data[0]


async def archive_old_videos() -> int:
    """Mark as archived videos that were watched more than ARCHIVE_AFTER_DAYS ago."""
    client = get_client()
    res = (
        client.table("videos")
        .update({"is_archived": True})
        .eq("status", "watched")
        .eq("is_archived", False)
        .lt("watched_at", (datetime.now(timezone.utc) - timedelta(days=ARCHIVE_AFTER_DAYS)).isoformat())
        .execute()
    )
    return len(res.data) if res.data else 0
