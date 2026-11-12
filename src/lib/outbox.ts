// Changes made without a connection: kept on the device, shown in the lists right away, sent in order when back
// online. Each change carries its own id, so sending one twice (the reply was lost) can't create a duplicate.
// Not under the cache: prefix, so an expired session doesn't wipe unsynced entries; only this person's id reads it.
import type { TxInput } from './api';
import { isNetworkError } from './cache';
import type { Settlement, Tx } from './types';

export interface SettlementRow {
  id: string; household_id: string; from_user: string; to_user: string; amount_cents: number; date: string;
  created_by: string; transaction_id: string | null;
}
/** create: a new entry (sent with its id), else an edit of one already on the server. error: the server refused it. */
export type Op =
  | { kind: 'tx'; id: string; create: boolean; input: TxInput; error?: string }
  | { kind: 'settle'; id: string; row: SettlementRow; error?: string };
export type Send = (op: Op) => Promise<void>;

const defaultStorage = () => (typeof localStorage === 'undefined' ? null : localStorage);
const key = (userId: string) => `outbox:${userId}`;
const listeners = new Set<() => void>();
export const subscribeOutbox = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };

export function readOutbox(userId: string, storage: Storage | null = defaultStorage()): Op[] {
  try { return JSON.parse(storage?.getItem(key(userId)) ?? '[]') as Op[]; } catch { return []; }
}
function write(userId: string, ops: Op[], storage: Storage | null) {
  try { ops.length ? storage?.setItem(key(userId), JSON.stringify(ops)) : storage?.removeItem(key(userId)); } catch { /* quota or private mode */ }
  listeners.forEach((fn) => fn());
}

/** A change to something already waiting replaces it; a waiting new entry stays a create. */
export function enqueue(userId: string, op: Op, storage: Storage | null = defaultStorage()) {
  const ops = readOutbox(userId, storage);
  const i = ops.findIndex((o) => o.id === op.id);
  if (i < 0) ops.push(op);
  else { const old = ops[i]; ops[i] = old.kind === 'tx' && op.kind === 'tx' ? { ...op, create: old.create } : op; }
  write(userId, ops, storage);
}

/** Forget a waiting change (deleted before it synced), with any waiting settlement of that entry. */
export function dropFromOutbox(userId: string, id: string, storage: Storage | null = defaultStorage()) {
  write(userId, readOutbox(userId, storage).filter((o) => o.id !== id && !(o.kind === 'settle' && o.row.transaction_id === id)), storage);
}
export function discardFailed(userId: string, storage: Storage | null = defaultStorage()) {
  write(userId, readOutbox(userId, storage).filter((o) => !o.error), storage);
}
export function clearOutbox(userId: string, storage: Storage | null = defaultStorage()) { write(userId, [], storage); }

// Offline, supabase-js can sit for 30s+ retrying a token renewal before a request even starts, so never wait on it
// longer than this. A send that times out but did reach the server is safe to resend: the change carries its id.
export const SEND_TIMEOUT_MS = 6000;
const timed = (send: Send, op: Op) => Promise.race([send(op),
  new Promise<never>((_, reject) => setTimeout(() => reject(new TypeError('Failed to fetch: timed out')), SEND_TIMEOUT_MS))]);
const offlineNow = () => typeof navigator !== 'undefined' && navigator.onLine === false;

let running: Promise<Op[]> | null = null;
/** Sends what's waiting, oldest first. Stops at the first network error; a refused change is marked and skipped. Returns what was sent. */
export function flushOutbox(userId: string, send: Send, storage: Storage | null = defaultStorage()): Promise<Op[]> {
  running ??= (async () => {
    const sent: Op[] = [];
    for (const op of readOutbox(userId, storage).filter((o) => !o.error)) {
      try { await timed(send, op); }
      catch (e) {
        if (isNetworkError(e)) break;
        write(userId, readOutbox(userId, storage).map((o) => (o.id === op.id ? { ...o, error: (e as Error).message } : o)), storage);
        continue;
      }
      sent.push(op);
      write(userId, readOutbox(userId, storage).filter((o) => o.id !== op.id), storage);
    }
    return sent;
  })().finally(() => { running = null; });
  return running;
}

/** Sends now when nothing is waiting (a refusal is thrown, for the form to show); otherwise or offline, it waits its turn. */
export async function submit(userId: string, op: Op, send: Send, storage: Storage | null = defaultStorage()): Promise<'sent' | 'queued'> {
  if (offlineNow()) { enqueue(userId, op, storage); return 'queued'; }
  if (!readOutbox(userId, storage).some((o) => !o.error)) {
    try { await timed(send, op); return 'sent'; }
    catch (e) { if (!isNetworkError(e)) throw e; enqueue(userId, op, storage); return 'queued'; }
  }
  enqueue(userId, op, storage);
  await flushOutbox(userId, send, storage);
  return readOutbox(userId, storage).some((o) => o.id === op.id && !o.error) ? 'queued' : 'sent';
}

/** Loaded entries plus the waiting ones (from/to: months, inclusive), newest first unless asc. */
export function overlayTx(rows: Tx[], ops: Op[], me: { userId: string; householdId: string | null },
  { from, to, asc }: { from?: string; to?: string; asc?: boolean }): Tx[] {
  const waiting = new Map<string, Tx>();
  for (const o of ops) {
    if (o.kind !== 'tx' || o.error) continue;
    const old = rows.find((t) => t.id === o.id);
    const i = o.input;
    waiting.set(o.id, {
      created_by: me.userId, recurring_rule_id: null, ...old, id: o.id, type: i.type, scope: i.scope,
      household_id: i.scope === 'shared' ? me.householdId : null, paid_by: i.paid_by ?? old?.paid_by ?? me.userId,
      amount_cents: i.amount_cents, date: i.date, category_id: i.category_id, note: i.note?.trim() || null,
      splits: i.scope === 'shared' ? i.splits ?? [] : [], pending: true,
    });
  }
  if (!waiting.size) return rows;
  const inRange = (t: Tx) => (!from || t.date.slice(0, 7) >= from) && (!to || t.date.slice(0, 7) <= to);
  const merged = [...rows.filter((t) => !waiting.has(t.id)), ...[...waiting.values()].filter(inRange)];
  return merged.sort((a, b) => (asc ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date)));
}

export function overlaySettlements(rows: Settlement[], ops: Op[]): Settlement[] {
  const waiting = ops.flatMap((o) => (o.kind === 'settle' && !o.error ? [{ ...o.row, pending: true }] : []));
  if (!waiting.length) return rows;
  return [...waiting, ...rows].sort((a, b) => b.date.localeCompare(a.date));
}
