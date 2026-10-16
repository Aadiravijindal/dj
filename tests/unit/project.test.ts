import { describe, expect, it } from 'vitest';
import { createProject, normalizeProject, parseSteps, BUILD_TEMPLATES } from '../../src/project/defaults';
import { LocalProjectRepository, StorageError, summarize } from '../../src/project/storage';
import { SAMPLE_PROJECTS } from '../../src/project/samples';

class MemStorage implements Storage {
  m = new Map<string, string>();
  quota = Infinity;
  get length() {
    return this.m.size;
  }
  clear() {
    this.m.clear();
  }
  getItem(k: string) {
    return this.m.get(k) ?? null;
  }
  key(i: number) {
    return [...this.m.keys()][i] ?? null;
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
  setItem(k: string, v: string) {
    if (v.length > this.quota) throw new DOMException('full', 'QuotaExceededError');
    this.m.set(k, v);
  }
}

describe('projects', () => {
  it('normalizes partial or old project data with defaults', () => {
    const p = normalizeProject({ id: 'x', name: 'Old', decks: { A: { trackId: 'demo:neon-tide', hotCues: [5] } } })!;
    expect(p.decks.A.trackId).toBe('demo:neon-tide');
    expect(p.decks.A.hotCues).toHaveLength(8);
    expect(p.decks.A.hotCues[0]).toBe(5);
    expect(p.mixer.channels.B.eq.low).toBe(0);
    expect(p.beats.patterns.length).toBeGreaterThan(0);
    expect(p.pads.assignments).toHaveLength(16);
  });
  it('rejects garbage', () => {
    expect(normalizeProject(null)).toBeNull();
    expect(normalizeProject({ foo: 1 })).toBeNull();
  });
  it('round-trips through the repository, including creative settings', () => {
    const repo = new LocalProjectRepository(new MemStorage());
    const p = createProject('Test');
    p.decks.A.trackId = 'demo:neon-tide';
    p.decks.A.hotCues[2] = 12.5;
    p.fx.A.echo.enabled = true;
    p.beats.patterns[0].tracks[0].steps[3] = 2;
    repo.save(p);
    const back = repo.get(p.id)!;
    expect(back.decks.A.hotCues[2]).toBe(12.5);
    expect(back.fx.A.echo.enabled).toBe(true);
    expect(back.beats.patterns[0].tracks[0].steps[3]).toBe(2);
    expect(repo.list().map((s) => s.id)).toContain(p.id);
    repo.remove(p.id);
    expect(repo.get(p.id)).toBeNull();
    expect(repo.list()).toHaveLength(0);
  });
  it('reports a full disk honestly', () => {
    const st = new MemStorage();
    st.quota = 10;
    const repo = new LocalProjectRepository(st);
    expect(() => repo.save(createProject('Big'))).toThrow(StorageError);
  });
  it('never stores audio — only references and settings', () => {
    const p = SAMPLE_PROJECTS[0].make();
    const json = JSON.stringify(p);
    expect(json.length).toBeLessThan(40000);
    expect(summarize(p).trackIds).toContain('demo:neon-tide');
  });
  it('parses step strings and build templates are well-formed', () => {
    expect(parseSteps('x..X')).toEqual([1, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    for (const t of Object.values(BUILD_TEMPLATES)) {
      const b = t.make();
      for (const e of b.events) expect(e.start + e.length).toBeLessThanOrEqual(b.bars * 4);
    }
  });
});
