import { useState } from 'react';
import { FIGHT_RULES } from '../../engine/rules';
import { GAME_VERSION, SAVE_VERSION } from '../../save/version';
import { Modal } from './Modal';

interface MenuDialogProps {
  onClose(): void;
  onNewGame(): void;
}

export function MenuDialog({ onClose, onNewGame }: MenuDialogProps) {
  const [confirming, setConfirming] = useState(false);
  return (
    <Modal title="Stranded" onClose={onClose}>
      <p className="muted">The game is saved automatically after every action.</p>
      <h3 className="section-title">How to survive</h3>
      <ul className="help-list">
        <li>Every action takes time.</li>
        <li>
          Thirst and hunger grow over time; lower is better. Keep them below half to heal naturally. When a bar is full you start dying.
        </li>
        <li>Bandage wounds with rags to stop bleeding. Splint broken bones with sticks and a binding.</li>
        <li>
          Your health is the sum of your body parts. A badly hurt part gets injured, a badly hurt arm or leg breaks, and one with no health
          left is lost. With no health left in your torso or head, you die.
        </li>
        <li>
          Sleep when your energy is below 50, or once you are sleepy after 20 hours awake. Where you sleep matters: the bare ground leaves
          you aching, a mat, shelter, hut or house each rest you better. Working on with no energy left costs health.
        </li>
        <li>
          Heat makes you thirsty and cold makes you hungry; hours of either weaken you. A roof, a burning fire and clothes help, and the
          rain gets you wet. Worn clothes wear out.
        </li>
        <li>A fire burns only while it has fuel. Rain puts out a campfire or fireplace, even under a roof.</li>
        <li>
          Tracking animals in the forest leads to fights. A fight goes turn by turn on a field of {FIGHT_RULES.fieldSize} spaces, and time
          stands still while it lasts.
        </li>
        <li>Attributes grow slowly as you use them.</li>
        <li>Hover over an action (or long-press it on a touch screen) to see what it needs and what it may give.</li>
      </ul>
      {confirming ? (
        <div className="confirm">
          <p>Start over? Your current survivor will be lost.</p>
          <div className="button-row">
            <button
              type="button"
              className="button button--danger"
              onClick={() => {
                onClose();
                onNewGame();
              }}
            >
              Yes, start a new game
            </button>
            <button type="button" className="button" onClick={() => setConfirming(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="button-row">
          <button type="button" className="button" onClick={() => setConfirming(true)}>
            New game
          </button>
          <button type="button" className="button button--primary" onClick={onClose}>
            Continue
          </button>
        </div>
      )}
      <p className="version">
        Icons by Lorc, Delapouite and contributors from{' '}
        <a href="https://game-icons.net" target="_blank" rel="noreferrer">
          game-icons.net
        </a>
        , licensed under{' '}
        <a href="https://creativecommons.org/licenses/by/3.0/" target="_blank" rel="noreferrer">
          CC BY 3.0
        </a>
        .
      </p>
      <p className="version">
        Version {GAME_VERSION} · save format {SAVE_VERSION}
      </p>
    </Modal>
  );
}
