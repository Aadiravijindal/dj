import { useRef, useState } from 'react';
import { Plus, Star, Copy, Trash2, Pencil, Play, Download, Upload, Search, FolderOpen } from 'lucide-react';
import { useApp } from '../../state/store';
import { openProjectById, newProject, renameProject, duplicateProject, deleteProject, toggleFavorite, exportProject, importProjectFile } from '../../state/actions';
import { repository } from '../../project/storage';
import { getTrackMetaSync } from '../../catalog/registry';
import { Artwork } from '../../ui/Artwork';
import { Confirm, Modal } from '../../ui/Modal';
import { fmtAgo } from '../../ui/hooks';

export function MyMixes() {
  const projects = useApp((s) => s.projects);
  const currentId = useApp((s) => s.project.id);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<'opened' | 'updated' | 'name'>('opened');
  const [onlyFav, setOnlyFav] = useState(false);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const list = projects
    .filter((p) => (!onlyFav || p.favorite) && p.name.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (sort === 'name' ? a.name.localeCompare(b.name) : sort === 'updated' ? b.updatedAt - a.updatedAt : b.openedAt - a.openedAt));
  const del = projects.find((p) => p.id === confirmDel);

  return (
    <div className="page mixes" data-testid="mixes">
      <header className="page-head">
        <div>
          <h1>My Mixes</h1>
          <p className="muted">Mixes save your track choices, cue points, loops, beats, pads, effects and timeline — on this device.</p>
        </div>
        <div className="row wrap">
          <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={(e) => e.target.files?.[0] && importProjectFile(e.target.files[0])} />
          <button className="btn" onClick={() => fileRef.current?.click()}>
            <Upload /> Import
          </button>
          <button className="btn primary" onClick={() => setCreating(true)} data-testid="new-mix">
            <Plus /> New mix
          </button>
        </div>
      </header>

      <div className="lib-controls">
        <div className="search-box">
          <Search size={16} />
          <input className="input" placeholder="Search your mixes" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search mixes" />
        </div>
        <select className="select" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} aria-label="Sort">
          <option value="opened">Recently opened</option>
          <option value="updated">Recently edited</option>
          <option value="name">Name</option>
        </select>
        <button className={`btn sm${onlyFav ? ' on' : ''}`} aria-pressed={onlyFav} onClick={() => setOnlyFav((f) => !f)}>
          <Star /> Favourites
        </button>
      </div>

      {list.length === 0 ? (
        <div className="empty" style={{ marginTop: 24 }}>
          <FolderOpen />
          {projects.length === 0 ? 'No saved mixes yet. Start one — it saves automatically as you play.' : 'No mixes match.'}
          {projects.length === 0 && (
            <button className="btn accent" onClick={() => setCreating(true)}>
              <Plus /> Create your first mix
            </button>
          )}
        </div>
      ) : (
        <div className="mix-grid">
          {list.map((p) => (
            <article key={p.id} className={`mix-card${p.id === currentId ? ' current' : ''}`} data-testid="mix-card">
              <button className="mix-open" onClick={() => openProjectById(p.id)} aria-label={`Open ${p.name}`}>
                <div className="mix-arts">
                  {p.trackIds.slice(0, 4).map((id) => (
                    <Artwork key={id} art={getTrackMetaSync(id)?.artwork ?? null} size={52} radius={10} />
                  ))}
                  {p.trackIds.length === 0 && <div className="mix-empty-art">No tracks yet</div>}
                </div>
              </button>
              <div className="mix-info">
                {renaming === p.id ? (
                  <input
                    className="input"
                    autoFocus
                    defaultValue={p.name}
                    aria-label="Mix name"
                    onBlur={(e) => {
                      renameProject(p.id, e.target.value);
                      setRenaming(null);
                    }}
                    onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                  />
                ) : (
                  <b className="ellipsis">{p.name}</b>
                )}
                <span className="small muted">
                  {p.trackIds.length} tracks · edited {fmtAgo(p.updatedAt)} · created {new Date(p.createdAt).toLocaleDateString()}
                </span>
                {p.id === currentId && <span className="chip tiny ok">Open in studio</span>}
              </div>
              <div className="mix-actions">
                <button className="btn sm accent" onClick={() => openProjectById(p.id)}>
                  <Play /> Open
                </button>
                <button className={`btn ghost icon-btn sm${p.favorite ? ' fav-on' : ''}`} aria-pressed={p.favorite} aria-label={p.favorite ? 'Unfavourite' : 'Favourite'} onClick={() => toggleFavorite(p.id)}>
                  <Star />
                </button>
                <button className="btn ghost icon-btn sm" aria-label={`Rename ${p.name}`} data-tip="Rename" onClick={() => setRenaming(p.id)}>
                  <Pencil />
                </button>
                <button className="btn ghost icon-btn sm" aria-label={`Duplicate ${p.name}`} data-tip="Duplicate" onClick={() => duplicateProject(p.id)}>
                  <Copy />
                </button>
                <button
                  className="btn ghost icon-btn sm"
                  aria-label={`Export ${p.name}`}
                  data-tip="Export as a file"
                  onClick={() => {
                    const full = repository.get(p.id);
                    if (full) exportProject(full);
                  }}
                >
                  <Download />
                </button>
                <button className="btn ghost icon-btn sm" aria-label={`Delete ${p.name}`} data-tip="Delete" onClick={() => setConfirmDel(p.id)} data-testid="delete-mix">
                  <Trash2 />
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {del && (
        <Confirm
          title="Delete this mix?"
          message={
            <>
              “{del.name}” and its cue points, loops, beats and timeline will be permanently removed from this device. This can’t be undone.
            </>
          }
          confirmLabel="Delete mix"
          danger
          onCancel={() => setConfirmDel(null)}
          onConfirm={() => {
            deleteProject(del.id);
            setConfirmDel(null);
          }}
        />
      )}
      {creating && <NewMixDialog onClose={() => setCreating(false)} />}
    </div>
  );
}

function NewMixDialog({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('');
  const create = () => {
    newProject(name.trim() || 'Untitled mix');
    onClose();
  };
  return (
    <Modal
      title="New mix"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={create} data-testid="create-mix">
            Create & open
          </button>
        </>
      }
    >
      <label className="stack">
        <span className="small muted">Name</span>
        <input className="input" autoFocus placeholder="Friday warm-up" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && create()} data-testid="new-mix-name" />
      </label>
    </Modal>
  );
}
