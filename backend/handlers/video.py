from aiogram import Router, F
from aiogram.types import Message, CallbackQuery, InlineKeyboardMarkup, InlineKeyboardButton
from services.youtube import extract_youtube_url, get_video_info
from services.db import get_user, add_video

router = Router()

# Temporary cache: user_id → video_data (for confirm step)
_pending: dict[int, dict] = {}


@router.message(F.text)
async def handle_message(message: Message) -> None:
    url = extract_youtube_url(message.text)
    if not url:
        return

    video = await get_video_info(url)
    if not video:
        await message.answer("❌ Не удалось получить информацию о видео. Проверь ссылку.")
        return

    user = await get_user(message.from_user.id)
    has_group = user and user.get("group_id")

    _pending[message.from_user.id] = {"video": video, "group_id": user.get("group_id") if user else None}

    buttons = []
    if has_group:
        group_name = user["groups"]["name"] if user.get("groups") else "Общий"
        buttons.append([InlineKeyboardButton(text=f"👫 В «{group_name}»", callback_data="add_group")])
    buttons.append([InlineKeyboardButton(text="🔒 В личный список", callback_data="add_personal")])
    buttons.append([InlineKeyboardButton(text="✖ Отмена", callback_data="add_cancel")])

    await message.answer(
        f"🎬 <b>{video['title']}</b>\n"
        f"👤 {video['author']}\n\n"
        "Куда добавить?",
        reply_markup=InlineKeyboardMarkup(inline_keyboard=buttons),
    )


@router.callback_query(F.data.in_({"add_group", "add_personal"}))
async def cb_add_video(callback: CallbackQuery) -> None:
    uid = callback.from_user.id
    pending = _pending.pop(uid, None)
    if not pending:
        await callback.answer("Сессия истекла, пришли ссылку снова.", show_alert=True)
        return

    scope = "group" if callback.data == "add_group" else "personal"
    user = callback.from_user
    added_by_name = user.username or user.first_name

    await add_video(
        user_id=uid,
        added_by_name=added_by_name,
        video_data=pending["video"],
        scope=scope,
        group_id=pending.get("group_id"),
    )

    scope_label = "общий список" if scope == "group" else "личный список"
    await callback.message.edit_text(
        f"✅ Добавлено в {scope_label}!\n\n"
        f"🎬 <b>{pending['video']['title']}</b>"
    )
    await callback.answer()


@router.callback_query(F.data == "add_cancel")
async def cb_add_cancel(callback: CallbackQuery) -> None:
    _pending.pop(callback.from_user.id, None)
    await callback.message.delete()
    await callback.answer()
