import { useMemo, useState } from 'react';
import { getActions } from '../engine/actions';
import { getCharacterSheet } from '../engine/character';
import { BODY_CONDITIONS } from '../engine/conditions';
import type { GameState } from '../engine/types';
import { BODY_PART_IDS } from '../engine/types';
import { type ActionView, toActionView } from './actionView';
import { MenuDialog } from './components/MenuDialog';
import { StatBars } from './components/StatBars';
import { TopBar } from './components/TopBar';
import { CharacterPanel } from './panels/CharacterPanel';
import { CraftPanel } from './panels/CraftPanel';
import { ExplorePanel } from './panels/ExplorePanel';
import { InventoryPanel } from './panels/InventoryPanel';
import { JournalPanel } from './panels/JournalPanel';
import { DeathScreen } from './screens/DeathScreen';
import { useDayPeriodTheme } from './theme';
import { useGame } from './useGame';
import { useMediaQuery } from './useMediaQuery';

type TabId = 'explore' | 'bag' | 'body' | 'craft' | 'journal';

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: 'explore', label: 'Explore', icon: '🧭' },
  { id: 'bag', label: 'Bag', icon: '🎒' },
  { id: 'body', label: 'Body', icon: '❤️' },
  { id: 'craft', label: 'Craft', icon: '🔨' },
  { id: 'journal', label: 'Journal', icon: '📜' },
];

interface GameScreenProps {
  initialState: GameState;
  onNewGame(): void;
}

function needsTreatment(state: GameState): boolean {
  return BODY_PART_IDS.some((part) => state.player.body[part].some((c) => !BODY_CONDITIONS[c.id].treated && c.id !== 'missing'));
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
  const actions = useMemo<ActionView[]>(() => getActions(state).map((action) => toActionView(state, action)), [state]);
  useDayPeriodTheme(state.time);

  const tabs = wide ? TABS.filter((t) => t.id !== 'explore') : TABS;
  const activeTab = wide && tab === 'explore' ? 'bag' : tab;
  const alerts: Partial<Record<TabId, string>> = {
    body: needsTreatment(state) ? 'Wounds need treatment' : undefined,
    craft: newCraftableRecipes(state, actions).length > 0 ? 'You can craft something new' : undefined,
  };

  const panel = (id: TabId) => {
    switch (id) {
      case 'explore':
        return <ExplorePanel state={state} actions={actions} freshAfterLogId={freshAfterLogId} onPerform={perform} />;
      case 'bag':
        return <InventoryPanel state={state} sheet={sheet} actions={actions} onPerform={perform} />;
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
            {t.icon}
          </span>
          <span className="tab__label">{t.label}</span>
          {alerts[t.id] && (
            <span className={`tab__alert tab__alert--${t.id}`} role="status" aria-label={alerts[t.id]} title={alerts[t.id]} />
          )}
        </button>
      ))}
    </nav>
  );

  return (
    <div className={`game${wide ? ' game--wide' : ''}`}>
      <header className="game__header">
        <TopBar state={state} onMenu={() => setMenuOpen(true)} />
        <StatBars stats={state.player.stats} max={sheet.max} />
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
    </div>
  );
}
