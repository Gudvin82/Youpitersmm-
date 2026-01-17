import type { VercelRequest, VercelResponse } from "@vercel/node";

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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== "POST") {
      res.status(405).json({ ok: false, error: "Method Not Allowed" });
      return;
    }

    const token = process.env.TELEGRAM_BOT_TOKEN;
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET;

    if (!token) {
      res.status(500).json({ ok: false, error: "Missing TELEGRAM_BOT_TOKEN" });
      return;
    }

    const headerSecret = req.headers["x-telegram-bot-api-secret-token"];
    if (secret && headerSecret !== secret) {
      res.status(401).json({ ok: false, error: "Invalid secret" });
      return;
    }

    const update = req.body ?? {};
    const msg: any = (update as any)?.message;
    const text: string | undefined = msg?.text;
    const chatId: number | undefined = msg?.chat?.id;

    if (chatId && typeof text === "string") {
      if (text === "/start") {
        await tgSendMessage(token, chatId, "✅ YoupiterSMM бот на связи. Команда /help скоро будет.");
      } else if (text === "/help") {
        await tgSendMessage(token, chatId, "Доступно: /start, /help");
      } else {
        await tgSendMessage(token, chatId, "Понял. Пока я MVP 🙂 Напиши /help");
      }
    }

    res.status(200).json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message ?? "Unknown error" });
  }
}

