import { useEffect, useMemo, useRef, useState } from 'react';
import { getActions } from '../engine/actions';
import { type CharacterSheet, getCharacterSheet } from '../engine/character';
import { BODY_CONDITIONS } from '../engine/conditions';
import type { GameState, LogEntry, LogTone } from '../engine/types';
import { BODY_PART_IDS } from '../engine/types';
import { type ActionView, toActionView } from './actionView';
import { shownHealth } from './health';
import type { IconName } from '../icons/gameIcons';
import { EnvironmentBar } from './components/EnvironmentBar';
import { Icon } from './components/Icon';
import { MenuDialog } from './components/MenuDialog';
import { Modal } from './components/Modal';
import { StatBars } from './components/StatBars';
import { TopBar } from './components/TopBar';
import { CharacterPanel } from './panels/CharacterPanel';
import { CraftPanel } from './panels/CraftPanel';
import { ExplorePanel } from './panels/ExplorePanel';
import { FightPanel } from './panels/FightPanel';
import { InventoryPanel } from './panels/InventoryPanel';
import { JournalPanel } from './panels/JournalPanel';
import { DeathScreen } from './screens/DeathScreen';
import { useDayPeriodTheme } from './theme';
import { useGame } from './useGame';
import { useMediaQuery } from './useMediaQuery';

type TabId = 'explore' | 'bag' | 'body' | 'craft' | 'journal';

const TABS: { id: TabId; label: string; icon: IconName }[] = [
  { id: 'explore', label: 'Explore', icon: 'compass' },
  { id: 'bag', label: 'Bag', icon: 'knapsack' },
  { id: 'body', label: 'Body', icon: 'heart-beats' },
  { id: 'craft', label: 'Craft', icon: 'hammer-nails' },
  { id: 'journal', label: 'Journal', icon: 'tied-scroll' },
];

interface GameScreenProps {
  initialState: GameState;
  onNewGame(): void;
}

function needsTreatment(state: GameState): boolean {
  return BODY_PART_IDS.some((part) => state.player.body[part].some((c) => !BODY_CONDITIONS[c.id].treated && c.id !== 'missing'));
}

/** One key per condition on the body or its parts, to notice conditions the player has not looked at yet. */
function conditionKeys(state: GameState, sheet: CharacterSheet): string[] {
  const parts = BODY_PART_IDS.flatMap((part) => state.player.body[part].map((c) => `${part}:${c.id}`));
  return [...parts, ...sheet.conditions.map((c) => `player:${c.id}`)];
}

/** Popup titles of alerts by their tone: bad alerts are items falling apart. */
const ALERT_TITLES: Partial<Record<LogTone, string>> = { bad: 'Worn out' };

/** The title for alerts shown together; alerts of different tones get a neutral one. */
function alertTitle(entries: readonly LogEntry[]): string {
  const tones = new Set(entries.map((entry) => entry.tone));
  const [tone] = tones;
  return (tones.size === 1 && tone && ALERT_TITLES[tone]) || 'Notice';
}

/** Log entries marked as alerts that arrived since the game screen opened, until the player closes the popup. */
function useLogAlerts(state: GameState): { entries: LogEntry[]; dismiss(): void } {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const seenLogId = useRef(state.log.at(-1)?.id ?? 0);
  useEffect(() => {
    const fresh = state.log.filter((entry) => entry.alert && entry.id > seenLogId.current);
    seenLogId.current = state.log.at(-1)?.id ?? seenLogId.current;
    if (fresh.length > 0) {
      setEntries((current) => [...current, ...fresh]);
    }
  }, [state.log]);
  return { entries, dismiss: () => setEntries([]) };
}

/** Recipes the player can make right now but has never made. */
export function newCraftableRecipes(state: GameState, actions: readonly ActionView[]): string[] {
  return actions
    .filter((a) => a.action.category === 'craft' && !a.blocked && !state.player.craftedRecipes.includes(a.action.targetId ?? ''))
    .map((a) => a.action.targetId ?? '');
}

export function GameScreen({ initialState, onNewGame }: GameScreenProps) {
  const { state, freshAfterLogId, saveFailed, perform } = useGame(initialState);
  const wide = useMediaQuery('(min-width: 900px)');
  const [tab, setTab] = useState<TabId>('explore');
  const [menuOpen, setMenuOpen] = useState(false);

  const sheet = useMemo(() => getCharacterSheet(state), [state]);
  const shown = shownHealth(sheet);
  const actions = useMemo<ActionView[]>(() => getActions(state).map((action) => toActionView(state, action)), [state]);
  useDayPeriodTheme(state.time, state.environment.weather);
  const alerts = useLogAlerts(state);
  const fighting = state.fight !== undefined;
  useEffect(() => {
    // why: a fight replaces the Explore panel, so a phone switches to it when a fight starts.
    if (fighting) {
      setTab('explore');
    }
  }, [fighting]);

  const tabs = wide ? TABS.filter((t) => t.id !== 'explore') : TABS;
  const activeTab = wide && tab === 'explore' ? 'bag' : tab;
  const currentConditions = useMemo(() => conditionKeys(state, sheet), [state, sheet]);
  const [seenConditions, setSeenConditions] = useState(() => new Set(currentConditions));
  const bodyOpen = activeTab === 'body';
  useEffect(() => {
    // why: viewing the Body tab marks every condition as seen; healed ones are forgotten so they count as new if they return.
    setSeenConditions((seen) => new Set(bodyOpen ? currentConditions : currentConditions.filter((key) => seen.has(key))));
  }, [bodyOpen, currentConditions]);
  const newCondition = currentConditions.some((key) => !seenConditions.has(key));
  const tabAlerts: Partial<Record<TabId, string>> = {
    body: needsTreatment(state) ? 'Wounds need treatment' : undefined,
    craft: newCraftableRecipes(state, actions).length > 0 ? 'You can craft something new' : undefined,
  };

  // why: changing weapons in a fight costs a turn; on a phone the fight panel then shows what the enemy did with it.
  const performInBag = (actionId: string) => {
    perform(actionId);
    if (fighting && !wide) {
      setTab('explore');
    }
  };

  const panel = (id: TabId) => {
    switch (id) {
      case 'explore':
        return state.fight ? (
          <FightPanel
            state={state}
            fight={state.fight}
            sheet={sheet}
            actions={actions}
            freshAfterLogId={freshAfterLogId}
            onPerform={perform}
          />
        ) : (
          <ExplorePanel state={state} actions={actions} freshAfterLogId={freshAfterLogId} onPerform={perform} />
        );
      case 'bag':
        return <InventoryPanel state={state} sheet={sheet} actions={actions} onPerform={performInBag} />;
      case 'body':
        return <CharacterPanel state={state} sheet={sheet} actions={actions} onPerform={perform} />;
      case 'craft':
        return <CraftPanel state={state} actions={actions} onPerform={perform} />;
      case 'journal':
        return <JournalPanel state={state} />;
    }
  };

  const tabBar = (
    <nav className={wide ? 'tabs tabs--top' : 'tabs tabs--bottom'} aria-label="Game panels">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          className={`tab${activeTab === t.id ? ' tab--active' : ''}`}
          aria-current={activeTab === t.id ? 'page' : undefined}
          onClick={() => setTab(t.id)}
        >
          <span className="tab__icon" aria-hidden="true">
            <Icon name={t.icon} size={wide ? 18 : 24} />
          </span>
          <span className="tab__label">{t.label}</span>
          {t.id === 'body' && newCondition && (
            <span className="tab__new" role="status" aria-label="New condition" title="New condition">
              !
            </span>
          )}
          {tabAlerts[t.id] && (
            <span className={`tab__alert tab__alert--${t.id}`} role="status" aria-label={tabAlerts[t.id]} title={tabAlerts[t.id]} />
          )}
        </button>
      ))}
    </nav>
  );

  return (
    <div className={`game${wide ? ' game--wide' : ''}`}>
      <header className="game__header">
        <TopBar state={state} onMenu={() => setMenuOpen(true)} />
        <EnvironmentBar state={state} />
        <StatBars stats={{ health: shown.health, ...state.player.stats }} max={{ ...sheet.max, health: shown.max }} />
        {saveFailed && <p className="save-warning">Could not save the game. Progress may be lost if you close the page.</p>}
      </header>
      {wide ? (
        <main className="game__columns">
          <section className="game__column">{panel('explore')}</section>
          <section className="game__column">
            {tabBar}
            {panel(activeTab)}
          </section>
        </main>
      ) : (
        <>
          <main className="game__main">{panel(activeTab)}</main>
          {tabBar}
        </>
      )}
      {state.status === 'dead' && <DeathScreen state={state} onNewGame={onNewGame} />}
      {menuOpen && <MenuDialog onClose={() => setMenuOpen(false)} onNewGame={onNewGame} />}
      {alerts.entries.length > 0 && state.status === 'alive' && (
        <Modal title={alertTitle(alerts.entries)} onClose={alerts.dismiss}>
          {alerts.entries.map((entry) => (
            <p key={entry.id}>{entry.text}</p>
          ))}
          <div className="button-row">
            <button type="button" className="button button--primary" onClick={alerts.dismiss}>
              OK
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
