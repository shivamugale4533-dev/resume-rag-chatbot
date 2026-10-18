import { FileText, MessageSquarePlus, PanelRight, PanelRightClose, RefreshCw, Upload } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { BP, useMediaQuery } from '../../hooks/useMediaQuery';
import { useConversations } from '../../state/ConversationsContext';
import { isBusy, useResume } from '../../state/ResumeContext';
import { useService } from '../../state/ServiceContext';
import type { ChatMessage } from '../../types';
import { AppHeader } from '../layout/AppHeader';
import { Button } from '../shared/Button';
import { Drawer } from '../shared/Drawer';
import { IconButton } from '../shared/IconButton';
import { Notice } from '../shared/Notice';
import { Skeleton } from '../shared/Skeleton';
import { StateMessage } from '../shared/StateMessage';
import { DocumentStatusLabel, uploadStatus } from '../resume/DocumentStatus';
import { AssistantMessage, UserMessage } from './ChatMessage';
import { MessageComposer, type ComposerHandle } from './MessageComposer';
import { SourcePanel } from './SourcePanel';
import { SuggestedQuestions } from './SuggestedQuestions';

const PANEL_PREF_KEY = 'resume-desk:evidence-panel-open';

function readPanelPref(): boolean {
  try {
    return localStorage.getItem(PANEL_PREF_KEY) !== 'false';
  } catch {
    return true;
  }
}

interface Selection {
  messageId: string;
  index: number | null;
}

export function ChatPage() {
  const { conversationId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { connection, recheck, service } = useService();
  const resume = useResume();
  const convs = useConversations();
  const conversation = convs.get(conversationId);
  const pending = conversation ? convs.isPending(conversation.id) : false;

  const inlineEvidence = useMediaQuery(BP.evidenceInline);
  const mobile = useMediaQuery(BP.mobile);
  const [panelPref, setPanelPref] = useState(readPanelPref);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [announce, setAnnounce] = useState('');

  const composerRef = useRef<ComposerHandle>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const draftKey = conversationId ?? 'new';
  const draft = convs.drafts[draftKey] ?? '';
  const setDraft = useCallback((t: string) => convs.setDraft(draftKey, t), [convs, draftKey]);

  /* ---- Reset per-conversation UI state when switching ---- */
  useEffect(() => {
    setSelection(null);
    setDrawerOpen(false);
  }, [conversationId]);

  /* ---- "New chat" focuses the composer ---- */
  const focusToken = (location.state as { focusComposer?: number } | null)?.focusComposer;
  useEffect(() => {
    if (focusToken) composerRef.current?.focus();
  }, [focusToken]);

  /* ---- Evidence: which answer is shown ---- */
  const messages = conversation?.messages ?? [];
  const answers = messages.filter((m) => m.role === 'assistant' && m.status === 'done');
  const latestAnswer = answers[answers.length - 1] ?? null;
  const evidenceMessage: ChatMessage | null =
    (selection && answers.find((m) => m.id === selection.messageId)) || latestAnswer;
  const evidenceQuestion = useMemo(() => {
    if (!evidenceMessage) return null;
    const i = messages.findIndex((m) => m.id === evidenceMessage.id);
    const q = messages[i - 1];
    return q?.role === 'user' ? q.content : null;
  }, [evidenceMessage, messages]);
  const selectedIndex = selection && evidenceMessage?.id === selection.messageId ? selection.index : null;

  // A newly arrived answer takes over the evidence panel.
  const latestAnswerId = latestAnswer?.id;
  useEffect(() => {
    setSelection(null);
  }, [latestAnswerId]);

  const panelVisible = inlineEvidence && panelPref;
  const togglePanel = () => {
    if (inlineEvidence) {
      const next = !panelPref;
      setPanelPref(next);
      try {
        localStorage.setItem(PANEL_PREF_KEY, String(next));
      } catch {
        /* preference only */
      }
    } else setDrawerOpen((o) => !o);
  };

  const onCite = useCallback(
    (messageId: string, index: number) => {
      setSelection({ messageId, index });
      if (inlineEvidence) {
        if (!panelPref) {
          setPanelPref(true);
          try {
            localStorage.setItem(PANEL_PREF_KEY, 'true');
          } catch {
            /* preference only */
          }
        }
      } else setDrawerOpen(true);
      setAnnounce(`Showing source ${index} in the evidence panel.`);
    },
    [inlineEvidence, panelPref],
  );

  const onShowSources = useCallback(
    (messageId: string) => {
      setSelection({ messageId, index: null });
      if (inlineEvidence) {
        setPanelPref(true);
      } else setDrawerOpen(true);
    },
    [inlineEvidence],
  );

  const onRetry = useCallback((messageId: string) => conversation && convs.retry(conversation.id, messageId), [conversation, convs]);
  const onEdit = useCallback(
    (messageId: string) => {
      if (!conversation) return;
      const text = convs.discardFailed(conversation.id, messageId);
      if (text !== null) {
        setDraft(text);
        composerRef.current?.focus();
      }
    },
    [conversation, convs, setDraft],
  );

  /* ---- Scrolling ---- */
  const lastMsg = messages[messages.length - 1];
  const scrollKey = `${messages.length}:${lastMsg?.status}`;
  const nearBottom = useRef(true);
  const onScroll = () => {
    const el = scrollRef.current;
    if (el) nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  };
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || !lastMsg) return;
    if (lastMsg.role === 'assistant' && lastMsg.status === 'done') {
      // Show the start of a new answer rather than jumping to its end.
      if (!nearBottom.current) return;
      const node = el.querySelector<HTMLElement>(`[data-message-id="${lastMsg.id}"]`);
      if (node) {
        const top = node.offsetTop - el.offsetTop - 24;
        el.scrollTo({ top: Math.min(top, el.scrollHeight), behavior: 'auto' });
      }
      return;
    }
    el.scrollTop = el.scrollHeight;
    nearBottom.current = true;
    // scrollKey captures "a message was added or changed status"; lastMsg is read from the same render.
  }, [scrollKey, conversationId]);

  /* ---- Submit ---- */
  const hasIndexedResume = Boolean(resume.current);
  const stale = Boolean(conversation && resume.current && conversation.resumeId && conversation.resumeId !== resume.current.id);

  const submit = (text: string) => {
    if (!conversation) {
      const id = convs.startConversation(text);
      convs.setDraft('new', '');
      navigate(`/chat/${id}`);
    } else {
      convs.send(conversation.id, text);
      setDraft('');
    }
  };

  let disabledReason: string | undefined;
  if (!hasIndexedResume) disabledReason = 'Upload a resume to start asking questions.';
  else if (stale) disabledReason = 'This conversation used a previous resume. Start a new chat to ask about the current one.';

  /* ---- Header ---- */
  const header = (
    <AppHeader
      title="Ask resume"
      context={
        resume.current || isBusy(resume.upload) ? (
          <span className="header-doc">
            <FileText size={14} aria-hidden="true" />
            <span className="header-doc__name">{resume.current?.filename ?? (resume.upload.phase === 'uploading' ? resume.upload.file.name : resume.upload.phase === 'processing' ? resume.upload.doc.filename : '')}</span>
            {!mobile && <DocumentStatusLabel doc={resume.current} upload={resume.upload} />}
          </span>
        ) : null
      }
      actions={
        hasIndexedResume && conversation ? (
          <IconButton
            label={inlineEvidence ? (panelVisible ? 'Hide evidence panel' : 'Show evidence panel') : 'Open retrieved evidence'}
            aria-expanded={inlineEvidence ? panelVisible : drawerOpen}
            aria-controls={inlineEvidence ? 'evidence-panel' : undefined}
            onClick={togglePanel}
            tooltipSide="left"
          >
            {panelVisible ? <PanelRightClose size={18} aria-hidden="true" /> : <PanelRight size={18} aria-hidden="true" />}
          </IconButton>
        ) : undefined
      }
    />
  );

  /* ---- Body states ---- */
  let body: React.ReactNode;
  if (resume.loadState === 'loading') {
    body = (
      <div className="chat-column chat-intro" aria-busy="true" aria-label="Loading resume">
        <Skeleton width={180} height={14} />
        <Skeleton width="70%" height={28} style={{ marginTop: 16 }} />
        <Skeleton width="55%" height={14} style={{ marginTop: 12 }} />
      </div>
    );
  } else if (resume.loadState === 'error') {
    body = (
      <div className="chat-column">
        <StateMessage
          tone="error"
          title={resume.loadError?.kind === 'network' || connection === 'unavailable' ? 'Can’t reach the Resume Desk API' : 'Couldn’t load the current resume'}
          actions={
            <Button
              variant="primary"
              icon={<RefreshCw size={16} aria-hidden="true" />}
              onClick={() => {
                void recheck();
                resume.reload();
              }}
            >
              Try again
            </Button>
          }
          detail={resume.loadError?.status ? `HTTP ${resume.loadError.status}` : undefined}
        >
          {resume.loadError?.kind === 'network' || resume.loadError?.kind === 'timeout'
            ? `No response from ${service.baseUrl ?? 'the API'}. Start the FastAPI server or check VITE_API_BASE_URL, then try again.`
            : resume.loadError?.message}
        </StateMessage>
      </div>
    );
  } else if (conversationId && !conversation) {
    body = (
      <div className="chat-column">
        <StateMessage
          icon={<MessageSquarePlus size={18} />}
          title="This conversation isn’t available"
          actions={
            <Link to="/" className="btn btn--primary">
              Start a new chat
            </Link>
          }
        >
          Conversations are kept for the current browser session only. It may have been deleted or opened in another tab.
        </StateMessage>
      </div>
    );
  } else if (!conversation && !hasIndexedResume) {
    const pendingStatus = uploadStatus(resume.upload);
    body = (
      <div className="chat-column chat-intro">
        {pendingStatus && isBusy(resume.upload) ? (
          <StateMessage icon={<FileText size={18} />} title="Your resume is being prepared" actions={<Link to="/resume" className="btn btn--secondary">View progress</Link>}>
            {pendingStatus.text} You can ask questions as soon as indexing finishes.
          </StateMessage>
        ) : (
          <StateMessage
            headingLevel="h2"
            icon={<FileText size={18} />}
            title="Start with a resume"
            actions={
              <Link to="/resume" className="btn btn--primary">
                <Upload size={16} aria-hidden="true" />
                Upload resume
              </Link>
            }
            detail={resume.config ? `Accepted: ${resume.config.acceptedExtensions.map((e) => e.toUpperCase()).join(', ')}` : undefined}
          >
            Upload a CV to ask questions grounded in its content.
          </StateMessage>
        )}
      </div>
    );
  } else if (!conversation) {
    body = (
      <div className="chat-column chat-intro">
        <p className="section-label">Ask this resume</p>
        <h2 className="serif-heading chat-intro__heading">Ask a question. Get an answer grounded in the document.</h2>
        <p className="chat-intro__lede">
          Each answer is built from passages retrieved from <strong className="break-anywhere">{resume.current?.filename}</strong>, and cites them so you can
          check the evidence.
        </p>
        <SuggestedQuestions onAsk={submit} />
      </div>
    );
  } else {
    body = (
      <div className="chat-column">
        <div className="thread" aria-label="Conversation" role="log" aria-live="off">
          {messages.map((m, i) =>
            m.role === 'user' ? (
              <UserMessage key={m.id} message={m} />
            ) : (
              <AssistantMessage
                key={m.id}
                message={m}
                isLatest={i === messages.length - 1}
                isEvidenceActive={(panelVisible || drawerOpen) && evidenceMessage?.id === m.id}
                selectedSource={selectedIndex}
                onCite={onCite}
                onShowSources={onShowSources}
                onRetry={onRetry}
                onEdit={onEdit}
                retryDisabled={pending || stale}
              />
            ),
          )}
        </div>
      </div>
    );
  }

  const evidence = (
    <SourcePanel
      answer={evidenceMessage}
      question={evidenceQuestion}
      selected={selectedIndex}
      onSelect={(index) => evidenceMessage && setSelection({ messageId: evidenceMessage.id, index })}
    />
  );

  return (
    <div className="chat-layout">
      <section className="chat-main" aria-label="Conversation workspace">
        {header}
        <div className="chat-scroll" ref={scrollRef} onScroll={onScroll}>
          {stale && conversation && (
            <div className="chat-column chat-stale">
              <Notice
                tone="warning"
                title="Answered against a previous resume"
                actions={
                  <Button size="sm" variant="secondary" onClick={() => navigate('/', { state: { focusComposer: Date.now() } })}>
                    Start a new chat
                  </Button>
                }
              >
                This conversation used <span className="break-anywhere">{conversation.resumeFilename ?? 'an earlier file'}</span>. The resume has since been
                replaced, so its citations refer to the old document.
              </Notice>
            </div>
          )}
          {body}
        </div>
        {resume.loadState === 'ready' && !(conversationId && !conversation) && (
          <div className="composer-dock">
            <div className="chat-column">
              <MessageComposer
                ref={composerRef}
                value={draft}
                onChange={setDraft}
                onSubmit={submit}
                busy={pending}
                disabled={!hasIndexedResume || stale}
                disabledReason={disabledReason}
              />
            </div>
          </div>
        )}
      </section>

      {panelVisible && hasIndexedResume && conversation && (
        <aside id="evidence-panel" className="evidence" aria-labelledby="evidence-heading">
          <div className="evidence__header">
            <h2 id="evidence-heading">Retrieved evidence</h2>
            <IconButton label="Hide evidence panel" onClick={togglePanel} tooltipSide="left">
              <PanelRightClose size={18} aria-hidden="true" />
            </IconButton>
          </div>
          <div className="evidence__body">{evidence}</div>
        </aside>
      )}

      {!inlineEvidence && (
        <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} side={mobile ? 'bottom' : 'right'} title="Retrieved evidence" className="evidence-drawer">
          {evidence}
        </Drawer>
      )}

      <div className="visually-hidden" role="status" aria-live="polite">
        {announce}
      </div>
    </div>
  );
}
