// api/telegram/webhook.js

function sendJson(res, status, obj) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(obj));
}

async function tgSendMessage(token, chatId, text) {
  const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
  const body = await r.text();
  if (!r.ok) throw new Error(`sendMessage failed: ${r.status} ${body}`);
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

  if (!r.ok) {
    const err = typeof data === "object" ? JSON.stringify(data) : String(data);
    throw new Error(`OpenRouter error ${r.status}: ${err}`);
  }

  const out = data?.choices?.[0]?.message?.content;
  return typeof out === "string" && out.trim() ? out : "⚠️ Пустой ответ от модели.";
}

// Простейшая “статистика” (в serverless будет сбрасываться между вызовами — это нормально для MVP)
let stats = {
  startedAt: Date.now(),
  updatesTotal: 0,
  messagesTotal: 0,
  postsGenerated: 0,
  lastUpdateAt: 0,
  lastChatId: null,
};

function formatUptime(ms) {
  const sec = Math.floor(ms / 1000);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${h}h ${m}m ${s}s`;
}

module.exports = async (req, res) => {
  try {
    if (req.method !== "POST") return sendJson(res, 405, { ok: false, error: "Method Not Allowed" });

    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) return sendJson(res, 500, { ok: false, error: "Missing TELEGRAM_BOT_TOKEN" });

    // Security: secret token (если установлен в env)

    const update = req.body || {};
    stats.updatesTotal += 1;
    stats.lastUpdateAt = Date.now();

    const msg = update.message;
    const text = msg && msg.text;
    const chatId = msg && msg.chat && msg.chat.id;

    if (!chatId || typeof text !== "string") {
      return sendJson(res, 200, { ok: true, note: "no message" });
    }

    stats.messagesTotal += 1;
    stats.lastChatId = chatId;

    const trimmed = text.trim();

    // /start
    if (trimmed === "/start") {
      await tgSendMessage(
        token,
        chatId,
        "✅ YoupiterSMM бот на связи.\n\nКоманды:\n/post <тема> — сгенерировать пост\n/stats — статус и настройки\n/help — подсказка"
      );
      return sendJson(res, 200, { ok: true });
    }

    // /help
    if (trimmed === "/help") {
      await tgSendMessage(
        token,
        chatId,
        "🧩 Команды:\n\n/post <тема>\nПример: /post идеи контента для кофейни\n\n/stats — проверить настройки\n\nДальше добавим кнопки меню и контент-план."
      );
      return sendJson(res, 200, { ok: true });
    }

    // /stats (блок статистики и здоровья)
    if (trimmed === "/stats") {
      const model = process.env.OPENROUTER_MODEL || "(not set)";
      const hasKey = !!process.env.OPENROUTER_API_KEY;
      const hasSecret = !!process.env.TELEGRAM_WEBHOOK_SECRET;

      const lines = [
        "📊 YoupiterSMM — статус",
        "",
        `Uptime (best-effort): ${formatUptime(Date.now() - stats.startedAt)}`,
        `Updates: ${stats.updatesTotal}`,
        `Messages: ${stats.messagesTotal}`,
        `Posts generated: ${stats.postsGenerated}`,
        `Last update: ${stats.lastUpdateAt ? new Date(stats.lastUpdateAt).toISOString() : "-"}`,
        "",
        "⚙️ Конфигурация",
        `OPENROUTER_MODEL: ${model}`,
        `OPENROUTER_API_KEY: ${hasKey ? "✅ set" : "❌ missing"}`,
        `TELEGRAM_WEBHOOK_SECRET: ${hasSecret ? "✅ set" : "⚠️ not set"}`,
      ];

      await tgSendMessage(token, chatId, lines.join("\n"));
      return sendJson(res, 200, { ok: true });
    }

    // /post <topic>
    if (trimmed.startsWith("/post")) {
      const apiKey = process.env.OPENROUTER_API_KEY;
      const model = process.env.OPENROUTER_MODEL || "moonshotai/kimi-k2:free";

      const topic = trimmed.replace("/post", "").trim();
      if (!topic) {
        await tgSendMessage(token, chatId, "Напиши тему после команды.\nПример: /post идеи контента для салона красоты");
        return sendJson(res, 200, { ok: true });
      }

      if (!apiKey) {
        await tgSendMessage(token, chatId, "❌ Не настроен OPENROUTER_API_KEY (проверь переменные окружения на Vercel).");
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

      stats.postsGenerated += 1;

      // Телеграм ограничивает длину, оставим запас
      const safe = out.slice(0, 3800);
      await tgSendMessage(token, chatId, safe);

      return sendJson(res, 200, { ok: true });
    }

    // fallback
    await tgSendMessage(token, chatId, "Понял 🙂 Напиши /help");
    return sendJson(res, 200, { ok: true });
  } catch (e) {
    // если tgSendMessage падает — webhook всё равно должен отвечать 200/500
    return sendJson(res, 500, { ok: false, error: e && e.message ? e.message : "Unknown error" });
  }
};

