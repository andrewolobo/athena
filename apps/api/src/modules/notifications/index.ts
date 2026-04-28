/**
 * Notification hub — SSE client registry + durable notify() helper.
 *
 * SSE connections are kept in a per-org in-memory Set.  When the server
 * writes a notification row it also pushes the event to every active
 * SSE connection for that org.
 */

import { Response } from "express";
import { pool } from "../../db";
import logger from "../../logger";

// ── SSE client registry ───────────────────────────────────────
// Keyed by org_id; each value is the set of currently active SSE responses.
const sseClients = new Map<string, Set<Response>>();

export function addSseClient(orgId: string, res: Response): void {
  if (!sseClients.has(orgId)) sseClients.set(orgId, new Set());
  sseClients.get(orgId)!.add(res);
}

export function removeSseClient(orgId: string, res: Response): void {
  sseClients.get(orgId)?.delete(res);
  if (sseClients.get(orgId)?.size === 0) sseClients.delete(orgId);
}

function broadcastToOrg(orgId: string, eventName: string, data: unknown): void {
  const clients = sseClients.get(orgId);
  if (!clients?.size) return;

  const msg = `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of clients) {
    try {
      client.write(msg);
    } catch (err) {
      logger.warn(err, "SSE write failed — dropping client");
      clients.delete(client);
    }
  }
}

// ── notify() ─────────────────────────────────────────────────
export interface NotifyParams {
  org_id: string;
  user_id?: string;
  type: string;
  title: string;
  body?: string;
  reference_id?: string;
  reference_table?: string;
}

/**
 * Write a notification row and push it to all active SSE connections
 * for the organisation.  Never throws — errors are logged only.
 */
export async function notify(params: NotifyParams): Promise<void> {
  try {
    const result = await pool.query(
      `INSERT INTO public.notifications
              (org_id, user_id, type, title, body, reference_id, reference_table)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        params.org_id,
        params.user_id ?? null,
        params.type,
        params.title,
        params.body ?? null,
        params.reference_id ?? null,
        params.reference_table ?? null,
      ],
    );
    broadcastToOrg(params.org_id, params.type, result.rows[0]);
  } catch (err) {
    logger.error(err, "notify() failed to persist notification");
  }
}
