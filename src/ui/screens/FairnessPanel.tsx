import { useState } from 'react';
import { formatCards } from '../../core/cards/index.ts';
import { commitmentText } from '../../core/fairness/index.ts';
import { checkFairness, type FairnessCheck, type HandRecord } from '../../history/index.ts';
import { strings } from '../../i18n/index.ts';
import styles from './FairnessPanel.module.css';

const t = strings.fairness;

/** "Prova de justiça" for a recorded hand (AGENTS.md §14, Phase 8), with "Verificar". */
export function FairnessPanel({
  record,
  onClose,
}: {
  readonly record: HandRecord;
  readonly onClose: () => void;
}) {
  const [result, setResult] = useState<FairnessCheck | null>(null);
  const proof = record.fairness;
  const message = !result
    ? null
    : !result.commitment
      ? t.commitmentFailed
      : !result.cards
        ? t.cardsFailed
        : t.verified;

  return (
    <div
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-labelledby="fairness-title"
    >
      <div className={styles.dialog} data-testid="fairness-panel">
        <h2 id="fairness-title">{t.title}</h2>
        {proof ? (
          <>
            <p className={styles.intro}>{t.intro}</p>
            <dl className={styles.fields}>
              <dt>{t.commitment}</dt>
              <dd className={styles.mono} data-testid="fairness-hash">
                {proof.hash}
              </dd>
              <dt>{t.salt}</dt>
              <dd className={styles.mono}>{proof.salt}</dd>
              <dt>{t.deck}</dt>
              <dd className={styles.mono}>{formatCards(proof.deck)}</dd>
            </dl>
            <details className={styles.details}>
              <summary>{t.text}</summary>
              <p className={styles.mono}>{commitmentText(proof.deck, proof.salt)}</p>
            </details>
            {message && (
              <p
                className={result?.commitment && result.cards ? styles.ok : styles.fail}
                role="status"
                data-testid="fairness-result"
              >
                {message}
              </p>
            )}
          </>
        ) : (
          <p className={styles.intro}>{t.unavailable}</p>
        )}
        <div className={styles.buttons}>
          <button type="button" className={styles.secondary} onClick={onClose}>
            {strings.history.back}
          </button>
          {proof && (
            <button
              type="button"
              className={styles.primary}
              data-testid="fairness-verify"
              onClick={() => {
                setResult(checkFairness(record));
              }}
            >
              {t.verify}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
