import { GAME_VERSION } from '../../save/version';

interface StartScreenProps {
  /** Why an existing save could not be loaded, if there was one. */
  notice?: string;
  onStart(): void;
}

export function StartScreen({ notice, onStart }: StartScreenProps) {
  return (
    <div className="start">
      <div className="start__content">
        <p className="start__eyebrow">A text survival game</p>
        <h1 className="start__title">Stranded</h1>
        <p className="start__intro">
          The storm tore your ship apart in the night. You wake on the sand of an unknown island with nothing but the clothes on your back.
        </p>
        <p className="start__intro">Find water. Find food. Tend your wounds. Survive.</p>
        {notice && (
          <div className="notice" role="alert">
            <strong>Your previous game could not be loaded.</strong>
            <p>{notice}</p>
            <p className="small">Starting a new game will replace it.</p>
          </div>
        )}
        <button type="button" className="button button--primary button--large" onClick={onStart}>
          Wake up on the beach
        </button>
        <p className="version">Version {GAME_VERSION}</p>
      </div>
    </div>
  );
}
