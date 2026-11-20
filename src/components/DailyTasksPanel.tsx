import { useEffect, useState } from 'react';
import { CheckCircle2, Circle, Clock, Plus, Sparkles, Trash2 } from 'lucide-react';
import { stripHashMarks } from '../utils/mediaExport';

export interface DailyTaskItem {
  id: string;
  title: string;
  category: string;
  priority: string;
  timeSlot: string;
  completed: boolean;
  createdAt: number;
}

const DAILY_TASKS_STORAGE_KEY = 'zorvyx_daily_tasks_v1';

const TASK_CATEGORIES = ['عمل', 'دراسة', 'منزل', 'صحة', 'شخصي'];
const TASK_PRIORITIES = ['عالية', 'متوسطة', 'عادية'];

function loadTasks(): DailyTaskItem[] {
  try {
    const raw = localStorage.getItem(DAILY_TASKS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

interface Props {
  geminiMode?: 'fast' | 'balanced' | 'pro';
}

export function DailyTasksPanel({ geminiMode = 'balanced' }: Props) {
  const [tasks, setTasks] = useState<DailyTaskItem[]>(loadTasks);
  const [filter, setFilter] = useState<'all' | 'pending' | 'done'>('all');
  const [newTitle, setNewTitle] = useState('');
  const [newCategory, setNewCategory] = useState('عمل');
  const [newPriority, setNewPriority] = useState('متوسطة');
  const [newTime, setNewTime] = useState('');

  const [aiInput, setAiInput] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');

  useEffect(() => {
    try {
      localStorage.setItem(DAILY_TASKS_STORAGE_KEY, JSON.stringify(tasks));
    } catch {
      // ignore storage quota errors
    }
  }, [tasks]);

  const completedCount = tasks.filter((t) => t.completed).length;
  const totalCount = tasks.length;
  const progressPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  const visibleTasks = tasks.filter((t) => {
    if (filter === 'pending') return !t.completed;
    if (filter === 'done') return t.completed;
    return true;
  });

  function addManualTask() {
    const clean = stripHashMarks(newTitle).trim();
    if (!clean) {
      setStatusMsg('اكتبي اسم المهمة اليومية أولاً.');
      return;
    }
    const item: DailyTaskItem = {
      id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title: clean,
      category: newCategory,
      priority: newPriority,
      timeSlot: newTime.trim(),
      completed: false,
      createdAt: Date.now(),
    };
    setTasks((prev) => [item, ...prev]);
    setNewTitle('');
    setNewTime('');
    setStatusMsg('');
  }

  function toggleTask(id: string) {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t)));
  }

  function deleteTask(id: string) {
    setTasks((prev) => prev.filter((t) => t.id !== id));
  }

  function clearCompleted() {
    setTasks((prev) => prev.filter((t) => !t.completed));
  }

  async function generateDailyPlanWithAI(overridePrompt?: string) {
    const text = (overridePrompt ?? aiInput).trim();
    if (!text) {
      setStatusMsg('اكتبي أهدافك أو أشغالك اليوم لأحوّلها لك إلى قائمة مهام يومية مرتبة.');
      return;
    }
    setAiLoading(true);
    setStatusMsg('جاري ترتيب مهامك اليومية وتحديد الأوقات والأولويات…');
    try {
      const r = await fetch('/api/tasks-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: text, geminiMode }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || 'تعذر ترتيب المهام.');
      if (data.rejected) {
        setStatusMsg(data.message || 'هذه الأيقونة مخصصة حصراً لترتيب المهام اليومية.');
        return;
      }
      const added: DailyTaskItem[] = (Array.isArray(data.tasks) ? data.tasks : []).map(
        (t: { title?: string; category?: string; priority?: string; timeSlot?: string }, idx: number) => ({
          id: `task-ai-${Date.now()}-${idx}`,
          title: stripHashMarks(t.title || 'مهمة يومية'),
          category: t.category || 'شخصي',
          priority: t.priority || 'متوسطة',
          timeSlot: t.timeSlot || '',
          completed: false,
          createdAt: Date.now() + idx,
        }),
      );
      if (added.length > 0) {
        setTasks((prev) => [...added, ...prev]);
        setAiInput('');
        setStatusMsg(`تمت إضافة ${added.length} مهام مرتبة (${data.planTitle || 'خطة اليوم'}).`);
      } else {
        setStatusMsg('لم يتم استخراج مهام واضحة؛ جرّبي كتابة تفاصيل أكثر عن يومك.');
      }
    } catch (e) {
      setStatusMsg(e instanceof Error ? e.message : 'حدث خطأ أثناء تنظيم المهام.');
    } finally {
      setAiLoading(false);
    }
  }

  return (
    <div className="tasks-panel-shell">
      <div className="tasks-progress-card">
        <div className="wb-row-between">
          <div>
            <strong style={{ fontSize: 15 }}>إنجاز اليوم</strong>
            <div className="tiny">
              أنجزت {completedCount} من أصل {totalCount} مهمة ({progressPct}%)
            </div>
          </div>
          {completedCount > 0 && (
            <button type="button" className="mini-btn danger" onClick={clearCompleted}>
              <Trash2 size={12} />
              حذف المنجز
            </button>
          )}
        </div>
        <div className="tasks-progress-track">
          <div className="tasks-progress-fill" style={{ width: `${progressPct}%` }} />
        </div>
      </div>

      <div className="char-sender-box">
        <div className="tiny" style={{ marginBottom: 8 }}>
          رتّبي مهام يومك تلقائياً بالذكاء الاصطناعي (تقبل طلبات المهام وجدول اليوم فقط):
        </div>
        <div className="history-chips" style={{ marginBottom: 10 }}>
          {[
            'عندي مذاكرة 3 ساعات، ترتيب الغرفة، وتحضير الغداء ومكالمة عمل',
            'رتّب لي مهام صباحية للنشاط والرياضة وإنجاز العمل المتراكم',
            'جدول مهام نهاية الأسبوع لتنظيف المنزل والتسوق والراحة',
          ].map((preset) => (
            <button
              key={preset}
              type="button"
              className="history-chip"
              disabled={aiLoading}
              onClick={() => void generateDailyPlanWithAI(preset)}
            >
              {preset}
            </button>
          ))}
        </div>
        <div className="toolrow">
          <input
            type="text"
            className="field"
            style={{ flex: 1, margin: 0 }}
            value={aiInput}
            onChange={(e) => setAiInput(e.target.value)}
            placeholder="مثال: لدي اليوم اجتماع الساعة 11، إنهاء التقرير، ومراجعة دروس..."
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void generateDailyPlanWithAI();
              }
            }}
          />
          <button
            type="button"
            className="primary"
            disabled={aiLoading}
            onClick={() => void generateDailyPlanWithAI()}
          >
            <Sparkles size={15} />
            {aiLoading ? 'جاري الترتيب…' : 'رتّب مهامي الآن'}
          </button>
        </div>
      </div>

      {statusMsg && <div className="statusbox info">{statusMsg}</div>}

      <div className="char-sender-box">
        <div className="tiny" style={{ marginBottom: 8 }}>إضافة مهمة يدوية سريعة:</div>
        <div className="tasks-add-grid">
          <input
            type="text"
            className="field"
            style={{ margin: 0 }}
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="اسم المهمة اليومية..."
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addManualTask();
              }
            }}
          />
          <select
            className="field"
            style={{ margin: 0 }}
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
          >
            {TASK_CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <select
            className="field"
            style={{ margin: 0 }}
            value={newPriority}
            onChange={(e) => setNewPriority(e.target.value)}
          >
            {TASK_PRIORITIES.map((p) => (
              <option key={p} value={p}>أولوية: {p}</option>
            ))}
          </select>
          <input
            type="text"
            className="field"
            style={{ margin: 0 }}
            value={newTime}
            onChange={(e) => setNewTime(e.target.value)}
            placeholder="الوقت (مثلاً 10:00 ص)"
          />
          <button type="button" className="secondary" onClick={addManualTask}>
            <Plus size={15} />
            إضافة
          </button>
        </div>
      </div>

      <div className="toolrow" style={{ marginTop: 10 }}>
        {(['all', 'pending', 'done'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            className={`mini-btn ${filter === tab ? 'active-filter' : ''}`}
            onClick={() => setFilter(tab)}
          >
            {tab === 'all' ? `الكل (${totalCount})` : tab === 'pending' ? `قيد التنفيذ (${totalCount - completedCount})` : `المكتملة (${completedCount})`}
          </button>
        ))}
      </div>

      <div className="tasks-list">
        {visibleTasks.length === 0 ? (
          <div className="statusbox">
            لا توجد مهام في هذا القسم حالياً — أضيفي مهمة جديدة أو اطلبي من الذكاء الاصطناعي ترتيب يومك.
          </div>
        ) : (
          visibleTasks.map((task) => (
            <div key={task.id} className={`task-row ${task.completed ? 'completed' : ''}`}>
              <button
                type="button"
                className="task-check-btn"
                onClick={() => toggleTask(task.id)}
                aria-label={task.completed ? 'إلغاء الإنجاز' : 'تحديد كمكتملة'}
              >
                {task.completed ? <CheckCircle2 size={20} color="#34d399" /> : <Circle size={20} color="#94a3b8" />}
              </button>
              <div className="task-body">
                <div className="task-title">{task.title}</div>
                <div className="task-meta">
                  <span className="task-badge">{task.category}</span>
                  <span className={`task-badge priority-${task.priority === 'عالية' ? 'high' : task.priority === 'متوسطة' ? 'mid' : 'low'}`}>
                    {task.priority}
                  </span>
                  {task.timeSlot && (
                    <span className="task-badge time">
                      <Clock size={11} />
                      {task.timeSlot}
                    </span>
                  )}
                </div>
              </div>
              <button
                type="button"
                className="mini-btn danger"
                onClick={() => deleteTask(task.id)}
                aria-label="حذف المهمة"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
