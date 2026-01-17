module.exports = async (req, res) => {
  try {
    if (req.method !== "POST") {
      res.statusCode = 405;
      res.setHeader("content-type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ ok: false, error: "Method Not Allowed" }));
      return;
    }

    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
      res.statusCode = 500;
      res.setHeader("content-type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ ok: false, error: "Missing TELEGRAM_BOT_TOKEN" }));
      return;
    }

    // На "{}" просто отвечаем ok (для проверки что функция живая)
    const update = req.body || {};
    const msg = update.message;
    const text = msg && msg.text;
    const chatId = msg && msg.chat && msg.chat.id;

    if (chatId && typeof text === "string") {
      const reply =
        text === "/start"
          ? "✅ YoupiterSMM бот на связи. Напиши /help"
          : text === "/help"
          ? "Доступно: /start, /help"
          : "Понял. Пока MVP 🙂 Напиши /help";

      const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text: reply }),
      });

      const body = await r.text();
      if (!r.ok) {
        res.statusCode = 500;
        res.setHeader("content-type", "application/json; charset=utf-8");
        res.end(JSON.stringify({ ok: false, error: "sendMessage failed", status: r.status, body }));
        return;
      }
    }

    res.statusCode = 200;
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ ok: true }));
  } catch (e) {
    res.statusCode = 500;
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ ok: false, error: e && e.message ? e.message : "Unknown error" }));
  }
};

