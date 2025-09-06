// netlify/functions/letta-chat.js
export default async (req, context) => {
  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "POST only" }), {
        status: 405, headers: { "Content-Type": "application/json" }
      });
    }

    const { message, identifier } = await req.json();
    if (!message || !identifier) {
      return new Response(JSON.stringify({ error: "message and identifier required" }), {
        status: 400, headers: { "Content-Type": "application/json" }
      });
    }

    const LETTA_API_KEY = process.env.LETTA_API_KEY;
    const LETTA_AGENT_ID = process.env.LETTA_AGENT_ID;
    if (!LETTA_API_KEY || !LETTA_AGENT_ID) {
      return new Response(JSON.stringify({ error: "Server not configured" }), {
        status: 500, headers: { "Content-Type": "application/json" }
      });
    }

    const url = `https://api.letta.ai/v1/agents/${LETTA_AGENT_ID}/messages`;
    const headers = {
      Authorization: `Bearer ${LETTA_API_KEY}`,
      "Content-Type": "application/json"
    };

    // We’ll try a few common payload shapes (workspaces differ slightly).
    const payloads = [
      // A) simple "input" string
      { input: message, user: { identifier_key: identifier } },
      // B) "input" object
      { input: { text: message }, user: { identifier_key: identifier } },
      // C) single "message" object
      { message: { role: "user", content: { text: message } }, user: { identifier_key: identifier } },
      // D) "messages" array
      { messages: [{ role: "user", content: { text: message } }], user: { identifier_key: identifier } },
    ];

    let lastText = "";
    for (const body of payloads) {
      try {
        const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
        lastText = await res.text();
        if (!res.ok) continue; // try next shape
        // parse JSON only on success
        const data = JSON.parse(lastText);

        // Extract a visible reply robustly
        const reply =
          data?.message?.content?.text ??
          data?.output?.text ??
          data?.text ??
          (Array.isArray(data?.messages)
            ? data.messages.map(m => m?.content?.text).filter(Boolean).join("\n")
            : JSON.stringify(data));

        return new Response(JSON.stringify({ reply, raw: data }), {
          status: 200, headers: { "Content-Type": "application/json" }
        });
      } catch (innerErr) {
        // continue to next payload shape
        lastText = String(innerErr?.message || innerErr);
        continue;
      }
    }

    // If we got here, all attempts failed—return detailed server message
    return new Response(JSON.stringify({ error: `Letta error: ${lastText}` }), {
      status: 502, headers: { "Content-Type": "application/json" }
    });

  } catch (e) {
    return new Response(JSON.stringify({ error: e?.message || "Unknown error" }), {
      status: 500, headers: { "Content-Type": "application/json" }
    });
  }
};
