import { createServer, type IncomingMessage } from "node:http";
import "./observability";
import { streamDialogue } from "./dialogue";
import { attachPartySocket } from "./partySocket";

const PORT = Number(process.env.PORT ?? 4000);

function readJson(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

const server = createServer(async (req, res) => {
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-headers", "content-type");

  if (req.method === "OPTIONS") {
    res.writeHead(204).end();
    return;
  }

  if (req.method === "POST" && req.url === "/dialogue") {
    let params;
    try {
      params = await readJson(req);
    } catch {
      res.writeHead(400).end("invalid json");
      return;
    }
    res.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    });
    for await (const event of streamDialogue(params)) {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    }
    res.end();
    return;
  }

  res.writeHead(404).end("not found");
});

attachPartySocket(server);

server.listen(PORT, () => {
  const mode = process.env.ANTHROPIC_API_KEY ? "Claude" : "mock";
  console.log(`EarthQuest server on :${PORT} (dialogue: ${mode})`);
});
