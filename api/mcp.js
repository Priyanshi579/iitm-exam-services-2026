import { createHash } from "node:crypto";

const EMAIL = "24f3004439@ds.study.iitm.ac.in";
const TOOL = {
  name: "solve_challenge",
  description: "Return the required digest for the challenge header on this request.",
  inputSchema: {
    type: "object",
    properties: {},
  },
};

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Accept, Mcp-Protocol-Version, Mcp-Session-Id, X-Exam-Challenge, X-Exam-Timestamp, X-Exam-Signature",
  );

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    return res.end();
  }
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    return sendJson(res, 405, { error: "Method not allowed" });
  }

  let message = req.body;
  if (typeof message === "string") {
    try {
      message = JSON.parse(message);
    } catch {
      return sendJson(res, 400, {
        jsonrpc: "2.0",
        id: null,
        error: { code: -32700, message: "Parse error" },
      });
    }
  }

  if (!message || message.jsonrpc !== "2.0" || typeof message.method !== "string") {
    return sendJson(res, 400, {
      jsonrpc: "2.0",
      id: message?.id ?? null,
      error: { code: -32600, message: "Invalid Request" },
    });
  }

  if (message.method === "notifications/initialized" || message.method === "notifications/cancelled") {
    res.statusCode = 202;
    return res.end();
  }

  const id = message.id ?? null;
  switch (message.method) {
    case "initialize": {
      const requested = message.params?.protocolVersion;
      return sendJson(res, 200, {
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: typeof requested === "string" ? requested : "2025-03-26",
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: "exam-challenge-server", version: "1.0.0" },
        },
      });
    }
    case "ping":
      return sendJson(res, 200, { jsonrpc: "2.0", id, result: {} });
    case "tools/list":
      return sendJson(res, 200, { jsonrpc: "2.0", id, result: { tools: [TOOL] } });
    case "tools/call": {
      if (message.params?.name !== TOOL.name) {
        return sendJson(res, 200, {
          jsonrpc: "2.0",
          id,
          error: { code: -32602, message: "Unknown tool" },
        });
      }
      const challenge = req.headers["x-exam-challenge"];
      if (typeof challenge !== "string" || !/^[0-9a-f]{32}$/.test(challenge)) {
        return sendJson(res, 200, {
          jsonrpc: "2.0",
          id,
          result: {
            content: [{ type: "text", text: "missing or invalid X-Exam-Challenge" }],
            isError: true,
          },
        });
      }
      const text = createHash("sha256").update(`${challenge}:${EMAIL}`).digest("hex").slice(0, 16);
      return sendJson(res, 200, {
        jsonrpc: "2.0",
        id,
        result: { content: [{ type: "text", text }] },
      });
    }
    default:
      return sendJson(res, 200, {
        jsonrpc: "2.0",
        id,
        error: { code: -32601, message: "Method not found" },
      });
  }
}
