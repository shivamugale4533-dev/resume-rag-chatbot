import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AppProviders, AppRoutes } from '../app/App';
import { createDemoAdapter } from '../services/demoAdapter';
import type { ResumeDeskService } from '../services';
import type { ChatRequest } from '../types';

function setup() {
  const base = createDemoAdapter();
  const requests: ChatRequest[] = [];
  const service: ResumeDeskService = {
    ...base,
    ask: (req, signal) => {
      requests.push(req);
      return base.ask(req, signal);
    },
  };
  render(
    <MemoryRouter>
      <AppProviders service={service}>
        <AppRoutes />
      </AppProviders>
    </MemoryRouter>,
  );
  return { requests };
}

const composer = () => screen.getByLabelText('Question about the resume');

async function ask(text: string) {
  await userEvent.type(composer(), `${text}{Enter}`);
  await waitFor(() => expect(screen.queryByText(/Searching the resume/)).not.toBeInTheDocument(), { timeout: 4000 });
}

beforeEach(() => sessionStorage.clear());

describe('chat flow (demo adapter)', () => {
  it('answers with citations, keeps follow-up context, and isolates new conversations', async () => {
    const { requests } = setup();
    await waitFor(() => expect(composer()).toBeEnabled());

    await ask('Which programming languages are mentioned?');
    expect(screen.getByText(/skills section lists four programming languages/)).toBeInTheDocument();

    await ask('Which of those were used in projects?');
    expect(screen.getByText(/Of those languages/)).toBeInTheDocument();

    // The follow-up was sent with the first exchange as history, on the same session.
    expect(requests[1]!.history.map((t) => t.role)).toEqual(['user', 'assistant']);
    expect(requests[1]!.history[0]!.content).toBe('Which programming languages are mentioned?');
    expect(requests[1]!.sessionId).toBe(requests[0]!.sessionId);

    // Citation opens the matching source.
    const answers = screen.getAllByRole('article', { name: 'Answer' });
    await userEvent.click(within(answers[1]!).getByRole('button', { name: /Source 2/ }));
    expect(within(answers[1]!).getByRole('button', { name: /Source 2/ })).toHaveAttribute('aria-pressed', 'true');

    // New chat starts with no history and a different session.
    await userEvent.click(screen.getAllByRole('button', { name: /New chat/ })[0]!);
    await ask('Which of those were used in projects?');
    expect(requests[2]!.history).toEqual([]);
    expect(requests[2]!.sessionId).not.toBe(requests[0]!.sessionId);
    expect(screen.getByText(/Could you say which part of the resume you mean/)).toBeInTheDocument();
  }, 15000);

  it('shows a retryable error when the request fails', async () => {
    setup();
    await waitFor(() => expect(composer()).toBeEnabled());
    await ask('Please simulate an error');
    expect(screen.getByText('Couldn’t get an answer')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeEnabled();
  }, 10000);
});
