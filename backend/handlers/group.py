from aiogram import Router, F
from aiogram.filters import Command
from aiogram.types import Message, CallbackQuery, InlineKeyboardMarkup, InlineKeyboardButton
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from services.db import get_user, create_group, join_group

router = Router()


class GroupStates(StatesGroup):
    waiting_name = State()
    waiting_code = State()


@router.message(Command("group"))
async def cmd_group(message: Message) -> None:
    user = await get_user(message.from_user.id)
    group_info = ""
    if user and user.get("groups"):
        g = user["groups"]
        group_info = f"\n\nТекущая группа: <b>{g['name']}</b> (код: <code>{g['invite_code']}</code>)"

    kb = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="➕ Создать группу", callback_data="group_create")],
        [InlineKeyboardButton(text="🔗 Вступить по коду", callback_data="group_join")],
    ])
    await message.answer(
        f"👫 <b>Управление группой</b>{group_info}\n\n"
        "Создай группу и поделись кодом с партнёром — "
        "вы будете вести общий список.",
        reply_markup=kb,
    )


@router.callback_query(F.data == "group_create")
async def cb_group_create(callback: CallbackQuery, state: FSMContext) -> None:
    await callback.message.answer("Введи название для вашей группы (например, <i>Мы с Поликом</i>):")
    await state.set_state(GroupStates.waiting_name)
    await callback.answer()


@router.message(GroupStates.waiting_name)
async def process_group_name(message: Message, state: FSMContext) -> None:
    name = message.text.strip()
    if not name:
        await message.answer("Название не может быть пустым. Попробуй снова:")
        return

    group = await create_group(name=name, creator_id=message.from_user.id)
    await state.clear()
    await message.answer(
        f"✅ Группа <b>{group['name']}</b> создана!\n\n"
        f"Пригласи партнёра командой:\n"
        f"/group join <code>{group['invite_code']}</code>\n\n"
        f"Или просто отправь ему этот код: <code>{group['invite_code']}</code>"
    )


@router.callback_query(F.data == "group_join")
async def cb_group_join(callback: CallbackQuery, state: FSMContext) -> None:
    await callback.message.answer("Введи код приглашения:")
    await state.set_state(GroupStates.waiting_code)
    await callback.answer()


@router.message(Command("group"))
async def cmd_group_join_shortcut(message: Message) -> None:
    """Handle /group join CODE shortcut."""
    parts = message.text.split()
    if len(parts) == 3 and parts[1].lower() == "join":
        code = parts[2]
        group = await join_group(code, message.from_user.id)
        if group:
            await message.answer(f"✅ Ты вступил в группу <b>{group['name']}</b>!")
        else:
            await message.answer("❌ Группа с таким кодом не найдена.")


@router.message(GroupStates.waiting_code)
async def process_group_code(message: Message, state: FSMContext) -> None:
    code = message.text.strip()
    group = await join_group(code, message.from_user.id)
    await state.clear()
    if group:
        await message.answer(f"✅ Ты вступил в группу <b>{group['name']}</b>!\n\nТеперь вы ведёте общий список.")
    else:
        await message.answer("❌ Группа с таким кодом не найдена. Проверь код и попробуй снова.")
