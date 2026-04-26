import type { ExportProgressEvent } from '../../../shared/types';

interface ExportQueueProps {
  events: ExportProgressEvent[];
}

export function ExportQueue({ events }: ExportQueueProps) {
  return (
    <div className="export-queue">
      {events.length === 0 ? (
        <div className="empty-note">No export jobs yet</div>
      ) : (
        events.map((event) => (
          <div className={`queue-item ${event.status}`} key={`${event.id}-${event.aspect}`}>
            <div>
              <strong>{event.aspect}</strong>
              <span>{event.message}</span>
            </div>
            <small>{event.percent}%</small>
            <div className="queue-progress">
              <span style={{ width: `${event.percent}%` }} />
            </div>
          </div>
        ))
      )}
    </div>
  );
}
