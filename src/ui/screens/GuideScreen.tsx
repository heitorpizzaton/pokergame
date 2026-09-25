import { parseCards } from '../../core/cards/index.ts';
import { evaluate } from '../../core/eval/index.ts';
import { handName, strings } from '../../i18n/index.ts';
import { PlayingCard } from '../table/PlayingCard.tsx';
import styles from './GuideScreen.module.css';

/** One illustrative hand per category, strongest first (matches `strings.guide.rankings`). */
const EXAMPLES = [
  'AhKhQhJhTh',
  '9s8s7s6s5s',
  'QcQdQhQs4d',
  'KsKhKd7c7h',
  'AdJd8d5d2d',
  'Tc9h8d7s6c',
  '7s7h7dKc2d',
  'JsJh4c4dAs',
  'TdTs9c5h2s',
  'AcQh9d6s3c',
].map(parseCards);

/** "Como jogar": a short illustrated guide to the rules and hand rankings (AGENTS.md §11.7). */
export function GuideScreen({
  onBack,
  fourColor,
}: {
  readonly onBack: () => void;
  readonly fourColor: boolean;
}) {
  const t = strings.guide;
  return (
    <main className={styles.screen} data-testid="guide-screen">
      <header className={styles.header}>
        <button type="button" className={styles.back} onClick={onBack}>
          {t.back}
        </button>
        <h1 className={styles.title}>{t.title}</h1>
      </header>
      <div className={styles.content}>
        <p className={styles.intro}>{t.intro}</p>
        {t.sections.map((section) => (
          <section key={section.title} className={styles.section}>
            <h2>{section.title}</h2>
            <p>{section.body}</p>
          </section>
        ))}
        <section className={styles.section} aria-labelledby="ranking-title">
          <h2 id="ranking-title">{t.rankingTitle}</h2>
          <ol className={styles.rankings}>
            {t.rankings.map((ranking, i) => {
              const cards = EXAMPLES[i] ?? [];
              return (
                <li key={ranking.name} className={styles.ranking} data-testid="guide-ranking">
                  <div className={styles.rankingText}>
                    <h3>{ranking.name}</h3>
                    <p>{ranking.body}</p>
                  </div>
                  <div
                    className={styles.cards}
                    role="img"
                    aria-label={t.example(handName(evaluate(cards)))}
                  >
                    {cards.map((card) => (
                      <PlayingCard key={card} card={card} size="small" fourColor={fourColor} />
                    ))}
                  </div>
                </li>
              );
            })}
          </ol>
          <p className={styles.note}>{t.tieNote}</p>
        </section>
        <p className={styles.legal}>{strings.legal.entertainment}</p>
      </div>
    </main>
  );
}
