import React, { useState, useMemo, useEffect } from 'react';

const VIEWS = ['Giorno', 'Settimana', 'Mese', 'Anno'];
const DAYS_SOI = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];
const MONTH_NAMES = [
  'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
  'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'
];

export default function CalendarView({ customers, onClose, onSelectCustomer, initialView, initialFilter, onSettingsChange }) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState(initialView || 'Mese');
  const [filter, setFilter] = useState(initialFilter || 'all'); 
  const [isClosing, setIsClosing] = useState(false);
  
  // Auto-persist settings when they change
  useEffect(() => {
    if (onSettingsChange) {
      onSettingsChange({ calendarView: view, calendarFilter: filter });
    }
  }, [view, filter, onSettingsChange]);

  // Close handler with animation
  const handleClose = () => {
    setIsClosing(true);
    setTimeout(onClose, 250);
  };

  // 1. Process Customer Data (Tasks & Installments)
  const customerEvents = useMemo(() => {
    const list = [];
    customers.forEach(c => {
      // Tasks
      (c.todo || []).forEach(t => {
        if (!t.dueDate) return;
        list.push({
          id: t.id,
          date: new Date(t.dueDate),
          title: t.text,
          type: 'todo',
          completed: t.completed,
          client: c,
          fullText: `[TASK] ${c.name}: ${t.text}`
        });
      });
      // Installments
      (c.installments || []).forEach(inst => {
        if (!inst.dueDate) return;
        list.push({
          id: inst.id || Math.random(),
          date: new Date(inst.dueDate),
          title: `€${inst.amount}`,
          type: 'payment',
          paid: inst.paid,
          client: c,
          fullText: `[RATA] ${c.name}: €${inst.amount} (${inst.paid ? 'Pagata' : 'Scaduta'})`
        });
      });
    });
    return list;
  }, [customers]);

  // 2. Process Global Events - DISABLED
  const processedGlobalEvents = useMemo(() => {
    return [];
  }, []);

  // 3. Combine All
  const allEvents = useMemo(() => {
    let combined = [...customerEvents, ...processedGlobalEvents];
    if (filter === 'payment') combined = combined.filter(e => e.type === 'payment');
    if (filter === 'todo') combined = combined.filter(e => e.type === 'todo');
    return combined;
  }, [customerEvents, processedGlobalEvents, filter]);

  
  // Navigation Logic
  const changeDate = (offset) => {
    const next = new Date(currentDate);
    if (view === 'Mese') next.setMonth(next.getMonth() + offset);
    else if (view === 'Settimana') next.setDate(next.getDate() + (offset * 7));
    else if (view === 'Giorno') next.setDate(next.getDate() + offset);
    else if (view === 'Anno') next.setFullYear(next.getFullYear() + offset);
    setCurrentDate(next);
  };

  return (
    <div className={`calendar-overlay ${isClosing ? 'overlay-closing' : ''}`} onClick={(e) => {
      if (e.target === e.currentTarget) handleClose();
    }}>
      <div className={`calendar-fullscreen-modal ${isClosing ? 'modal-closing' : 'animate-scale-in'}`}>
        
        <header className="calendar-modal-header">
          <div className="modal-header-left">
            <button className="back-btn" onClick={handleClose}>✕</button>
            <h2 className="modal-title">
              {view === 'Anno' ? currentDate.getFullYear() : 
               view === 'Mese' ? `${MONTH_NAMES[currentDate.getMonth()]} ${currentDate.getFullYear()}` :
               view === 'Settimana' ? `Settimana ${getWeekNumber(currentDate)}` :
               currentDate.toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })}
            </h2>
          </div>

          <div className="modal-header-center">
            <div className="nav-group">
              <button className="nav-btn" onClick={() => changeDate(-1)}>◀</button>
              <button className="nav-btn today" onClick={() => setCurrentDate(new Date())}>Oggi</button>
              <button className="nav-btn" onClick={() => changeDate(1)}>▶</button>
            </div>
            <div className="view-tabs">
              {VIEWS.map(v => (
                <button key={v} className={`view-tab ${view === v ? 'active' : ''}`} onClick={() => setView(v)}>
                  {v}
                </button>
              ))}
            </div>
          </div>

          <div className="modal-header-right">
            <div className="filter-chips">
              <div className={`chip ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>Tutto</div>
              <div className={`chip ${filter === 'payment' ? 'active' : ''}`} onClick={() => setFilter('payment')}>Rate</div>
              <div className={`chip ${filter === 'todo' ? 'active' : ''}`} onClick={() => setFilter('todo')}>Task</div>
            </div>
          </div>
        </header>

        <main className="calendar-modal-body">
          {view === 'Mese' && <MonthView date={currentDate} events={allEvents} onOpenClient={(customer) => {
    onSelectCustomer(customer);
    setTimeout(() => {
      const event = new CustomEvent('setActiveTab', { detail: 'finance' });
      window.dispatchEvent(event);
    }, 200);
  }} />}
          {view === 'Settimana' && <WeekView date={currentDate} events={allEvents} onOpenClient={(customer) => {
    onSelectCustomer(customer);
    setTimeout(() => {
      const event = new CustomEvent('setActiveTab', { detail: 'finance' });
      window.dispatchEvent(event);
    }, 200);
  }} />}
          {view === 'Giorno' && <DayView date={currentDate} events={allEvents} onOpenClient={(customer) => {
    onSelectCustomer(customer);
    setTimeout(() => {
      const event = new CustomEvent('setActiveTab', { detail: 'finance' });
      window.dispatchEvent(event);
    }, 200);
  }} />}
          {view === 'Anno' && <YearView date={currentDate} events={allEvents} onSelectMonth={(d) => { setView('Mese'); setCurrentDate(d); }} />}
        
                  </main>
      </div>

      <style>{`
        .calendar-overlay {
          position: fixed; top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(15, 15, 25, 0.45); backdrop-filter: blur(25px);
          z-index: 6000; display: flex; align-items: center; justify-content: center; padding: 25px;
        }
        .calendar-fullscreen-modal {
          background: var(--bg); width: min(100vw, 1550px); height: 92vh;
          border-radius: 35px; display: flex; flex-direction: column; overflow: hidden;
          box-shadow: 0 40px 150px rgba(0,0,0,0.6); border: 1px solid rgba(255,255,255,0.08);
          animation: modalScaleIn 0.4s var(--ease-out) both;
        }

        /* HEADER RESTORED TO INITIAL STYLE */
        .calendar-modal-header {
          padding: 25px 40px; display: flex; align-items: center; justify-content: space-between;
          background: rgba(255,255,255,0.01); border-bottom: 1px solid var(--border-light);
        }
        .modal-header-left { display: flex; align-items: center; gap: 24px; min-width: 300px; }
        .back-btn { border: none; background: var(--bg-hover); color: var(--text-primary); width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: 0.2s; }
        .back-btn:hover { background: var(--danger-bg); color: var(--danger); transform: rotate(90deg); }
        .modal-title { margin: 0; font-size: 1.6rem; font-weight: 800; letter-spacing: -1px; }

        .modal-header-center { display: flex; align-items: center; gap: 20px; }
        .nav-group { display: flex; background: var(--bg-hover); padding: 4px; border-radius: 12px; }
        .nav-btn { border: none; background: transparent; padding: 6px 12px; border-radius: 8px; cursor: pointer; transition: 0.2s; }
        .nav-btn:hover { background: var(--bg-card); }
        .nav-btn.today { background: var(--bg-card); color: var(--primary); font-weight: 700; height: 30px; margin: 0 4px; }
        
        .view-tabs { display: flex; background: var(--bg-hover); padding: 4px; border-radius: 12px; }
        .view-tab { border: none; background: transparent; padding: 6px 16px; border-radius: 8px; font-size: 0.8rem; font-weight: 700; color: var(--text-tertiary); cursor: pointer; transition: 0.2s; }
        .view-tab.active { background: var(--bg-card); color: var(--primary); box-shadow: var(--shadow-sm); }

        .modal-header-right { display: flex; justify-content: flex-end; min-width: 300px; }
        .filter-chips { display: flex; gap: 8px; }
        .chip { border: 1px solid var(--border-light); background: var(--bg-hover); padding: 6px 14px; border-radius: 10px; font-size: 0.75rem; font-weight: 700; cursor: pointer; transition: 0.2s; }
        .chip.active { background: var(--primary); color: white; border-color: var(--primary); }

        .calendar-modal-body { flex: 1; padding: 30px; overflow: hidden; display: flex; flex-direction: column; }

        /* ANIMATIONS */
        @keyframes modalScaleIn { from { opacity: 0; transform: scale(0.97) translateY(20px); } to { opacity: 1; transform: scale(1) translateY(0); } }
        .overlay-closing { animation: fadeOut 0.2s var(--ease-in) both; }
        .modal-closing { animation: fadeOut 0.2s var(--ease-in) both; }

        .event-creation-overlay {
          position: fixed; inset: 0; background: rgba(0,0,0,0.4); backdrop-filter: blur(8px);
          display: flex; align-items: center; justify-content: center; z-index: 1000;
        }
        .event-card {
          background: var(--bg-card); padding: 35px; border-radius: 30px; border: 1px solid var(--border-light);
          width: 400px; display: flex; flex-direction: column; gap: 20px; box-shadow: 0 30px 60px rgba(0,0,0,0.5);
        }
        .event-card h3 { margin: 0; font-size: 1.4rem; letter-spacing: -0.5px; }
        .event-card input {
          background: var(--bg-hover); border: 1px solid var(--border-light); padding: 12px 18px;
          border-radius: 14px; color: var(--text-primary); outline: none; transition: 0.2s;
        }
        .event-card input:focus { border-color: var(--primary); }
        .event-actions { display: flex; justify-content: flex-end; gap: 12px; margin-top: 10px; }

        .event-strip.global-event { border-color: #a29bfe; background: rgba(162, 155, 254, 0.1); }
        .w-event.global-event { border-color: #a29bfe; }
        .day-entry.global-event { border-color: #a29bfe; background: rgba(162, 155, 254, 0.05); }
      `}</style>
    </div>
  );
}

function MonthView({ date, events, onOpenClient }) {
  const years = date.getFullYear();
  const months = date.getMonth();
  const firstDay = new Date(years, months, 1).getDay();
  const offset = firstDay === 0 ? 6 : firstDay - 1;
  const daysInMonth = new Date(years, months + 1, 0).getDate();
  const prevMonthDays = new Date(years, months, 0).getDate();

  const cells = [];
  for (let i = offset - 1; i >= 0; i--) cells.push({ day: prevMonthDays - i, current: false });
  for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d, current: true, date: new Date(years, months, d) });
  const totalCells = Math.ceil(cells.length / 7) * 7;
  const nextDays = totalCells - cells.length;
  for (let i = 1; i <= nextDays; i++) cells.push({ day: i, current: false });

  return (
    <div className="grid-layout-root">
      <div className="grid-header-labels">
        {DAYS_SOI.map(d => <div key={d} className="label-text">{d}</div>)}
      </div>
      <div className="grid-scroll-body">
        {cells.map((cell, idx) => {
          const dayEvents = cell.current ? events.filter(e => isSameDay(e.date, cell.date)) : [];
          const isToday = cell.current && isSameDay(cell.date, new Date());
          return (
            <div key={idx} className={`grid-cell ${cell.current ? '' : 'faded'} ${isToday ? 'current-day' : ''}`}>
              <div className="cell-num">{cell.day}</div>
              <div className="cell-events">
                {dayEvents.map(e => (
                  <div 
                    key={e.id} 
                    className={`event-strip ${e.type} ${e.status || ''} ${e.completed ? 'done' : ''}`}
                    onClick={(ev) => {
                      ev.stopPropagation();
                      if (e.client) {
                        onOpenClient(e.client);
                        setTimeout(() => {
                          const event = new CustomEvent('setActiveTab', { 
                            detail: e.type === 'todo' ? 'todo' : 'finance' 
                          });
                          window.dispatchEvent(event);
                        }, 200);
                      }
                    }}
                    title={e.fullText}
                  >
                    {e.title}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <style>{`
        .grid-layout-root { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
        .grid-header-labels { display: grid; grid-template-columns: repeat(7, 1fr); gap: 10px; margin-bottom: 15px; }
        .label-text { text-align: center; font-size: 0.75rem; font-weight: 800; color: var(--text-tertiary); text-transform: uppercase; letter-spacing: 2px; }
        .grid-scroll-body { display: grid; grid-template-columns: repeat(7, 1fr); grid-auto-rows: minmax(100px, 1fr); gap: 10px; flex: 1; overflow-y: auto; padding-right: 10px; }
        
        .grid-cell { background: var(--bg-card); border-radius: 20px; padding: 10px; border: 1px solid var(--border-light); 
                     display: flex; flex-direction: column; transition: transform 0.2s; }
        .grid-cell.faded { opacity: 0.25; pointer-events: none; }
        .grid-cell.current-day { border-color: var(--primary); background: rgba(108, 92, 231, 0.05); }
        .grid-cell:not(.faded):hover { border-color: rgba(255,255,255,0.2); background: var(--bg-hover); }
        
        .cell-num { font-size: 0.85rem; font-weight: 800; color: var(--text-tertiary); margin-bottom: 6px; }
        .current-day .cell-num { color: var(--primary); }
        
        .cell-events { display: flex; flex-direction: column; gap: 3px; }
        .event-strip {
          padding: 4px 8px; border-radius: 8px; font-size: 0.65rem; font-weight: 700;
          cursor: pointer; white-space: normal; overflow: visible; text-overflow: initial;
          border-left: 3px solid transparent; background: var(--bg-app);
        }
        .event-strip.payment { border-color: var(--warning); background: var(--warning-bg); color: #E17055; }
        .event-strip.payment.paid { border-color: var(--success); background: var(--success-bg); color: var(--success); }
        .event-strip.payment.overdue { border-color: var(--danger); background: var(--danger-bg); color: var(--danger); }
        .event-strip.todo { border-color: var(--info); background: var(--info-bg); color: var(--info); }
        .event-strip.done { opacity: 0.4; text-decoration: line-through; }
      `}</style>
    </div>
  );
}

function WeekView({ date, events, onOpenClient }) {
  const start = new Date(date);
  const day = start.getDay();
  const diff = start.getDate() - day + (day === 0 ? -6 : 1);
  start.setDate(diff);

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });

  return (
    <div className="week-grid-compact">
      {days.map(d => {
        const dayEvents = events.filter(e => isSameDay(e.date, d));
        const isToday = isSameDay(d, new Date());
        return (
          <div key={d.toString()} className={`week-box ${isToday ? 'today' : ''}`}>
            <div className="week-head">
              <span className="w-label">{DAYS_SOI[d.getDay() === 0 ? 6 : d.getDay() - 1]}</span>
              <span className="w-date">{d.getDate()}</span>
            </div>
            <div className="week-list">
              {dayEvents.map(e => (
                <div key={e.id} className={`w-event ${e.type} ${e.status || ''} ${e.completed ? 'done' : ''}`} onClick={() => {
                  if (e.client) {
                    onOpenClient(e.client);
                    setTimeout(() => {
                      const event = new CustomEvent('setActiveTab', { 
                        detail: e.type === 'todo' ? 'todo' : 'finance' 
                      });
                      window.dispatchEvent(event);
                    }, 200);
                  }
                }}>
                  <div className="w-client">{e.client ? e.client.name : '📅 Evento globale'}</div>
                  <div className="w-title">{e.title}</div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
      <style>{`
        .week-grid-compact { display: grid; grid-template-columns: repeat(7, 1fr); gap: 15px; flex: 1; }
        .week-box { background: var(--bg-card); border-radius: 25px; border: 1px solid var(--border-light); display: flex; flex-direction: column; overflow: hidden; }
        .week-box.today { border-color: var(--primary); background: rgba(108, 92, 231, 0.04); }
        .week-head { padding: 20px; text-align: center; border-bottom: 1px solid var(--border-light); }
        .w-label { display: block; font-size: 0.7rem; font-weight: 800; color: var(--text-tertiary); text-transform: uppercase; margin-bottom: 2px; }
        .w-date { font-size: 1.5rem; font-weight: 900; }
        .today .w-date { color: var(--primary); }
        .week-list { flex: 1; padding: 12px; display: flex; flex-direction: column; gap: 8px; overflow-y: auto; }
        .w-event { padding: 12px; border-radius: 14px; border-left: 4px solid; cursor: pointer; transition: 0.2s; background: var(--bg-app); white-space: normal; overflow: visible; text-overflow: initial; }
        .w-event:hover { transform: scale(1.03); filter: brightness(1.1); }
        .w-event.payment { border-color: var(--warning); }
        .w-event.todo { border-color: var(--info); }
        .w-client { font-size: 0.6rem; font-weight: 800; color: var(--text-tertiary); text-transform: uppercase; margin-bottom: 3px; }
        .w-title { font-size: 0.8rem; font-weight: 700; color: var(--text-primary); white-space: normal; overflow: visible; text-overflow: initial; }
      `}</style>
    </div>
  );
}

function DayView({ date, events, onOpenClient }) {
  const dayEvents = events.filter(e => isSameDay(e.date, date));
  return (
    <div className="day-list-root">
      <div className="day-list-container">
        {dayEvents.length === 0 ? (
          <div className="day-agenda-empty">📭 Nessun impegno programmato per oggi.</div>
        ) : (
          dayEvents.map(e => (
            <div key={e.id} className={`day-entry ${e.type} ${e.status || ''}`} onClick={() => {
              if (e.client) {
                onOpenClient(e.client);
                setTimeout(() => {
                  const event = new CustomEvent('setActiveTab', { 
                    detail: e.type === 'todo' ? 'todo' : 'finance' 
                  });
                  window.dispatchEvent(event);
                }, 200);
              }
            }}>
              <div className="entry-icon">
                {e.type === 'payment' ? '💶' : e.type === 'todo' ? '☑️' : '🗓️'}
              </div>
              <div className="entry-body">
                {e.client && <span className="entry-client">{e.client.name}</span>}
                <span className="entry-title">{e.fullText || e.title}</span>
              </div>
              {e.client && <div className="entry-go">Vai al profilo →</div>}
            </div>
          ))
        )}
      </div>
      <style>{`
        .day-list-root { flex: 1; display: flex; justify-content: center; overflow-y: auto; }
        .day-list-container { width: min(100%, 750px); display: flex; flex-direction: column; gap: 15px; }
        .day-agenda-empty { text-align: center; padding: 80px 20px; font-size: 1.25rem; color: var(--text-tertiary); font-weight: 700; opacity: 0.6; }
        .day-entry {
          display: flex; align-items: center; gap: 24px; padding: 25px 35px;
          background: var(--bg-card); border-radius: 30px; border: 1px solid var(--border-light);
          cursor: pointer; transition: 0.3s; white-space: normal; overflow: visible; text-overflow: initial;
        }
        .day-entry:hover { transform: translateX(10px); border-color: var(--primary); }
        .entry-icon { font-size: 1.8rem; background: var(--bg-app); width: 60px; height: 60px; display: flex; align-items: center; justify-content: center; border-radius: 18px; }
        .entry-body { flex: 1; display: flex; flex-direction: column; gap: 2px; }
        .entry-client { font-size: 0.7rem; font-weight: 800; color: var(--primary); text-transform: uppercase; letter-spacing: 1.5px; }
        .entry-title { font-size: 1.2rem; font-weight: 700; color: var(--text-primary); white-space: normal; overflow: visible; text-overflow: initial; }
        .entry-go { font-size: 0.75rem; font-weight: 800; color: var(--text-tertiary); }
      `}</style>
    </div>
  );
}

function YearView({ date, events, onSelectMonth }) {
  const currentYear = date.getFullYear();
  const months = Array.from({ length: 12 }, (_, i) => i);
  return (
    <div className="year-summary-root">
      <div className="year-month-grid">
        {months.map(m => (
          <div key={m} className="month-card" onClick={() => onSelectMonth(new Date(currentYear, m, 1))}>
            <div className="month-card-title">{MONTH_NAMES[m]}</div>
            <div className="month-card-dots">
              {events.filter(e => e.date.getMonth() === m && e.date.getFullYear() === currentYear).slice(0, 15).map((e, i) => (
                <div key={i} className={`m-dot ${e.type}`} />
              ))}
            </div>
          </div>
        ))}
      </div>
      <style>{`
        .year-summary-root { flex: 1; overflow-y: auto; }
        .year-month-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 20px; }
        .month-card { background: var(--bg-card); padding: 25px; border-radius: 25px; border: 1px solid var(--border-light); cursor: pointer; transition: 0.25s; }
        .month-card:hover { transform: scale(1.05); background: var(--primary-ghost); border-color: var(--primary); }
        .month-card-title { font-size: 1.1rem; font-weight: 800; margin-bottom: 15px; }
        .month-card-dots { display: flex; flex-wrap: wrap; gap: 5px; }
        .m-dot { width: 6px; height: 6px; border-radius: 50%; opacity: 0.8; }
        .m-dot.payment { background: var(--warning); }
        .m-dot.todo { background: var(--info); }
        .m-dot.global-event { background: #a29bfe; }
      `}</style>
    </div>
  );
}

// Global Static Utils
function isSameDay(d1, d2) { return d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth() && d1.getDate() === d2.getDate(); }
function getWeekNumber(d) {
  const date = new Date(d.getTime());
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + 3 - (date.getDay() + 6) % 7);
  const week1 = new Date(date.getFullYear(), 0, 4);
  return 1 + Math.round(((date.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
}
