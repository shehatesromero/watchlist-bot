import os
from dotenv import load_dotenv

load_dotenv()

BOT_TOKEN: str = os.getenv("BOT_TOKEN", "")
SUPABASE_URL: str = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY: str = os.getenv("SUPABASE_KEY", "")
MINIAPP_URL: str = os.getenv("MINIAPP_URL", "")

ARCHIVE_AFTER_DAYS: int = 7
