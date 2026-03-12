import asyncio
import logging
from aiogram import Bot, Dispatcher
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode
from config import BOT_TOKEN
from handlers import start, video, group
from services.db import archive_old_videos

logging.basicConfig(level=logging.INFO)


async def startup(bot: Bot) -> None:
    archived = await archive_old_videos()
    if archived:
        logging.info(f"Archived {archived} old watched videos on startup.")


async def main() -> None:
    bot = Bot(token=BOT_TOKEN, default=DefaultBotProperties(parse_mode=ParseMode.HTML))
    dp = Dispatcher()

    dp.startup.register(startup)

    # Register routers — order matters: group before video (both handle /group)
    dp.include_router(start.router)
    dp.include_router(group.router)
    dp.include_router(video.router)

    await dp.start_polling(bot)


if __name__ == "__main__":
    asyncio.run(main())
