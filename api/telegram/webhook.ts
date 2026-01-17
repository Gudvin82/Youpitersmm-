export const config = {
  api: {
    bodyParser: false,
  },
};

async function readBody(req: any): Promise<string> {
  return await new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk: any) => (data += chunk));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

function getHeader(req: any, name: string): string | undefined {
  const v = req.headers?.[name.toLowerCase()];
  if (Array.isArray(v)) return v[0];
  return v;
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

export default async function handler(req: any, res: any) {
  try {
    if (req.method !== "POST") {
      res.statusCode = 405;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ ok: false, error: "Method Not Allowed" }));
      return;
    }

    const token = process.env.TELEGRAM_BOT_TOKEN;
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET;

    if (!token) {
      res.statusCode = 500;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ ok: false, error: "Missing TELEGRAM_BOT_TOKEN" }));
      return;
    }

    const headerSecret = getHeader(req, "x-telegram-bot-api-secret-token");
    if (secret && headerSecret !== secret) {
      res.statusCode = 401;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ ok: false, error: "Invalid secret" }));
      return;
    }

    const raw = await readBody(req);
    const update = raw ? JSON.parse(raw) : {};

    const msg = (update as any)?.message;
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

    res.statusCode = 200;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ ok: true }));
  } catch (e: any) {
    res.statusCode = 500;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ ok: false, error: e?.message ?? "Unknown error" }));
  }
}

