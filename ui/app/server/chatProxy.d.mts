import type { IncomingMessage, ServerResponse } from "node:http";

export function handleChat(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void>;
export function getWebhookUrl(): string;
