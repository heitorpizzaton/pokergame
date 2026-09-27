import styles from '../screens/TableScreen.module.css';

/** The 2D table (AGENTS.md §11.1): a CSS felt and rail behind the shared DOM HUD. */
export function Felt() {
  return (
    <div className={styles.felt} aria-hidden="true">
      <div className={styles.feltLine} />
    </div>
  );
}
