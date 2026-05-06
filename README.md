# Calodiary

A private Telegram bot for tracking nutrition and cardio. Send a food photo (or describe a meal in text) and get instant macro analysis powered by Google Gemini via OpenRouter. All data is stored locally in PocketBase.

---

## Features

- **Photo & text logging** — send a photo or a plain text description; Gemini estimates calories, protein, fat and carbs
- **Live daily budget** — every response shows remaining calories and protein against your personal targets
- **Cardio logging** — treadmill (ACSM formula) or manual calorie entry
- **Saved meal shortcuts** — bookmark any meal and re-log it instantly with one command
- **Weekly summary** — 7-day table with averages
- **Weight tracking** — log body weight with a running trend
- **Undo / redo** — remove or restore the last meal or cardio entry

---

## Stack

| Layer | Technology |
|---|---|
| Bot framework | [grammY](https://grammy.dev/) (Node.js) |
| Vision / LLM | Google Gemini Flash via [OpenRouter](https://openrouter.ai/) |
| Database | [PocketBase](https://pocketbase.io/) (self-hosted) |
| Runtime | Node.js ≥ 18 |

---

## Setup

### 1. Prerequisites

- Node.js ≥ 18
- A running PocketBase instance (`./pocketbase serve`)
- A Telegram bot token from [@BotFather](https://t.me/BotFather)
- An OpenRouter API key

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment

Create a `.env` file in the project root:

```env
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
ALLOWED_USER_ID=your_telegram_user_id

POCKETBASE_URL=http://127.0.0.1:8090
POCKETBASE_ADMIN_EMAIL=admin@example.com
POCKETBASE_ADMIN_PASSWORD=yourpassword

OPENROUTER_API_KEY=your_openrouter_key
OPENROUTER_MODEL=google/gemini-flash-1.5   # optional, this is the default

USER_WEIGHT_KG=90          # used in ACSM treadmill calorie formula and AI prompt
DAILY_CALORIE_CEILING=2000
DAILY_PROTEIN_FLOOR=160
```

> **Tip:** Your Telegram user ID can be found by messaging [@userinfobot](https://t.me/userinfobot).

### 4. Run the database migration

Creates all required PocketBase collections. Safe to re-run — skips existing collections.

```bash
npm run migrate
```

### 5. Start the bot

```bash
npm start
```

On first start the bot registers its command menu with Telegram automatically.

---

## Commands

| Command | Description |
|---|---|
| `/stats` | Today's calorie & macro summary |
| `/week` | 7-day summary with daily breakdown and averages |
| `/undo` | Remove the most recent meal logged today |
| `/undo cardio` | Remove the most recent cardio entry today |
| `/redo` | Restore the last entry removed by `/undo` |
| `/save <name>` | Bookmark the last logged meal under a shortcut name |
| `/meal <name>` | Instantly re-log a saved meal |
| `/meals` | List all saved meal shortcuts |
| `/delete <name>` | Remove a saved meal shortcut |
| `/weight <kg>` | Log today's body weight |
| `/weight` | Show current weight and recent trend |
| `/cardio treadmill <min> <km/h> <grade%>` | Log treadmill session (calories via ACSM formula) |
| `/cardio other <min> <kcal>` | Log any other activity with manual calorie entry |

---

## Project Structure

```
src/
  bot.js              # Entry point — bot setup, command registration
  config.js           # Env var validation
  openrouter.js       # Gemini API client
  pb.js               # PocketBase singleton
  handlers/
    photo.js          # Photo & text message pipeline
    cardio.js         # /cardio command
    stats.js          # /stats command + shared formatter
    undo.js           # /undo and /redo commands
    savedmeal.js      # /save, /meal, /meals, /delete commands
    week.js           # /week command
    weight.js         # /weight command
  math/
    acsm.js           # ACSM treadmill calorie formula
    daily.js          # Daily totals aggregation
  prompts/
    system.js         # Gemini system prompt builder
setup/
  migrate.js          # One-time PocketBase collection migration
```

---

## Privacy

This bot is intentionally single-user. The `ALLOWED_USER_ID` environment variable gates every handler — all messages from other users are silently ignored.
