import { useState, useEffect, useMemo } from 'react';
import { subscribeToDays, setDayStatus } from './firebase';
import type { DayStatus } from './firebase';
import './Calendar.css';

export type { DayStatus };

function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function getPastYearDates(): Date[] {
  const dates: Date[] = [];
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  const start = new Date(end);
  start.setDate(start.getDate() - 364);
  start.setHours(0, 0, 0, 0);
  for (let t = start.getTime(); t <= end.getTime(); t += 86400000) {
    dates.push(new Date(t));
  }
  return dates;
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

  const pastYearDates = useMemo(getPastYearDates, []);

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
        <div className="counter" aria-live="polite">
          <span className="counter-value">{daysInJapan}</span>
          <span className="counter-label">days in Japan</span>
          <span className="counter-of">out of the past {totalDays} days</span>
        </div>
        <p className="calendar-hint">Click a day to toggle: in Japan or not</p>
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
              return cells.map((d, i) => {
                if (!d) {
                  return <div key={`pad-${i}`} className="day-cell pad" />;
                }
                const key = dateKey(d);
                const inJapan = key in days;
                return (
                  <button
                    key={key}
                    type="button"
                    className={`day-cell day ${inJapan ? 'japan' : ''}`}
                    onClick={() => toggleDay(key)}
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
