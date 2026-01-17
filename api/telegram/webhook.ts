export const config = {
  runtime: "nodejs",
  api: {
    bodyParser: true,
  },
};

function send(res: any, status: number, obj: any) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(obj));
}

export default async function handler(req: any, res: any) {
  try {
    if (req.method !== "POST") return send(res, 405, { ok: false, error: "Method Not Allowed" });

    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) return send(res, 500, { ok: false, error: "Missing TELEGRAM_BOT_TOKEN" });

    const update = req.body || {};
    const msg = update.message;
    const text = msg?.text;
    const chatId = msg?.chat?.id;

    // На тестовом "{}" просто отвечаем ok
    if (!chatId || typeof text !== "string") {
      return send(res, 200, { ok: true, note: "no message" });
    }

    // Если пришёл /start — отвечаем
    if (text === "/start") {
      const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text: "✅ YoupiterSMM бот на связи. Напиши /help" }),
      });
      const body = await r.text();
      if (!r.ok) return send(res, 500, { ok: false, error: "sendMessage failed", status: r.status, body });
      return send(res, 200, { ok: true });
    }

    return send(res, 200, { ok: true });
  } catch (e: any) {
    return send(res, 500, { ok: false, error: e?.message ?? "Unknown error", stack: e?.stack ?? null });
  }
}

