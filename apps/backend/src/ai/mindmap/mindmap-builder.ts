/**
 * Pure (no-AI) helpers for the mind-map pipeline.
 *
 * The heavy upstream work (PDF/DOCX → Markdown → heading-aware chunks) is already
 * done at material-upload time and persisted in `CourseChunk`. Each chunk carries
 * `sectionTitle` = the full heading path (e.g. "Chương 1 > 1.2 Mảng > Mảng động").
 * These helpers rebuild a hierarchy from those paths for free, and convert the
 * AI-summarised tree into the various export formats — all without spending tokens.
 */

/** Canonical mind-map node. `children` order: structural sub-sections then key points. */
export interface MindNode {
  title: string;
  summary?: string;
  keywords?: string[];
  children?: MindNode[];
}

export interface ChunkInput {
  sectionTitle: string | null;
  content: string;
  chunkIndex: number;
}

/** A leaf group of source content to be summarised by the LLM. */
export interface ContentGroup {
  /** Heading path segments, e.g. ["Chương 1", "1.2 Mảng"]. Empty = document root. */
  path: string[];
  content: string;
}

/** AI summary returned for one {@link ContentGroup}. */
export interface GroupSummary {
  title?: string;
  summary?: string;
  main_points?: string[];
  keywords?: string[];
}

const PATH_SEP = ' > ';

function splitPath(sectionTitle: string | null): string[] {
  if (!sectionTitle) return [];
  return sectionTitle
    .split(PATH_SEP)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Group chunks into at most `maxGroups` leaves by collapsing the heading path to a
 * shared depth. We pick the deepest depth that still yields ≤ maxGroups groups, so
 * large documents stay readable and the number of LLM calls stays bounded.
 * Returns `null` when there are no usable headings (caller should cluster instead).
 */
export function groupByHeading(
  chunks: ChunkInput[],
  maxGroups: number,
): ContentGroup[] | null {
  const ordered = [...chunks].sort((a, b) => a.chunkIndex - b.chunkIndex);
  const maxDepth = ordered.reduce(
    (m, c) => Math.max(m, splitPath(c.sectionTitle).length),
    0,
  );
  if (maxDepth === 0) return null; // no headings at all → caller falls back

  let depth = maxDepth;
  for (; depth >= 1; depth--) {
    const keys = new Set(
      ordered.map((c) => splitPath(c.sectionTitle).slice(0, depth).join(PATH_SEP)),
    );
    if (keys.size <= maxGroups) break;
  }
  depth = Math.max(depth, 1);

  // Preserve first-seen order of groups (documents read top-to-bottom).
  const order: string[] = [];
  const byKey = new Map<string, ContentGroup>();
  for (const c of ordered) {
    const path = splitPath(c.sectionTitle).slice(0, depth);
    const key = path.join(PATH_SEP) || '__root__';
    let g = byKey.get(key);
    if (!g) {
      g = { path, content: '' };
      byKey.set(key, g);
      order.push(key);
    }
    g.content += (g.content ? '\n\n' : '') + c.content;
  }
  return order.map((k) => byKey.get(k)!);
}

/**
 * Fallback grouping for documents with no headings: split the chunk stream into
 * `targetGroups` sequential buckets. Used together with embedding clusters in the
 * service; this is the cheap, structure-free default.
 */
export function groupSequential(
  chunks: ChunkInput[],
  targetGroups: number,
): ContentGroup[] {
  const ordered = [...chunks].sort((a, b) => a.chunkIndex - b.chunkIndex);
  const n = ordered.length;
  if (n === 0) return [];
  const groups = Math.max(1, Math.min(targetGroups, n));
  const size = Math.ceil(n / groups);
  const out: ContentGroup[] = [];
  for (let i = 0; i < n; i += size) {
    const slice = ordered.slice(i, i + size);
    out.push({
      path: [`Phần ${out.length + 1}`],
      content: slice.map((c) => c.content).join('\n\n'),
    });
  }
  return out;
}

/**
 * Assemble the canonical tree from per-group summaries. Group paths define the
 * hierarchy; a node may simultaneously be a structural parent and carry its own
 * summary. `main_points` become leaf children so they render as branches.
 */
export function buildTree(
  rootTitle: string,
  groups: { path: string[]; summary: GroupSummary }[],
): MindNode {
  const root: MindNode = { title: rootTitle, children: [] };

  const findOrCreateChild = (parent: MindNode, title: string): MindNode => {
    parent.children ??= [];
    let node = parent.children.find((c) => c.title === title);
    if (!node) {
      node = { title };
      parent.children.push(node);
    }
    return node;
  };

  for (const { path, summary } of groups) {
    // Walk/create structural nodes for every path segment.
    let node = root;
    if (path.length === 0) {
      node = root;
    } else {
      for (const seg of path) node = findOrCreateChild(node, seg);
    }

    // Attach summary onto the deepest node.
    if (summary.title && path.length > 0) node.title = summary.title;
    if (summary.summary) node.summary = summary.summary;
    if (summary.keywords?.length) node.keywords = dedupeKeywords(summary.keywords);
    if (summary.main_points?.length) {
      node.children ??= [];
      for (const p of summary.main_points) {
        const point = p.trim();
        if (point && !node.children.some((c) => c.title === point)) {
          node.children.push({ title: point });
        }
      }
    }
  }

  pruneEmpty(root);
  return root;
}

function dedupeKeywords(keywords: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const k of keywords) {
    const t = k.trim();
    const lc = t.toLowerCase();
    if (t && !seen.has(lc)) {
      seen.add(lc);
      out.push(t);
    }
  }
  return out.slice(0, 8);
}

function pruneEmpty(node: MindNode): void {
  if (node.children) {
    node.children.forEach(pruneEmpty);
    if (node.children.length === 0) delete node.children;
  }
}

// ─── Exporters (token-free) ──────────────────────────────────────────────────

/** Markmap-flavoured markdown: a single H1 root + nested bullet list. */
export function toMarkmap(root: MindNode): string {
  const lines: string[] = [
    '---',
    'markmap:',
    '  colorFreezeLevel: 2',
    '  initialExpandLevel: 3',
    '---',
    '',
    `# ${escapeInline(root.title)}`,
    '',
  ];
  const walk = (node: MindNode, depth: number) => {
    const indent = '  '.repeat(depth);
    let label = escapeInline(node.title);
    if (node.keywords?.length) {
      label += ` — \`${node.keywords.map(escapeInline).join('`, `')}\``;
    }
    lines.push(`${indent}- ${label}`);
    if (node.summary) {
      lines.push(`${indent}  - *${escapeInline(node.summary)}*`);
    }
    for (const child of node.children ?? []) walk(child, depth + 1);
  };
  for (const child of root.children ?? []) walk(child, 0);
  return lines.join('\n');
}

/** Mermaid `mindmap` syntax (indentation-based). */
export function toMermaid(root: MindNode): string {
  const lines: string[] = ['mindmap', `  root((${sanitizeMermaid(root.title)}))`];
  const walk = (node: MindNode, depth: number) => {
    lines.push(`${'  '.repeat(depth + 1)}${sanitizeMermaid(node.title)}`);
    for (const child of node.children ?? []) walk(child, depth + 1);
  };
  for (const child of root.children ?? []) walk(child, 1);
  return lines.join('\n');
}

/** XMind-compatible JSON (single sheet, attached topics). */
export function toXmind(root: MindNode): unknown {
  const toTopic = (node: MindNode): Record<string, unknown> => {
    const children = (node.children ?? []).map(toTopic);
    return {
      title: node.title,
      ...(node.summary ? { note: node.summary } : {}),
      ...(children.length ? { children: { attached: children } } : {}),
    };
  };
  return [{ rootTopic: toTopic(root) }];
}

function escapeInline(text: string): string {
  return text.replace(/\r?\n+/g, ' ').replace(/`/g, "'").trim();
}

function sanitizeMermaid(text: string): string {
  // Mermaid mindmap node text: strip newlines and bracket chars that break parsing.
  return text
    .replace(/\r?\n+/g, ' ')
    .replace(/[()[\]{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}
