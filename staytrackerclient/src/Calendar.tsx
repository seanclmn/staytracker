import { useState, useEffect, useMemo, useRef } from 'react';
import { subscribeToDays, setDayStatus } from './firebase';
import type { DayStatus } from './firebase';
import './Calendar.css';

export type { DayStatus };

function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function getPastYearDates(countBackFrom: Date): Date[] {
  const dates: Date[] = [];
  const end = new Date(countBackFrom);
  end.setHours(23, 59, 59, 999);
  const start = new Date(end);
  start.setDate(start.getDate() - 364);
  start.setHours(0, 0, 0, 0);
  for (let t = start.getTime(); t <= end.getTime(); t += 86400000) {
    dates.push(new Date(t));
  }
  return dates;
}

function toDateInputValue(d: Date): string {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function dateKeysBetween(a: string, b: string): string[] {
  const [start, end] = [a, b].sort();
  const keys: string[] = [];
  const d = new Date(start + 'Z');
  const endDate = new Date(end + 'Z');
  while (d <= endDate) {
    keys.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return keys;
}

export function Calendar() {
  const [days, setDays] = useState<Record<string, 'japan'>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsub = subscribeToDays(
      (data) => {
        setDays(data);
        setLoading(false);
      },
      (err) => {
        setError(err.message);
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  // Date from which we count back 365 days (default: today)
  const [countBackFrom, setCountBackFrom] = useState(() => new Date());

  const pastYearDates = useMemo(
    () => getPastYearDates(countBackFrom),
    [countBackFrom]
  );

  const daysInJapan = useMemo(() => {
    return pastYearDates.filter((d) => days[dateKey(d)] === 'japan').length;
  }, [pastYearDates, days]);

  const totalDays = pastYearDates.length;

  const toggleDay = async (key: string) => {
    const isJapan = key in days;
    const next = isJapan ? null : 'japan';
    setDays((prev) => {
      const nextState = { ...prev };
      if (next === null) delete nextState[key];
      else nextState[key] = next;
      return nextState;
    });
    try {
      await setDayStatus(key, next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
      setDays((prev) => ({ ...prev, ...(isJapan ? { [key]: 'japan' as const } : {}) }));
    }
  };

  const setRangeToJapan = async (keys: string[]) => {
    const nextState = { ...days };
    for (const k of keys) nextState[k] = 'japan';
    setDays(nextState);
    try {
      await Promise.all(keys.map((k) => setDayStatus(k, 'japan')));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
      setDays(days);
    }
  };

  const clearRange = async (keys: string[]) => {
    const nextState = { ...days };
    for (const k of keys) delete nextState[k];
    setDays(nextState);
    try {
      await Promise.all(keys.map((k) => setDayStatus(k, null)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
      setDays(days);
    }
  };

  // Drag to select or clear consecutive days. Start on "in Japan" = clear range; start on "not in Japan" = fill range.
  type DragState = { start: string; end: string; mode: 'fill' | 'clear' };
  const [dragRange, setDragRange] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);

  const handleDragStart = (key: string) => {
    const mode = key in days ? 'clear' : 'fill';
    dragRef.current = { start: key, end: key, mode };
    setDragRange({ start: key, end: key, mode });
  };

  const handleDragEnter = (key: string) => {
    if (dragRef.current) {
      dragRef.current = { ...dragRef.current, end: key };
      setDragRange({ ...dragRef.current, end: key });
    }
  };

  useEffect(() => {
    if (dragRange === null) return;
    const onMouseUp = () => {
      const current = dragRef.current;
      dragRef.current = null;
      setDragRange(null);
      if (!current) return;
      const keys = dateKeysBetween(current.start, current.end);
      if (keys.length === 1) {
        toggleDay(keys[0]);
      } else if (current.mode === 'fill') {
        setRangeToJapan(keys);
      } else {
        clearRange(keys);
      }
    };
    document.addEventListener('mouseup', onMouseUp);
    return () => document.removeEventListener('mouseup', onMouseUp);
  }, [dragRange]);

  // Current month being viewed (first day of that month)
  const [viewDate, setViewDate] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  const goPrev = () => {
    setViewDate((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  };
  const goNext = () => {
    setViewDate((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1));
  };

  // Dates for the currently visible month (full month grid)
  const currentMonthDates = useMemo(() => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const first = new Date(year, month, 1);
    const last = new Date(year, month + 1, 0);
    const dates: Date[] = [];
    for (let t = first.getTime(); t <= last.getTime(); t += 86400000) {
      dates.push(new Date(t));
    }
    return dates;
  }, [viewDate]);

  const monthTitle = viewDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  if (loading) {
    return (
      <div className="calendar-wrap">
        <p className="calendar-loading">Loading…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="calendar-wrap">
        <div className="calendar-header">
          <h1>Stay Tracker</h1>
          <p className="calendar-error">
            {error}
            <br />
            Check your Firebase config (e.g. <code>.env</code> and Firestore rules).
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="calendar-wrap">
      <header className="calendar-header">
        <h1>Stay Tracker</h1>
        <div className="count-from-row">
          <label htmlFor="count-from" className="count-from-label">
            Count back from
          </label>
          <input
            id="count-from"
            type="date"
            className="count-from-input"
            value={toDateInputValue(countBackFrom)}
            onChange={(e) => {
              const v = e.target.value;
              if (v) setCountBackFrom(new Date(v + 'T12:00:00'));
            }}
          />
        </div>
        <div className="counter" aria-live="polite">
          <span className="counter-value">{daysInJapan}</span>
          <span className="counter-label">days in Japan</span>
          <span className="counter-of">out of the past {totalDays} days</span>
        </div>
        <p className="calendar-hint">Click to toggle. Drag from an empty day to mark a range; drag from a filled day to clear a range.</p>
      </header>

      <div className="calendar-month-wrap">
        <div className="calendar-nav">
          <button
            type="button"
            className="calendar-nav-btn"
            onClick={goPrev}
            aria-label="Previous month"
          >
            ←
          </button>
          <h2 className="calendar-month-title">{monthTitle}</h2>
          <button
            type="button"
            className="calendar-nav-btn"
            onClick={goNext}
            aria-label="Next month"
          >
            →
          </button>
        </div>
        <div className="month-block">
          <div className="month-weekdays">
            {weekDays.map((d) => (
              <span key={d} className="weekday">
                {d}
              </span>
            ))}
          </div>
          <div className="month-days" style={{ gridTemplateColumns: 'repeat(7, 1fr)' }}>
            {(() => {
              const first = currentMonthDates[0];
              const startDow = first.getDay();
              const padding = Array(startDow).fill(null);
              const cells = [...padding, ...currentMonthDates];
              const rangeKeys = dragRange
                ? new Set(dateKeysBetween(dragRange.start, dragRange.end))
                : null;
              const rangeMode = dragRange?.mode ?? 'fill';

              return cells.map((d, i) => {
                if (!d) {
                  return <div key={`pad-${i}`} className="day-cell pad" />;
                }
                const key = dateKey(d);
                const inJapan = key in days;
                const inRangePreview = rangeKeys?.has(key) ?? false;
                const rangeClass = inRangePreview
                  ? rangeMode === 'clear'
                    ? 'day-cell--range-clear'
                    : 'day-cell--range'
                  : '';
                return (
                  <button
                    key={key}
                    type="button"
                    className={`day-cell day ${inJapan ? 'japan' : ''} ${rangeClass}`}
                    onMouseDown={() => handleDragStart(key)}
                    onMouseEnter={() => handleDragEnter(key)}
                    title={inJapan ? `${key} – in Japan` : `${key} – not in Japan`}
                    aria-label={`${d.toLocaleDateString()}${inJapan ? ', in Japan' : ', not in Japan'}`}
                    aria-pressed={inJapan}
                  >
                    <span className="day-num">{d.getDate()}</span>
                    {inJapan && <span className="day-dot" data-status="japan" />}
                  </button>
                );
              });
            })()}
          </div>
        </div>
      </div>
    </div>
  );
}
