import { MessageSquare, MoreHorizontal, Pencil, Search, Trash2 } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { NavLink, useNavigate, useParams } from 'react-router-dom';
import { useConversations } from '../../state/ConversationsContext';
import { useToast } from '../../state/ToastContext';
import type { Conversation } from '../../types';
import { Button } from '../shared/Button';
import { Dialog } from '../shared/Dialog';
import { Menu } from '../shared/Menu';
import { Spinner } from '../shared/Spinner';

export function ConversationList({ onNavigate }: { onNavigate?: () => void }) {
  const { conversations, rename, remove, isPending } = useConversations();
  const { conversationId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<Conversation | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  const sorted = useMemo(
    () => [...conversations].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [conversations],
  );
  const q = query.trim().toLowerCase();
  const visible = q
    ? sorted.filter((c) => c.title.toLowerCase().includes(q) || c.messages.some((m) => m.content.toLowerCase().includes(q)))
    : sorted;

  const confirmDelete = () => {
    if (!toDelete) return;
    remove(toDelete.id);
    if (toDelete.id === conversationId) navigate('/');
    toast.show('Conversation deleted.');
    setToDelete(null);
  };

  return (
    <section className="conv-list" aria-labelledby="recent-heading">
      <h2 id="recent-heading" className="section-label sidebar__label">
        Recent conversations
      </h2>

      {conversations.length > 0 && (
        <div className="search-input conv-list__search">
          <Search size={14} aria-hidden="true" />
          <input
            className="input"
            type="search"
            placeholder="Search conversations"
            aria-label="Search conversations"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      )}

      {conversations.length === 0 ? (
        <p className="conv-list__empty">Questions you ask appear here for the rest of this browser session.</p>
      ) : visible.length === 0 ? (
        <p className="conv-list__empty">No conversations match “{query.trim()}”.</p>
      ) : (
        <ul className="conv-list__items">
          {visible.map((c) => (
            <li key={c.id} className="conv-item">
              {editing === c.id ? (
                <RenameField
                  initial={c.title}
                  onDone={(title) => {
                    if (title !== null && title.trim() && title.trim() !== c.title) {
                      rename(c.id, title);
                      toast.show('Conversation renamed.');
                    }
                    setEditing(null);
                  }}
                />
              ) : (
                <>
                  <NavLink to={`/chat/${c.id}`} className="conv-item__link" onClick={onNavigate} title={c.title}>
                    {isPending(c.id) ? <Spinner size={14} label="Answering" /> : <MessageSquare size={14} aria-hidden="true" />}
                    <span className="conv-item__title">{c.title}</span>
                  </NavLink>
                  <div className="conv-item__menu">
                    <Menu
                      label={`Actions for ${c.title}`}
                      icon={<MoreHorizontal size={16} aria-hidden="true" />}
                      items={[
                        { label: 'Rename', icon: <Pencil size={14} aria-hidden="true" />, onSelect: () => setEditing(c.id) },
                        { label: 'Delete', icon: <Trash2 size={14} aria-hidden="true" />, danger: true, onSelect: () => setToDelete(c) },
                      ]}
                    />
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      <Dialog
        open={toDelete !== null}
        onClose={() => setToDelete(null)}
        title="Delete this conversation?"
        role="alertdialog"
        initialFocus={cancelRef}
        actions={
          <>
            <Button ref={cancelRef} onClick={() => setToDelete(null)}>
              Keep conversation
            </Button>
            <Button variant="danger" icon={<Trash2 size={16} aria-hidden="true" />} onClick={confirmDelete}>
              Delete conversation
            </Button>
          </>
        }
      >
        “{toDelete?.title}” and its {toDelete?.messages.filter((m) => m.role === 'user').length ?? 0} questions will be removed from this
        session. This can’t be undone.
      </Dialog>
    </section>
  );
}

function RenameField({ initial, onDone }: { initial: string; onDone: (title: string | null) => void }) {
  const [value, setValue] = useState(initial);
  const finished = useRef(false);
  // Enter and the blur that follows unmounting would otherwise both commit.
  const finish = (v: string | null) => {
    if (finished.current) return;
    finished.current = true;
    onDone(v);
  };
  return (
    <form
      className="conv-item__rename"
      onSubmit={(e) => {
        e.preventDefault();
        finish(value);
      }}
    >
      <input
        className="input"
        aria-label="Conversation name"
        value={value}
        maxLength={80}
        autoFocus
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => finish(value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            finish(null);
          }
        }}
      />
    </form>
  );
}
