/* A deliberately small Markdown subset for model answers, parsed to a plain AST
 * and rendered as React elements. HTML in the source is shown as text, never
 * injected. Supported: paragraphs, -/* bullets, 1. lists, ### headings,
 * **bold**, *italic*, `code`, and citation markers like [1] or [1, 2]. */

export type Inline =
  | { type: 'text'; value: string }
  | { type: 'strong'; children: Inline[] }
  | { type: 'em'; children: Inline[] }
  | { type: 'code'; value: string }
  | { type: 'cite'; index: number };

export type Block =
  | { type: 'p'; children: Inline[] }
  | { type: 'h'; children: Inline[] }
  | { type: 'ul'; items: Inline[][] }
  | { type: 'ol'; start: number; items: Inline[][] }
  | { type: 'pre'; value: string };

const BULLET = /^\s*[-*•]\s+(.*)$/;
const NUMBERED = /^\s*(\d+)[.)]\s+(.*)$/;
const HEADING = /^\s*#{1,6}\s+(.*)$/;

export function parseBlocks(src: string): Block[] {
  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  let para: string[] = [];

  const flushPara = () => {
    if (para.length) blocks.push({ type: 'p', children: parseInline(para.join(' ')) });
    para = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';

    if (line.trim().startsWith('```')) {
      flushPara();
      const body: string[] = [];
      i++;
      while (i < lines.length && !(lines[i] ?? '').trim().startsWith('```')) body.push(lines[i++] ?? '');
      blocks.push({ type: 'pre', value: body.join('\n') });
      continue;
    }
    if (!line.trim()) {
      flushPara();
      continue;
    }
    const h = HEADING.exec(line);
    if (h) {
      flushPara();
      blocks.push({ type: 'h', children: parseInline(h[1] ?? '') });
      continue;
    }
    const b = BULLET.exec(line);
    const n = NUMBERED.exec(line);
    if (b || n) {
      flushPara();
      const ordered = !b;
      const items: Inline[][] = [];
      const start = n ? Number(n[1]) : 1;
      while (i < lines.length) {
        const cur = lines[i] ?? '';
        const m = ordered ? NUMBERED.exec(cur) : BULLET.exec(cur);
        if (m) {
          items.push(parseInline((ordered ? m[2] : m[1]) ?? ''));
          i++;
        } else if (cur.trim() && /^\s{2,}/.test(cur) && items.length) {
          // Continuation line of the previous item.
          items[items.length - 1]!.push({ type: 'text', value: ' ' }, ...parseInline(cur.trim()));
          i++;
        } else break;
      }
      i--;
      blocks.push(ordered ? { type: 'ol', start, items } : { type: 'ul', items });
      continue;
    }
    para.push(line.trim());
  }
  flushPara();
  return blocks;
}

const TOKEN = /(\*\*[^*]+\*\*|`[^`]+`|\[\d+(?:\s*,\s*\d+)*\]|(?<![*\w])\*[^*\s][^*]*\*(?!\w))/g;

export function parseInline(src: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  for (const m of src.matchAll(TOKEN)) {
    const tok = m[0];
    const at = m.index ?? 0;
    if (at > last) out.push({ type: 'text', value: src.slice(last, at) });
    if (tok.startsWith('**')) out.push({ type: 'strong', children: parseInline(tok.slice(2, -2)) });
    else if (tok.startsWith('`')) out.push({ type: 'code', value: tok.slice(1, -1) });
    else if (tok.startsWith('[')) {
      for (const n of tok.slice(1, -1).split(',')) out.push({ type: 'cite', index: Number(n.trim()) });
    } else out.push({ type: 'em', children: parseInline(tok.slice(1, -1)) });
    last = at + tok.length;
  }
  if (last < src.length) out.push({ type: 'text', value: src.slice(last) });
  return out;
}

/** Plain-text version for clipboard: strips emphasis markers, keeps [n]. */
export function toPlainText(src: string): string {
  return src.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/`([^`]+)`/g, '$1');
}
