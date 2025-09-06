// netlify/functions/letta-chat.js
export default async (req, context) => {
  try {
    // 1) Method guard
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "POST only" }), {
        status: 405,
        headers: { "Content-Type": "application/json" }
      });
    }

    // 2) Parse client payload
    let bodyJson;
    try {
      bodyJson = await req.json();
    } catch (e) {
      console.error("Bad request body (not JSON):", e?.message || e);
      return new Response(JSON.stringify({ error: "Body must be JSON" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    const { message, identifier } = bodyJson || {};
    if (!message || !identifier) {
      console.error("Missing fields:", { hasMessage: !!message, hasIdentifier: !!identifier });
      return new Response(JSON.stringify({ error: "message and identifier required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    // 3) Env checks
    const LETTA_API_KEY = process.env.LETTA_API_KEY;
    const LETTA_AGENT_ID = process.env.LETTA_AGENT_ID;
    if (!LETTA_API_KEY || !LETTA_AGENT_ID) {
      console.error("Server not configured: missing LETTA_API_KEY or LETTA_AGENT_ID");
      return new Response(JSON.stringify({ error: "Server not configured" }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }

    // 4) Call Letta (try a few body shapes; log each)
    const url = `https://api.letta.ai/v1/agents/${LETTA_AGENT_ID}/messages`;
    const headers = {
      Authorization: `Bearer ${LETTA_API_KEY}`,
      "Content-Type": "application/json"
    };

    const payloads = [
      { input: message, user: { identifier_key: identifier } },                                       // A: simple input string
      { input: { text: message }, user: { identifier_key: identifier } },                             // B: input object
      { message: { role: "user", content: { text: message } }, user: { identifier_key: identifier }}, // C: single message
      { messages: [{ role: "user", content: { text: message } }], user: { identifier_key: identifier }} // D: messages array
    ];

    let lastStatus = 0;
    let lastText = "";

    for (let i = 0; i < payloads.length; i++) {
      const attemptBody = payloads[i];
      try {
        console.log(`Letta attempt ${i + 1}/${payloads.length}:`, JSON.stringify(attemptBody));
        const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(attemptBody) });
        lastStatus = res.status;
        lastText = await res.text();

        if (!res.ok) {
          console.error(`Letta API error on attempt ${i + 1}:`, res.status, lastText);
          continue; // try next shape
        }

        // Parse success JSON
        let data;
        try {
          data = JSON.parse(lastText);
        } catch (e) {
          console.error("Success but response not JSON:", e?.message || e, lastText.slice(0, 300));
          return new Response(JSON.stringify({ error: "Non-JSON success from Letta", raw: lastText }), {
            status: 502,
            headers: { "Content-Type": "application/json" }
          });
        }

        // Extract a visible reply robustly
        const reply =
          data?.message?.content?.text ??
          data?.output?.text ??
          data?.text ??
          (Array.isArray(data?.messages)
            ? data.messages.map(m => m?.content?.text).filter(Boolean).join("\n")
            : JSON.stringify(data));

        return new Response(JSON.stringify({ reply, raw: data }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      } catch (err) {
        console.error(`Attempt ${i + 1} threw:`, err?.message || err);
        // try next payload
      }
    }

    // All attempts failed — return the last server message for visibility
    return new Response(JSON.stringify({
      error: `Letta error (status ${lastStatus}): ${lastText}`
    }), {
      status: 502,
      headers: { "Content-Type": "application/json" }
    });

  } catch (e) {
    console.error("Function crash:", e);
    return new Response(JSON.stringify({ error: e?.message || "Unknown error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
};
