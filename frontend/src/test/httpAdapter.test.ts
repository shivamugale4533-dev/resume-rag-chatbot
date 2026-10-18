import { createHttpAdapter } from '../services/httpAdapter';

function mockFetch(status: number, body: unknown) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(body === undefined ? '' : JSON.stringify(body), { status }));
}

afterEach(() => vi.restoreAllMocks());

describe('http adapter', () => {
  it('maps the chat response, keeping sources with the answer', async () => {
    const spy = mockFetch(200, { answer: 'Uses Python [1].', sources: [{ text: 'Python, SQL', section: 'Skills', page: 2, score: 0.81 }] });
    const res = await createHttpAdapter().ask({ sessionId: 's1', question: 'Languages?', history: [] });
    expect(res.sources).toEqual([{ index: 1, text: 'Python, SQL', section: 'Skills', page: 2, score: 0.81, chunkId: undefined }]);
    const body = JSON.parse(spy.mock.calls[0]![1]!.body as string);
    expect(body).toEqual({ session_id: 's1', question: 'Languages?', history: [] });
  });

  it('reports missing evaluation and logs endpoints as not implemented', async () => {
    mockFetch(404, { detail: 'Not Found' });
    await expect(createHttpAdapter().listEvaluations()).rejects.toMatchObject({ kind: 'not_implemented' });
    mockFetch(404, { detail: 'Not Found' });
    await expect(createHttpAdapter().listLogs({})).rejects.toMatchObject({ kind: 'not_implemented' });
  });

  it('treats 404 on GET /resume as "no resume"', async () => {
    mockFetch(404, { detail: 'No resume' });
    await expect(createHttpAdapter().getResume()).resolves.toBeNull();
  });

  it('keeps null metric scores distinct from zero', async () => {
    mockFetch(200, { id: 'r1', status: 'completed', created_at: '2026-01-01T00:00:00Z', scores: { faithfulness: 0, answer_correctness: null }, cases: [] });
    const run = await createHttpAdapter().getEvaluation('r1');
    expect(run.scores).toEqual({ faithfulness: 0, answer_correctness: null });
  });
});
