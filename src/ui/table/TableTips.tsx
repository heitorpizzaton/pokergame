import { useState } from 'react';
import { strings } from '../../i18n/index.ts';
import styles from './Sheet.module.css';

const t = strings.table.tips;

/**
 * Three short tips the first time the user sits at a table (AGENTS.md §31.2.4). The game waits
 * until they are dismissed; "Como jogar" can show them again.
 */
export function TableTips({ onDone }: { readonly onDone: () => void }) {
  const [step, setStep] = useState(0);
  const tip = t.steps[step];
  if (!tip) return null;
  const last = step === t.steps.length - 1;
  return (
    <div className={styles.overlay}>
      <section
        className={styles.sheet}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tips-title"
        data-testid="table-tips"
      >
        <div className={styles.header}>
          <h2 id="tips-title" className={styles.title}>
            {tip.title}
          </h2>
          <span className={styles.tipStep}>{t.step(step + 1, t.steps.length)}</span>
        </div>
        <p className={styles.tipBody}>{tip.body}</p>
        <div className={styles.buttons}>
          {!last && (
            <button type="button" className={styles.secondary} onClick={onDone}>
              {t.skip}
            </button>
          )}
          <button
            type="button"
            className={styles.primary}
            onClick={() => {
              if (last) onDone();
              else setStep(step + 1);
            }}
          >
            {last ? t.done : t.next}
          </button>
        </div>
      </section>
    </div>
  );
}
