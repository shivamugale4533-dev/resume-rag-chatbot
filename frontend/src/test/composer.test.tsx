import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { MessageComposer } from '../components/chat/MessageComposer';

function Harness({ onSubmit, disabled }: { onSubmit: (t: string) => void; disabled?: boolean }) {
  const [v, setV] = useState('');
  return <MessageComposer value={v} onChange={setV} onSubmit={onSubmit} disabled={disabled} disabledReason="Upload a resume first." />;
}

describe('MessageComposer', () => {
  it('sends on Enter and inserts a newline on Shift+Enter', async () => {
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);
    const box = screen.getByLabelText('Question about the resume');
    await userEvent.type(box, 'First line{Shift>}{Enter}{/Shift}second');
    expect(onSubmit).not.toHaveBeenCalled();
    expect(box).toHaveValue('First line\nsecond');
    await userEvent.type(box, '{Enter}');
    expect(onSubmit).toHaveBeenCalledWith('First line\nsecond');
  });

  it('does not send whitespace-only messages', async () => {
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);
    await userEvent.type(screen.getByLabelText('Question about the resume'), '   {Enter}');
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Send question' })).toBeDisabled();
  });

  it('explains why it is disabled', () => {
    render(<Harness onSubmit={vi.fn()} disabled />);
    expect(screen.getByText('Upload a resume first.')).toBeInTheDocument();
    expect(screen.getByLabelText('Question about the resume')).toBeDisabled();
  });
});
