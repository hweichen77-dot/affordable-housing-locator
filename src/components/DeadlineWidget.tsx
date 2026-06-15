import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { DisplayProperty } from "../types/housing";

interface DeadlineWidgetProps {
  properties: DisplayProperty[];
  deadlines: Record<string, number>;
  onSelect: (p: DisplayProperty) => void;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function daysUntil(ms: number): number {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const target = new Date(ms);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - start.getTime()) / DAY_MS);
}

export function DeadlineWidget({ properties, deadlines, onSelect }: DeadlineWidgetProps) {
  const { t } = useTranslation();

  const upcoming = useMemo(() => {
    return properties
      .filter(p => {
        const d = deadlines[p.id];
        if (d == null) return false;
        const days = daysUntil(d);
        return days >= 0 && days <= 14;
      })
      .map(p => ({ p, ms: deadlines[p.id], days: daysUntil(deadlines[p.id]) }))
      .sort((a, b) => a.ms - b.ms);
  }, [properties, deadlines]);

  if (upcoming.length === 0) return null;

  return (
    <div className="deadline-widget" aria-label={t("deadline.widgetTitle")}>
      <div className="deadline-widget-title">{t("deadline.widgetTitle")}</div>
      <ul className="deadline-widget-list">
        {upcoming.map(({ p, ms, days }) => {
          const urgency = days <= 7 ? "deadline-urgent" : "deadline-soon";
          const dateStr = new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });
          const daysLabel = days === 0 ? "today" : days === 1 ? "1 day" : `${days} days`;
          return (
            <li key={p.id}>
              <button
                className={`deadline-widget-item ${urgency}`}
                onClick={() => onSelect(p)}
                type="button"
                title={p.name}
              >
                <span className="deadline-widget-name">{p.name}</span>
                <span className="deadline-widget-date">{dateStr} · {daysLabel}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
