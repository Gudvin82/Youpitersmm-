function sendJson(res, status, obj) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(obj));
}

async function tgApi(token, method, payload) {
  const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const text = await r.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { ok: false, raw: text };
  }
  if (!r.ok || data?.ok === false) {
    throw new Error(`TG ${method} failed: ${r.status} ${text}`);
  }
  return data;
}

async function tgSendMessage(token, chatId, text, extra) {
  const payload = Object.assign({ chat_id: chatId, text }, extra || {});
  await tgApi(token, "sendMessage", payload);
}

async function openrouterChat({ apiKey, model, prompt }) {
  const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
      "http-referer": "https://youpitersmm.vercel.app",
      "x-title": "YoupiterSMM Bot",
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.8,
    }),
  });

  const text = await r.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }

  if (!r.ok) throw new Error(`OpenRouter error ${r.status}: ${text}`);

  const out = data?.choices?.[0]?.message?.content;
  return typeof out === "string" && out.trim() ? out : "⚠️ Пустой ответ от модели.";
}

/**
 * MVP state (serverless memory; может сбрасываться)
 * sessions[chatId] = { mode: "await_post_topic" }
 * channels[channelChatId] = { title, boundBy, postsPublished, lastPostAt }
 * selectedChannelByUser[userChatId] = channelChatId
 */
let sessions = {};
let channels = {};
let selectedChannelByUser = {};

function mkKeyboard(buttonRows) {
  return { reply_markup: { inline_keyboard: buttonRows } };
}

function nowIso() {
  return new Date().toISOString();
}

module.exports = async (req, res) => {
  try {
    if (req.method !== "POST") return sendJson(res, 405, { ok: false, error: "Method Not Allowed" });

    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) return sendJson(res, 500, { ok: false, error: "Missing TELEGRAM_BOT_TOKEN" });

    const update = req.body || {};
    const msg = update.message;
    const cbq = update.callback_query;

    // 1) Обработка нажатий на кнопки (callback_query)
    if (cbq) {
      const data = cbq.data;
      const fromChatId = cbq.message?.chat?.id; // где нажали кнопку (обычно личка)
      const userId = cbq.from?.id;

      if (typeof data === "string" && fromChatId) {
        // Выбор канала
        if (data.startsWith("CH_SELECT:")) {
          const chId = data.split(":")[1];
          selectedChannelByUser[fromChatId] = chId;
          await tgApi(token, "answerCallbackQuery", { callback_query_id: cbq.id, text: "✅ Канал выбран" });
          await tgSendMessage(token, fromChatId, `✅ Выбран канал: ${channels[chId]?.title || chId}`);
          return sendJson(res, 200, { ok: true });
        }
      }

      // Всегда отвечаем callback, чтобы кнопка не “висела”
      try {
        await tgApi(token, "answerCallbackQuery", { callback_query_id: cbq.id });
      } catch {}
      return sendJson(res, 200, { ok: true });
    }

    // 2) Обычные сообщения
    const text = msg?.text;
    const chatId = msg?.chat?.id;
    const chatType = msg?.chat?.type; // "private" | "channel" | "supergroup" | "group"
    const chatTitle = msg?.chat?.title;
    const fromId = msg?.from?.id;

    if (!chatId || typeof text !== "string") return sendJson(res, 200, { ok: true, note: "no message" });

    const trimmed = text.trim();

    // /start
    if (trimmed === "/start") {
      await tgSendMessage(
        token,
        chatId,
        "✅ YoupiterSMM бот на связи.\n\nКоманды:\n/post — сгенерировать пост (диалог)\n/post <тема> — сразу\n/channels — выбор канала\n/bind — привязать канал (запусти в канале)\n/stats — статус\n/help — подсказка"
      );
      return sendJson(res, 200, { ok: true });
    }

    // /help
    if (trimmed === "/help") {
      await tgSendMessage(
        token,
        chatId,
        "🧩 Быстрый старт:\n\n1) В личке: /post\n2) Бот спросит тему → ты пишешь тему → бот генерит пост\n\nКаналы:\n— добавь бота админом в канал\n— в самом канале напиши /bind\n— в личке: /channels → выбери канал\n\nКоманды:\n/post, /channels, /bind, /stats"
      );
      return sendJson(res, 200, { ok: true });
    }

    // /stats (понятный)
    if (trimmed === "/stats") {
      const model = process.env.OPENROUTER_MODEL || "(not set)";
      const hasKey = !!process.env.OPENROUTER_API_KEY;
      const userSelected = selectedChannelByUser[chatId];
      const channelInfo = userSelected ? channels[userSelected] : null;

      const lines = [
        "📊 YoupiterSMM — статус (MVP)",
        "",
        `Время: ${nowIso()}`,
        `OPENROUTER_MODEL: ${model}`,
        `OPENROUTER_API_KEY: ${hasKey ? "✅ set" : "❌ missing"}`,
        "",
        "📣 Каналы",
        `Привязано каналов: ${Object.keys(channels).length}`,
        `Выбранный канал: ${channelInfo ? channelInfo.title : "(не выбран)"}`
      ];

      await tgSendMessage(token, chatId, lines.join("\n"));
      return sendJson(res, 200, { ok: true });
    }

    // /bind (в канале или группе) — запоминаем канал
    if (trimmed === "/bind") {
      if (chatType === "private") {
        await tgSendMessage(token, chatId, "⚠️ Команду /bind нужно писать в самом канале (где бот админ).");
        return sendJson(res, 200, { ok: true });
      }

      // сохраняем канал
      const key = String(chatId);
      channels[key] = channels[key] || {
        title: chatTitle || `chat ${key}`,
        boundBy: fromId || null,
        postsPublished: 0,
        lastPostAt: null,
      };

      await tgSendMessage(token, chatId, "✅ Канал привязан. Теперь в личке открой /channels и выбери этот канал.");
      return sendJson(res, 200, { ok: true });
    }

    // /channels — показать кнопки выбора
    if (trimmed === "/channels") {
      const ids = Object.keys(channels);
      if (ids.length === 0) {
        await tgSendMessage(
          token,
          chatId,
          "Пока нет привязанных каналов.\n\nДобавь бота админом в канал и в канале напиши /bind."
        );
        return sendJson(res, 200, { ok: true });
      }

      const rows = ids.map((id) => [{ text: channels[id].title, callback_data: `CH_SELECT:${id}` }]);
      await tgSendMessage(token, chatId, "Выбери канал:", mkKeyboard(rows));
      return sendJson(res, 200, { ok: true });
    }

    // /post без темы — включаем режим ожидания темы
    if (trimmed === "/post") {
      sessions[chatId] = { mode: "await_post_topic" };
      await tgSendMessage(token, chatId, "Напиши тему для поста одним сообщением.\nПример: Нужен пост для водителей такси");
      return sendJson(res, 200, { ok: true });
    }

    // /post <тема> — сразу генерация
    if (trimmed.startsWith("/post ")) {
      const topic = trimmed.slice("/post ".length).trim();
      if (!topic) {
        await tgSendMessage(token, chatId, "Напиши тему после /post.\nПример: /post Нужен пост для водителей такси");
        return sendJson(res, 200, { ok: true });
      }

      // Генерация
      const apiKey = process.env.OPENROUTER_API_KEY;
      const model = process.env.OPENROUTER_MODEL || "moonshotai/kimi-k2:free";
      if (!apiKey) {
        await tgSendMessage(token, chatId, "❌ Не настроен OPENROUTER_API_KEY (проверь env в Vercel).");
        return sendJson(res, 200, { ok: true });
      }

      await tgSendMessage(token, chatId, "⏳ Генерирую пост...");

      const prompt =
        `Ты опытный SMM-специалист.\n` +
        `Сгенерируй пост на тему: "${topic}".\n\n` +
        `Формат ответа строго:\n` +
        `1) Заголовок\n` +
        `2) Основной текст (до 1200 знаков)\n` +
        `3) CTA (1 строка)\n` +
        `4) 10 хештегов (в конце)\n\n` +
        `Язык: русский\n` +
        `Тон: практично, экспертно, без воды\n`;

      const out = await openrouterChat({ apiKey, model, prompt });
      await tgSendMessage(token, chatId, out.slice(0, 3800));

      return sendJson(res, 200, { ok: true });
    }

    // если бот ждёт тему после /post — любой текст становится темой
    if (sessions[chatId]?.mode === "await_post_topic") {
      delete sessions[chatId];

      const topic = trimmed;

      const apiKey = process.env.OPENROUTER_API_KEY;
      const model = process.env.OPENROUTER_MODEL || "moonshotai/kimi-k2:free";
      if (!apiKey) {
        await tgSendMessage(token, chatId, "❌ Не настроен OPENROUTER_API_KEY (проверь env в Vercel).");
        return sendJson(res, 200, { ok: true });
      }

      await tgSendMessage(token, chatId, "⏳ Генерирую пост...");

      const prompt =
        `Ты опытный SMM-специалист.\n` +
        `Сгенерируй пост на тему: "${topic}".\n\n` +
        `Формат ответа строго:\n` +
        `1) Заголовок\n` +
        `2) Основной текст (до 1200 знаков)\n` +
        `3) CTA (1 строка)\n` +
        `4) 10 хештегов (в конце)\n\n` +
        `Язык: русский\n` +
        `Тон: практично, экспертно, без воды\n`;

      const out = await openrouterChat({ apiKey, model, prompt });
      await tgSendMessage(token, chatId, out.slice(0, 3800));

      return sendJson(res, 200, { ok: true });
    }

    // fallback
    await tgSendMessage(token, chatId, "Понял 🙂 Напиши /help");
    return sendJson(res, 200, { ok: true });
  } catch (e) {
    return sendJson(res, 500, { ok: false, error: e && e.message ? e.message : "Unknown error" });
  }
};

