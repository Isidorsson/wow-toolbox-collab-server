import { Server } from "@hocuspocus/server";
import { Database } from "@hocuspocus/extension-database";
import { Logger } from "@hocuspocus/extension-logger";
import { env } from "./env";
import { isDocNameAllowed, verifySupabaseToken, type AuthedUser } from "./auth";
import { fetchDocument, storeDocument } from "./persistence";

const server = Server.configure({
  port: env.port,
  address: "0.0.0.0",

  extensions: [
    new Logger({
      onLoadDocument: env.logLevel === "debug",
      onChange: false,
      onStoreDocument: env.logLevel === "debug",
      onConnect: true,
      onDisconnect: true,
      onUpgrade: false,
      onRequest: false,
      onDestroy: true,
      onConfigure: env.logLevel === "debug",
    }),
    new Database({
      fetch: async ({ documentName }) => {
        return await fetchDocument(documentName);
      },
      store: async ({ documentName, state }) => {
        await storeDocument(documentName, state);
      },
    }),
  ],

  /**
   * Auth gate. Runs once per WebSocket connection before any sync happens.
   * Rejecting here disconnects the client with an `unauthorized` event.
   *
   * TODO (when membership model lands): after verifying the JWT, also check
   * that this user is a member of the project encoded in `documentName`.
   * For now we accept any authenticated user — fine for first integration.
   */
  onAuthenticate: async ({ token, documentName }): Promise<{ user: AuthedUser }> => {
    if (!token) {
      throw new Error("Missing access token");
    }
    if (!isDocNameAllowed(documentName)) {
      throw new Error(`Doc name not allowed: ${documentName}`);
    }
    const user = await verifySupabaseToken(token);
    return { user };
  },
});

server.listen().then(() => {
  console.log(`[collab] listening on :${env.port}`);
});

// Graceful shutdown — flush pending doc writes before Railway kills the process.
const shutdown = async (signal: string) => {
  console.log(`[collab] ${signal} received, draining…`);
  try {
    await server.destroy();
    process.exit(0);
  } catch (err) {
    console.error("[collab] shutdown failed:", err);
    process.exit(1);
  }
};

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
