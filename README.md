# Watchlist Bot

**[English](#english)** | **[Русский](#russian)**

---

<a name="english"></a>
## English

A Telegram Mini App for managing a shared YouTube watchlist with your partner or friend.

### Features

- Add YouTube videos by link — title and thumbnail fetched automatically
- Shared list (via invite code) and personal list per user
- Track progress: mark as *stopped at timecode* or *watched*
- Continue watching from a saved timecode (opens YouTube at exact position)
- Tags and priority per video
- Archive: watched videos move there automatically after 7 days
- Quick add: send a YouTube link directly to the bot chat
- Basic stats: videos added, watched, paused — per person

### Tech Stack

| Part | Technology |
|---|---|
| Bot | Python 3.11 + aiogram 3.x |
| Database | Supabase (PostgreSQL) |
| Mini App | Vanilla HTML/CSS/JS |
| Hosting (frontend) | GitHub Pages |
| Hosting (bot) | Any Python host (e.g. bothost.ru) |

### Project Structure

```
watchlist-bot/
├── backend/          # Telegram bot (deploy to your host)
│   ├── main.py
│   ├── config.py
│   ├── handlers/     # start, video detection, group commands
│   └── services/     # YouTube oEmbed, Supabase operations
├── docs/             # Mini App static files (GitHub Pages)
│   ├── index.html
│   ├── css/style.css
│   └── js/           # config, api, app logic
└── supabase/
    └── schema.sql    # Run this in Supabase SQL Editor
```

### Setup

**1. Supabase**
1. Create a project at [supabase.com](https://supabase.com)
2. Run `supabase/schema.sql` in the SQL Editor
3. Copy **Project URL** and **anon key** from Settings → API

**2. Telegram Bot**
1. Create a bot via [@BotFather](https://t.me/BotFather) and get the token
2. Register a Mini App: `/newapp` → point to your GitHub Pages URL

**3. Mini App (GitHub Pages)**
1. Fork or clone this repo
2. Add repository secrets (*Settings → Secrets → Actions*):
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
3. Go to *Settings → Pages → Source* → select **GitHub Actions**
4. Push to your default branch — the workflow deploys automatically

**4. Bot**
1. Copy `backend/.env.example` to `backend/.env` and fill in all values
2. Install dependencies: `pip install -r backend/requirements.txt`
3. Run: `python backend/main.py`

### Bot Commands

| Command | Description |
|---|---|
| `/start` | Register and open the Mini App |
| `/group create <name>` | Create a shared list, get an invite code |
| `/group join <code>` | Join an existing shared list |
| Send a YouTube link | Bot asks which list to add it to |

---

<a name="russian"></a>
## Русский

Telegram Mini App для совместного ведения списка видео с YouTube.

### Возможности

- Добавление видео по ссылке — название и обложка подтягиваются автоматически
- Общий список (по инвайт-коду) и личный список для каждого пользователя
- Отслеживание прогресса: отметить *остановились на таймкоде* или *просмотрено*
- Продолжить просмотр с сохранённого таймкода (открывает YouTube на нужной секунде)
- Теги и приоритет для каждого видео
- Архив: просмотренные видео перемещаются туда автоматически через 7 дней
- Быстрое добавление: отправь ссылку прямо в чат бота
- Статистика: добавлено, просмотрено, на паузе — по каждому участнику

### Стек

| Часть | Технология |
|---|---|
| Бот | Python 3.11 + aiogram 3.x |
| База данных | Supabase (PostgreSQL) |
| Mini App | Vanilla HTML/CSS/JS |
| Хостинг фронтенда | GitHub Pages |
| Хостинг бота | Любой Python-хостинг (например, bothost.ru) |

### Структура проекта

```
watchlist-bot/
├── backend/          # Telegram бот (деплой на хостинг)
│   ├── main.py
│   ├── config.py
│   ├── handlers/     # /start, определение ссылок, команды группы
│   └── services/     # YouTube oEmbed, операции с Supabase
├── docs/             # Статические файлы Mini App (GitHub Pages)
│   ├── index.html
│   ├── css/style.css
│   └── js/           # конфиг, api, логика приложения
└── supabase/
    └── schema.sql    # Запустить в SQL Editor Supabase
```

### Установка

**1. Supabase**
1. Создай проект на [supabase.com](https://supabase.com)
2. Запусти `supabase/schema.sql` в SQL Editor
3. Скопируй **Project URL** и **anon key** из Settings → API

**2. Telegram Bot**
1. Создай бота через [@BotFather](https://t.me/BotFather), получи токен
2. Зарегистрируй Mini App: `/newapp` → укажи URL GitHub Pages

**3. Mini App (GitHub Pages)**
1. Сделай fork или клонируй репозиторий
2. Добавь секреты (*Settings → Secrets → Actions*):
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
3. Перейди в *Settings → Pages → Source* → выбери **GitHub Actions**
4. Запушь в основную ветку — workflow задеплоит автоматически

**4. Бот**
1. Скопируй `backend/.env.example` в `backend/.env` и заполни значения
2. Установи зависимости: `pip install -r backend/requirements.txt`
3. Запусти: `python backend/main.py`

### Команды бота

| Команда | Описание |
|---|---|
| `/start` | Регистрация и открытие Mini App |
| `/group create <название>` | Создать общий список, получить инвайт-код |
| `/group join <код>` | Вступить в существующий общий список |
| Отправить YouTube-ссылку | Бот предложит добавить в нужный список |

---

## License

MIT
