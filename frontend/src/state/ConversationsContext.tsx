import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { newId } from '../lib/id';
import { isAbort, toApiError } from '../services';
import type { ChatMessage, ChatTurn, Conversation } from '../types';
import { useResume } from './ResumeContext';
import { useService } from './ServiceContext';
import { useToast } from './ToastContext';

/* Conversations live in this browser tab only (sessionStorage), and live and
 * demo history are stored under separate keys so they never mix. Each
 * conversation has its own backend session id, so follow-ups share memory
 * within a conversation and never across conversations. */

const MAX_HISTORY_TURNS = 12;

interface ConversationsCtx {
  conversations: Conversation[];
  get: (id: string | undefined) => Conversation | undefined;
  isPending: (id: string) => boolean;
  /** Creates a conversation and sends its first message. Returns the new id. */
  startConversation: (question: string) => string;
  send: (conversationId: string, question: string) => void;
  retry: (conversationId: string, failedMessageId: string) => void;
  /** Removes a failed exchange and returns the question text for editing. */
  discardFailed: (conversationId: string, failedMessageId: string) => string | null;
  rename: (id: string, title: string) => void;
  remove: (id: string) => void;
  drafts: Record<string, string>;
  setDraft: (key: string, text: string) => void;
}

const Ctx = createContext<ConversationsCtx | null>(null);

function storageKey(mode: string) {
  return `resume-desk:${mode}:conversations:v1`;
}

function titleFrom(question: string): string {
  const t = question.replace(/\s+/g, ' ').trim();
  return t.length > 56 ? `${t.slice(0, 53).trimEnd()}…` : t;
}

function restore(key: string): { list: Conversation[]; failed: boolean } {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return { list: [], failed: false };
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error('bad shape');
    const list = (parsed as Conversation[]).map((c) => {
      if (typeof c.id !== 'string' || !Array.isArray(c.messages)) throw new Error('bad conversation');
      return {
        ...c,
        // A reload interrupts in-flight requests; say so instead of spinning forever.
        messages: c.messages.map((m): ChatMessage =>
          m.status === 'pending'
            ? { ...m, status: 'error', error: { kind: 'aborted', message: 'This answer was interrupted when the page reloaded.' } }
            : m,
        ),
      };
    });
    return { list, failed: false };
  } catch {
    try {
      sessionStorage.removeItem(key);
    } catch {
      /* ignore */
    }
    return { list: [], failed: true };
  }
}

export function ConversationsProvider({ children }: { children: ReactNode }) {
  const { service, reportFailure } = useService();
  const { current: resume } = useResume();
  const toast = useToast();
  const key = storageKey(service.mode);

  const initial = useRef<ReturnType<typeof restore> | null>(null);
  if (!initial.current) initial.current = restore(key);

  const [conversations, setConversations] = useState<Conversation[]>(initial.current.list);
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const convRef = useRef(conversations);
  convRef.current = conversations;
  const controllers = useRef(new Map<string, AbortController>());
  const resumeRef = useRef(resume);
  resumeRef.current = resume;

  useEffect(() => {
    if (initial.current?.failed) toast.show("Couldn't restore previous conversations from this session. Starting fresh.", 'error');
  }, [toast]);

  useEffect(() => {
    try {
      sessionStorage.setItem(key, JSON.stringify(conversations));
    } catch {
      /* storage full or unavailable: conversations still work in memory */
    }
  }, [conversations, key]);

  const update = useCallback((id: string, fn: (c: Conversation) => Conversation) => {
    setConversations((list) => list.map((c) => (c.id === id ? fn(c) : c)));
  }, []);

  const ask = useCallback(
    (conversationId: string, question: string, history: ChatTurn[], pendingId: string) => {
      const conv = convRef.current.find((c) => c.id === conversationId);
      const sessionId = conv?.sessionId ?? conversationId;
      const ac = new AbortController();
      controllers.current.set(conversationId, ac);
      setPending((p) => ({ ...p, [conversationId]: true }));

      service
        .ask({ sessionId, question, history }, ac.signal)
        .then((res) => {
          update(conversationId, (c) => ({
            ...c,
            updatedAt: new Date().toISOString(),
            messages: c.messages.map((m) =>
              m.id === pendingId ? { ...m, status: 'done', content: res.answer, sources: res.sources, createdAt: new Date().toISOString() } : m,
            ),
          }));
        })
        .catch((err) => {
          if (isAbort(err)) return;
          reportFailure(err);
          const e = toApiError(err);
          update(conversationId, (c) => ({
            ...c,
            messages: c.messages.map((m) =>
              m.id === pendingId ? { ...m, status: 'error', error: { kind: e.kind, message: e.message } } : m,
            ),
          }));
        })
        .finally(() => {
          if (controllers.current.get(conversationId) === ac) controllers.current.delete(conversationId);
          setPending((p) => {
            const { [conversationId]: _, ...rest } = p;
            return rest;
          });
        });
    },
    [service, update, reportFailure],
  );

  /** Completed turns only, oldest first — failed exchanges are not sent as context. */
  const historyOf = (c: Conversation | undefined): ChatTurn[] => {
    if (!c) return [];
    const turns: ChatTurn[] = [];
    for (let i = 0; i < c.messages.length; i++) {
      const m = c.messages[i]!;
      const next = c.messages[i + 1];
      if (m.role === 'user' && next?.role === 'assistant' && next.status === 'done') {
        turns.push({ role: 'user', content: m.content }, { role: 'assistant', content: next.content });
      }
    }
    return turns.slice(-MAX_HISTORY_TURNS * 2);
  };

  const appendExchange = useCallback(
    (conversationId: string, question: string) => {
      const now = new Date().toISOString();
      const user: ChatMessage = { id: newId('msg'), role: 'user', content: question, createdAt: now, status: 'done' };
      const pendingMsg: ChatMessage = { id: newId('msg'), role: 'assistant', content: '', createdAt: now, status: 'pending' };
      const history = historyOf(convRef.current.find((c) => c.id === conversationId));
      update(conversationId, (c) => ({ ...c, updatedAt: now, messages: [...c.messages, user, pendingMsg] }));
      ask(conversationId, question, history, pendingMsg.id);
    },
    [ask, update],
  );

  const startConversation = useCallback(
    (question: string) => {
      const now = new Date().toISOString();
      const id = newId('conv');
      const conv: Conversation = {
        id,
        sessionId: newId('sess'),
        title: titleFrom(question),
        createdAt: now,
        updatedAt: now,
        resumeId: resumeRef.current?.id ?? null,
        resumeFilename: resumeRef.current?.filename ?? null,
        messages: [],
      };
      convRef.current = [conv, ...convRef.current];
      setConversations((list) => [conv, ...list]);
      appendExchange(id, question);
      return id;
    },
    [appendExchange],
  );

  const send = useCallback(
    (conversationId: string, question: string) => {
      if (controllers.current.has(conversationId)) return;
      appendExchange(conversationId, question);
    },
    [appendExchange],
  );

  const retry = useCallback(
    (conversationId: string, failedId: string) => {
      const conv = convRef.current.find((c) => c.id === conversationId);
      if (!conv || controllers.current.has(conversationId)) return;
      const idx = conv.messages.findIndex((m) => m.id === failedId);
      const question = conv.messages[idx - 1];
      if (idx < 1 || question?.role !== 'user') return;
      const history = historyOf({ ...conv, messages: conv.messages.slice(0, idx - 1) });
      update(conversationId, (c) => ({
        ...c,
        messages: c.messages.map((m) => (m.id === failedId ? { ...m, status: 'pending', error: undefined } : m)),
      }));
      ask(conversationId, question.content, history, failedId);
    },
    [ask, update],
  );

  const discardFailed = useCallback(
    (conversationId: string, failedId: string) => {
      const conv = convRef.current.find((c) => c.id === conversationId);
      if (!conv) return null;
      const idx = conv.messages.findIndex((m) => m.id === failedId);
      const question = conv.messages[idx - 1];
      if (idx < 1 || question?.role !== 'user') return null;
      update(conversationId, (c) => ({ ...c, messages: c.messages.filter((m) => m.id !== failedId && m.id !== question.id) }));
      return question.content;
    },
    [update],
  );

  const rename = useCallback(
    (id: string, title: string) => {
      const t = title.trim();
      if (t) update(id, (c) => ({ ...c, title: t.slice(0, 80) }));
    },
    [update],
  );

  const remove = useCallback(
    (id: string) => {
      const conv = convRef.current.find((c) => c.id === id);
      controllers.current.get(id)?.abort();
      controllers.current.delete(id);
      setConversations((list) => list.filter((c) => c.id !== id));
      setDrafts(({ [id]: _, ...rest }) => rest);
      if (conv) void service.endSession(conv.sessionId);
    },
    [service],
  );

  const setDraft = useCallback((k: string, text: string) => setDrafts((d) => (d[k] === text ? d : { ...d, [k]: text })), []);

  const value = useMemo<ConversationsCtx>(
    () => ({
      conversations,
      get: (id) => (id ? conversations.find((c) => c.id === id) : undefined),
      isPending: (id) => Boolean(pending[id]),
      startConversation,
      send,
      retry,
      discardFailed,
      rename,
      remove,
      drafts,
      setDraft,
    }),
    [conversations, pending, startConversation, send, retry, discardFailed, rename, remove, drafts, setDraft],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useConversations(): ConversationsCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useConversations must be used inside ConversationsProvider');
  return ctx;
}
