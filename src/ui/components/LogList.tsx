import { formatDateTime } from '../../engine/time';
import type { LogEntry } from '../../engine/types';

interface LogListProps {
  entries: readonly LogEntry[];
  showTime?: boolean;
}

export function LogList({ entries, showTime }: LogListProps) {
  return (
    <ul className="log">
      {entries.map((entry) => (
        <li key={entry.id} className={`log__entry log__entry--${entry.tone}`}>
          {showTime && <span className="log__time">{formatDateTime(entry.time)}</span>}
          <span>{entry.text}</span>
        </li>
      ))}
    </ul>
  );
}
