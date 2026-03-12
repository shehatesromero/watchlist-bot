from aiogram import Router
from aiogram.filters import CommandStart
from aiogram.types import Message, InlineKeyboardMarkup, InlineKeyboardButton, WebAppInfo
from services.db import upsert_user
from config import MINIAPP_URL

router = Router()


@router.message(CommandStart())
async def cmd_start(message: Message) -> None:
    user = message.from_user
    await upsert_user(
        telegram_id=user.id,
        username=user.username,
        first_name=user.first_name,
    )

    kb = InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(
            text="🎬 Открыть список",
            web_app=WebAppInfo(url=MINIAPP_URL),
        )
    ]])

    await message.answer(
        f"Привет, <b>{user.first_name}</b>! 👋\n\n"
        "Я помогу вам вести список видео для просмотра.\n\n"
        "📺 Просто пришли ссылку на YouTube — я сразу предложу добавить её.\n"
        "👫 Чтобы создать общий список — используй /group\n\n"
        "<i>Приятного просмотра!</i>",
        reply_markup=kb,
    )
