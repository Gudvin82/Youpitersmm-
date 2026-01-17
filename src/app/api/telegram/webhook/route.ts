import { NextResponse } from "next/server";

export const runtime = "nodejs";

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

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

export async function POST(req: Request) {
  try {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET;

    if (!token) return json({ ok: false, error: "Missing TELEGRAM_BOT_TOKEN" }, 500);

    const headerSecret = req.headers.get("x-telegram-bot-api-secret-token");
    if (secret && headerSecret !== secret) {
      return json({ ok: false, error: "Invalid secret" }, 401);
    }

    const update = await req.json();

    const msg = update?.message;
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

    return json({ ok: true });
  } catch (e: any) {
    return json({ ok: false, error: e?.message ?? "Unknown error" }, 500);
  }
}


