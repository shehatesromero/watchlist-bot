import aiohttp
import re

YOUTUBE_REGEX = re.compile(
    r'(https?://(?:www\.)?(?:youtube\.com/watch\?[^\s]*v=|youtu\.be/|youtube\.com/shorts/)[^\s]+)'
)


def extract_video_id(url: str) -> str | None:
    patterns = [
        r'(?:v=)([a-zA-Z0-9_-]{11})',
        r'youtu\.be/([a-zA-Z0-9_-]{11})',
        r'shorts/([a-zA-Z0-9_-]{11})',
    ]
    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            return match.group(1)
    return None


def extract_youtube_url(text: str) -> str | None:
    match = YOUTUBE_REGEX.search(text)
    return match.group(1) if match else None


async def get_video_info(url: str) -> dict | None:
    video_id = extract_video_id(url)
    if not video_id:
        return None

    oembed_url = f"https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v={video_id}&format=json"

    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(oembed_url, timeout=aiohttp.ClientTimeout(total=10)) as resp:
                if resp.status != 200:
                    return None
                data = await resp.json()
                return {
                    "video_id": video_id,
                    "title": data.get("title", "Без названия"),
                    "thumbnail": f"https://img.youtube.com/vi/{video_id}/mqdefault.jpg",
                    "author": data.get("author_name", ""),
                    "url": f"https://www.youtube.com/watch?v={video_id}",
                }
    except Exception:
        return None
