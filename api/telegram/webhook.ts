export const config = { runtime: "nodejs" };

async function tgSendMessage(token: string, chatId: number, text: string) {
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Telegram sendMessage failed: ${res.status} ${body}`);
  }
}

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

    // Временно НЕ проверяем секрет, пока не оживим /start
    const update = req.body ?? {};
    const msg = update?.message;
    const text: string | undefined = msg?.text;
    const chatId: number | undefined = msg?.chat?.id;

    if (chatId && typeof text === "string") {
      if (text === "/start") {
        await tgSendMessage(token, chatId, "✅ YoupiterSMM бот на связи. Напиши /help");
      } else if (text === "/help") {
        await tgSendMessage(token, chatId, "Доступно: /start, /help");
      } else {
        await tgSendMessage(token, chatId, "Понял. Пока MVP 🙂 Напиши /help");
      }
    }

    return send(res, 200, { ok: true });
  } catch (e: any) {
    return send(res, 500, { ok: false, error: e?.message ?? "Unknown error" });
  }
}

