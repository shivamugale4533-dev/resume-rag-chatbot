import { CornerDownRight } from 'lucide-react';

export const SUGGESTED_QUESTIONS = [
  'Summarize the candidate’s most relevant experience.',
  'Which projects demonstrate Python or machine learning skills?',
  'What evidence supports their leadership experience?',
  'What qualifications are mentioned in the resume?',
];

export function SuggestedQuestions({ onAsk, disabled }: { onAsk: (q: string) => void; disabled?: boolean }) {
  return (
    <div className="suggestions">
      <h2 className="section-label" id="suggestions-label">
        Try asking
      </h2>
      <ul aria-labelledby="suggestions-label">
        {SUGGESTED_QUESTIONS.map((q) => (
          <li key={q}>
            <button type="button" className="suggestion" onClick={() => onAsk(q)} disabled={disabled}>
              <CornerDownRight size={15} aria-hidden="true" />
              <span>{q}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
