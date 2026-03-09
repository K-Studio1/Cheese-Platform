// ============================================================
// Cheese Platform Backend v3.0
// Deno Deploy — wise-spider-27.k-studio1.deno.net
// Endpoints:
//   GET  /ping        → health check
//   POST /chat        → AI chat (Gemini primary, Groq fallback)
//   GET  /rating      → ambil rating global
//   POST /rating      → kirim rating baru
// ============================================================

const GROQ_API_KEY    = Deno.env.get("GROQ_API_KEY")    || "";
const GEMINI_API_KEY  = Deno.env.get("GEMINI_API_KEY")  || "";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// ---- In-memory rating (persistent selama server hidup) ----
const ratingData = { total: 0, count: 0 };

// ---- Helper: JSON response ----
function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

// ============================================================
// GEMINI
// ============================================================
async function callGemini(messages: {role: string; content: string}[], maxTokens: number) {
  const contents = messages
    .filter(m => m.role !== "system")
    .map(m => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents,
        generationConfig: { maxOutputTokens: maxTokens, temperature: 0.85 },
      }),
    }
  );
  if (!res.ok) throw new Error(`Gemini ${res.status}`);
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini empty response");
  return text as string;
}

// ============================================================
// GROQ
// ============================================================
async function callGroq(messages: {role: string; content: string}[], maxTokens: number) {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages,
      max_tokens: maxTokens,
      temperature: 0.85,
    }),
  });
  if (!res.ok) throw new Error(`Groq ${res.status}`);
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error("Groq empty response");
  return text as string;
}

// ============================================================
// MAIN HANDLER
// ============================================================
Deno.serve(async (req: Request) => {
  // OPTIONS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS });
  }

  const url = new URL(req.url);

  // ---- /ping ----
  if (url.pathname === "/ping") {
    return json({
      status: "ok",
      app: "Cheese Platform API",
      version: "3.0",
      engines: {
        gemini: !!GEMINI_API_KEY,
        groq: !!GROQ_API_KEY,
      },
    });
  }

  // ---- GET /rating ----
  if (url.pathname === "/rating" && req.method === "GET") {
    const avg = ratingData.count > 0
      ? Math.round((ratingData.total / ratingData.count) * 10) / 10
      : 0;
    return json({ average: avg, count: ratingData.count });
  }

  // ---- POST /rating ----
  if (url.pathname === "/rating" && req.method === "POST") {
    try {
      const body = await req.json();
      const r = Math.min(5, Math.max(1, Number(body.rating) || 5));
      ratingData.total += r;
      ratingData.count += 1;
      const avg = Math.round((ratingData.total / ratingData.count) * 10) / 10;
      return json({ success: true, average: avg, count: ratingData.count });
    } catch {
      return json({ error: "Invalid body" }, 400);
    }
  }

  // ---- POST /chat ----
  if (url.pathname === "/chat" && req.method === "POST") {
    let body: { messages?: {role: string; content: string}[]; max_tokens?: number };
    try {
      body = await req.json();
    } catch {
      return json({ error: "Invalid JSON" }, 400);
    }

    const messages = body.messages || [];
    const maxTokens = Math.min(body.max_tokens || 1024, 2048);

    if (!messages.length) {
      return json({ error: "messages kosong" }, 400);
    }

    let reply = "";
    let engine = "";

    // Coba Gemini dulu
    if (GEMINI_API_KEY) {
      try {
        reply = await callGemini(messages, maxTokens);
        engine = "gemini";
      } catch (e) {
        console.log("Gemini gagal, fallback ke Groq:", e);
      }
    }

    // Fallback ke Groq
    if (!reply && GROQ_API_KEY) {
      try {
        reply = await callGroq(messages, maxTokens);
        engine = "groq";
      } catch (e) {
        console.log("Groq juga gagal:", e);
        return json({ error: "AI lagi sibuk bos, coba lagi sebentar! 🙏" }, 503);
      }
    }

    if (!reply) {
      return json({ error: "Tidak ada API key yang aktif" }, 503);
    }

    return json({ reply, engine });
  }

  // 404
  return new Response("Not found", { status: 404, headers: CORS });
});
