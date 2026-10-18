import { parseBlocks, parseInline } from '../lib/markdown';

describe('markdown subset', () => {
  it('parses citations, bold and code inline', () => {
    expect(parseInline('Uses **Python** and `dbt` [1, 2].')).toEqual([
      { type: 'text', value: 'Uses ' },
      { type: 'strong', children: [{ type: 'text', value: 'Python' }] },
      { type: 'text', value: ' and ' },
      { type: 'code', value: 'dbt' },
      { type: 'text', value: ' ' },
      { type: 'cite', index: 1 },
      { type: 'cite', index: 2 },
      { type: 'text', value: '.' },
    ]);
  });

  it('groups bullet and numbered lists', () => {
    const blocks = parseBlocks('Intro\n\n- one\n- two\n\n1. a\n2. b');
    expect(blocks.map((b) => b.type)).toEqual(['p', 'ul', 'ol']);
  });

  it('keeps HTML as plain text', () => {
    const [block] = parseBlocks('<img src=x onerror=alert(1)>');
    expect(block).toEqual({ type: 'p', children: [{ type: 'text', value: '<img src=x onerror=alert(1)>' }] });
  });
});
