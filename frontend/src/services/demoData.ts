/* Fictional sample data for demo mode only. "Alex Morgan" is not a real person;
 * every passage below belongs to one internally consistent sample resume. */

import type { EvaluationCase, MetricScores } from '../types';

export interface DemoChunk {
  id: string;
  section: string;
  page: number;
  text: string;
  keywords: string[];
}

export const DEMO_FILENAME = 'Alex Morgan — Resume.pdf';

export const DEMO_CHUNKS: DemoChunk[] = [
  {
    id: 'summary',
    section: 'Summary',
    page: 1,
    text: 'Data engineer with six years of experience building data pipelines and analytics tooling in healthcare and B2B software. Works mostly in Python and SQL, with production experience in Airflow, dbt and PostgreSQL. Interested in applied machine learning and dependable data infrastructure.',
    keywords: ['summary', 'experience', 'background', 'years', 'data engineer', 'profile'],
  },
  {
    id: 'northwind-1',
    section: 'Experience — Northwind Analytics',
    page: 1,
    text: 'Senior Data Engineer, Northwind Analytics (Mar 2021 – present). Led a team of four engineers migrating 120 nightly batch jobs from cron scripts to Airflow, reducing failed runs by roughly 60%. Designed the dbt models behind the customer-retention dashboards used by the account-management team.',
    keywords: ['northwind', 'senior', 'airflow', 'dbt', 'migration', 'lead', 'team', 'current', 'job', 'role'],
  },
  {
    id: 'northwind-2',
    section: 'Experience — Northwind Analytics',
    page: 1,
    text: 'Introduced code-review guidelines and an on-call rotation for the data platform. Mentored three junior engineers, two of whom were promoted within eighteen months.',
    keywords: ['mentor', 'mentored', 'code review', 'on-call', 'junior', 'leadership'],
  },
  {
    id: 'harbor',
    section: 'Experience — Harbor Health Network',
    page: 1,
    text: 'Data Analyst, Harbor Health Network (Jul 2018 – Feb 2021). Built weekly reporting in SQL and Python for 14 outpatient clinics. Automated a manual Excel reconciliation process, saving about six analyst hours per week.',
    keywords: ['harbor', 'analyst', 'healthcare', 'clinics', 'reporting', 'excel', 'automation'],
  },
  {
    id: 'project-forecast',
    section: 'Projects — Clinic demand forecasting',
    page: 2,
    text: 'Clinic demand forecasting (Harbor Health, 2020). Trained gradient-boosted regression models with scikit-learn to forecast weekly appointment volume per clinic. Forecasts were used to plan staff rotas during the 2020–21 winter period.',
    keywords: ['forecast', 'forecasting', 'scikit-learn', 'regression', 'model', 'machine learning', 'ml'],
  },
  {
    id: 'project-parser',
    section: 'Projects — Resume parsing pipeline',
    page: 2,
    text: 'Resume parsing pipeline (personal project, 2023). Python service that extracts sections from PDF resumes using pdfplumber, embeds them with sentence-transformers and stores vectors in PostgreSQL with pgvector for semantic search.',
    keywords: ['parsing', 'pipeline', 'pdfplumber', 'embeddings', 'sentence-transformers', 'pgvector', 'search', 'personal'],
  },
  {
    id: 'skills',
    section: 'Skills',
    page: 2,
    text: 'Languages: Python, SQL, TypeScript (working knowledge), Bash. Data: Airflow, dbt, PySpark, PostgreSQL, BigQuery. ML: scikit-learn, pandas, sentence-transformers. Infrastructure: Docker, Terraform, GitHub Actions.',
    keywords: ['skills', 'languages', 'python', 'sql', 'typescript', 'bash', 'docker', 'terraform', 'pyspark', 'bigquery', 'tools', 'technologies'],
  },
  {
    id: 'education',
    section: 'Education',
    page: 2,
    text: 'BSc Statistics, University of Leeds (2015 – 2018), First Class Honours. Dissertation on Bayesian hierarchical models for hospital readmission rates.',
    keywords: ['education', 'degree', 'university', 'leeds', 'statistics', 'bsc', 'dissertation'],
  },
  {
    id: 'certifications',
    section: 'Certifications',
    page: 2,
    text: 'AWS Certified Data Engineer – Associate (2024). dbt Analytics Engineering Certification (2022).',
    keywords: ['certification', 'certifications', 'aws', 'certified', 'qualification'],
  },
];

export function chunk(id: string): DemoChunk {
  const c = DEMO_CHUNKS.find((x) => x.id === id);
  if (!c) throw new Error(`Unknown demo chunk ${id}`);
  return c;
}

/* ---------- Canned, evidence-backed answers ---------- */

export type DemoTopic = 'experience' | 'ml_projects' | 'leadership' | 'qualifications' | 'languages' | 'languages_in_projects';

export const DEMO_ANSWERS: Record<DemoTopic, { chunks: string[]; answer: string }> = {
  experience: {
    chunks: ['summary', 'northwind-1', 'harbor'],
    answer: `Alex Morgan is a data engineer with about six years of experience across healthcare and B2B software [1].

- **Northwind Analytics (2021 – present):** Senior Data Engineer. Led the migration of 120 nightly batch jobs to Airflow and designed the dbt models behind the customer-retention dashboards [2].
- **Harbor Health Network (2018 – 2021):** Data Analyst building weekly SQL and Python reporting for 14 outpatient clinics [3].

The most directly relevant experience for a data-engineering role is the Airflow migration, which the resume reports reduced failed runs by roughly 60% [2].`,
  },
  ml_projects: {
    chunks: ['project-forecast', 'project-parser', 'skills'],
    answer: `Two projects in the resume show Python and machine-learning work:

1. **Clinic demand forecasting (2020)** — gradient-boosted regression models built with \`scikit-learn\` to forecast weekly appointment volume per clinic [1].
2. **Resume parsing pipeline (2023)** — a Python service that extracts resume sections with \`pdfplumber\` and embeds them with \`sentence-transformers\` for semantic search [2].

The skills section also lists scikit-learn, pandas and sentence-transformers [3]. The resume does not describe training deep-learning models.`,
  },
  leadership: {
    chunks: ['northwind-1', 'northwind-2'],
    answer: `The resume gives two concrete pieces of leadership evidence:

- Leading a team of four engineers through the Airflow migration at Northwind Analytics [1].
- Mentoring three junior engineers, two of whom were promoted within eighteen months, and introducing code-review guidelines and an on-call rotation [2].

It does not mention a formal management title or direct reports.`,
  },
  qualifications: {
    chunks: ['education', 'certifications'],
    answer: `The resume lists one degree and two certifications:

- **BSc Statistics**, University of Leeds (2015 – 2018), First Class Honours, with a dissertation on Bayesian hierarchical models [1].
- **AWS Certified Data Engineer – Associate** (2024) [2].
- **dbt Analytics Engineering Certification** (2022) [2].`,
  },
  languages: {
    chunks: ['skills'],
    answer: `The skills section lists four programming languages [1]:

- **Python**
- **SQL**
- **TypeScript** — described as working knowledge
- **Bash**`,
  },
  languages_in_projects: {
    chunks: ['project-parser', 'project-forecast', 'harbor'],
    answer: `Of those languages, the resume ties two to specific projects or work:

- **Python** — the resume parsing pipeline [1], the clinic demand forecasting models [2], and weekly reporting at Harbor Health [3].
- **SQL** — weekly clinic reporting at Harbor Health [3].

TypeScript and Bash appear only in the skills list; no project is described as using them.`,
  },
};

/* ---------- Sample evaluation data (not measured) ---------- */

const s = (f: number, ar: number, cp: number, cr: number, ac: number | null): MetricScores => ({
  faithfulness: f,
  answer_relevancy: ar,
  context_precision: cp,
  context_recall: cr,
  answer_correctness: ac,
});

export const DEMO_EVAL_CASES: EvaluationCase[] = [
  {
    id: 'q01',
    question: 'How many years of experience does the candidate have?',
    groundTruth: 'About six years.',
    answer: 'The resume states six years of experience building data pipelines and analytics tooling.',
    contexts: [chunk('summary').text],
    scores: s(1, 0.96, 1, 1, 0.94),
    status: 'passed',
  },
  {
    id: 'q02',
    question: 'Which orchestration tool did they migrate batch jobs to?',
    groundTruth: 'Airflow.',
    answer: 'They led the migration of 120 nightly batch jobs from cron scripts to Airflow.',
    contexts: [chunk('northwind-1').text],
    scores: s(1, 0.93, 1, 1, 0.91),
    status: 'passed',
  },
  {
    id: 'q03',
    question: 'What machine learning library was used for demand forecasting?',
    groundTruth: 'scikit-learn (gradient-boosted regression).',
    answer: 'scikit-learn was used to train gradient-boosted regression models for weekly appointment volume.',
    contexts: [chunk('project-forecast').text, chunk('skills').text],
    scores: s(1, 0.95, 0.83, 1, 0.92),
    status: 'passed',
  },
  {
    id: 'q04',
    question: 'How many engineers did they mentor?',
    groundTruth: 'Three junior engineers.',
    answer: 'They mentored three junior engineers and led a team of four during the Airflow migration.',
    contexts: [chunk('northwind-2').text, chunk('northwind-1').text],
    scores: s(1, 0.88, 0.75, 1, 0.81),
    status: 'passed',
  },
  {
    id: 'q05',
    question: 'Where did they study and what subject?',
    groundTruth: 'Statistics at the University of Leeds.',
    answer: 'They studied Statistics at the University of Leeds, graduating with First Class Honours in 2018.',
    contexts: [chunk('education').text],
    scores: s(1, 0.97, 1, 1, 0.95),
    status: 'passed',
  },
  {
    id: 'q06',
    question: 'Which cloud certification do they hold?',
    groundTruth: 'AWS Certified Data Engineer – Associate (2024).',
    answer: 'They hold an AWS certification for data analytics.',
    contexts: [chunk('certifications').text],
    scores: s(0.5, 0.82, 1, 1, 0.48),
    status: 'failed',
    feedback: 'The answer names the wrong AWS certification; the context lists "Data Engineer – Associate".',
  },
  {
    id: 'q07',
    question: 'Has the candidate worked with Kubernetes?',
    groundTruth: 'The resume does not mention Kubernetes.',
    answer: 'The resume does not mention Kubernetes. Infrastructure experience listed is Docker, Terraform and GitHub Actions.',
    contexts: [chunk('skills').text],
    scores: s(1, 0.79, 1, 1, 0.86),
    status: 'passed',
  },
  {
    id: 'q08',
    question: 'What did the Excel automation save?',
    groundTruth: 'About six analyst hours per week.',
    answer: 'It saved about six analyst hours per week.',
    contexts: [chunk('harbor').text, chunk('summary').text],
    scores: s(1, 0.9, 0.5, 1, null),
    status: 'error',
    error: 'Evaluator timed out while scoring answer correctness. Other metrics were computed.',
  },
];

export const DEMO_PREVIOUS_RUN_CASES: EvaluationCase[] = DEMO_EVAL_CASES.map((c) => ({
  ...c,
  status: c.status === 'error' ? 'passed' : c.status,
  error: undefined,
  scores: {
    faithfulness: Math.max(0, (c.scores.faithfulness ?? 0.9) - (c.id === 'q04' ? 0.25 : 0)),
    answer_relevancy: Math.max(0, (c.scores.answer_relevancy ?? 0.9) - 0.03),
    context_precision: Math.max(0, (c.scores.context_precision ?? 0.9) - (c.id === 'q03' ? 0.16 : 0.04)),
    context_recall: c.id === 'q07' ? 0.5 : (c.scores.context_recall ?? 1),
    answer_correctness: Math.max(0, (c.scores.answer_correctness ?? 0.85) - 0.05),
  },
}));
