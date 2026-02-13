import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Bell, X, Clock, Bookmark, ChevronDown, CheckCircle2,
  AlertTriangle, ArrowUp, Minus, ArrowDown, ExternalLink
} from 'lucide-react';
import { commentTasksApi, projectCommentsApi, AppReminder, ReminderSource, TaskPriority } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';

// ─── Priority styles ─────────────────────────────────────
const PRIORITY_STYLES: Record<TaskPriority, { color: string; bg: string; icon: typeof Bell }> = {
  urgent: { color: 'text-red-600', bg: 'bg-red-50', icon: AlertTriangle },
  high:   { color: 'text-orange-600', bg: 'bg-orange-50', icon: ArrowUp },
  medium: { color: 'text-blue-600', bg: 'bg-blue-50', icon: Minus },
  low:    { color: 'text-neutral-500', bg: 'bg-neutral-50', icon: ArrowDown },
};

// ─── Snooze options ──────────────────────────────────────
const SNOOZE_OPTIONS = [
  { label: '15 min', minutes: 15 },
  { label: '1 hour', minutes: 60 },
  { label: '3 hours', minutes: 180 },
  { label: 'Tomorrow 9am', minutes: -1 },
];

function getSnoozeDate(minutes: number): string {
  if (minutes === -1) {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
    return d.toISOString();
  }
  return new Date(Date.now() + minutes * 60000).toISOString();
}

// ─── Types ───────────────────────────────────────────────
interface ActiveReminder extends AppReminder {
  showSnooze: boolean;
  isExiting: boolean;
}

interface ReminderPopupProps {
  /** Callback when user clicks "View" on a reminder */
  onNavigate?: (reminder: AppReminder) => void;
}

// ─── Polling interval (60 seconds) ──────────────────────
const POLL_INTERVAL = 60_000;

// ─── Component ───────────────────────────────────────────
export function ReminderPopup({ onNavigate }: ReminderPopupProps) {
  const { user } = useAuth();
  const [reminders, setReminders] = useState<ActiveReminder[]>([]);
  const seenIds = useRef<Set<string>>(new Set());
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Poll for due reminders
  const checkReminders = useCallback(async () => {
    if (!user?.id) return;
    try {
      // Comment task reminders
      const dueTasks = await commentTasksApi.getDueReminders();
      const newReminders: ActiveReminder[] = [];

      for (const task of dueTasks) {
        if (seenIds.current.has(task.id)) continue;
        seenIds.current.add(task.id);

        // Mark as sent in DB so it doesn't fire on next poll
        await commentTasksApi.markReminderSent(task.id);

        // Try to fetch the related comment for better context
        let commentContent = task.note || 'You have a pinned message that needs attention.';
        let projectName: string | undefined;
        try {
          const comments = await projectCommentsApi.getByProject(task.project_id);
          const comment = comments.find(c => c.id === task.comment_id);
          if (comment) {
            // Strip task mentions for cleaner display
            commentContent = comment.content.replace(/@\[task:[^\]]+\]/g, '').trim() || commentContent;
          }
        } catch {}

        newReminders.push({
          id: `ct-${task.id}`,
          sourceId: task.id,
          source: 'comment_task' as ReminderSource,
          title: 'To-Do Reminder',
          message: commentContent,
          projectName,
          projectId: task.project_id,
          priority: task.priority,
          reminder_at: task.reminder_at || '',
          created_at: task.created_at,
          showSnooze: false,
          isExiting: false,
        });
      }

      // Future: add more sources here (submittals, deadlines, etc.)
      // const dueSubmittals = await submittalsApi.getDueReminders();
      // ...

      if (newReminders.length > 0) {
        setReminders(prev => [...newReminders, ...prev]);
        // Play a subtle notification sound (optional, uses browser)
        try {
          if (!audioRef.current) {
            audioRef.current = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbsGczHjqR0teleS8cLYvO2MCIQCkklM/gy5pZOi2Sz+TLo2RIQDKb1efMrHFfS0Wj2urPtX9jT1Cs2+zTuo9wYFxbt9/v18WadWxndujYxpJ+c3R0dHR0c3Nzc3JycXFxcA==');
          }
          audioRef.current.volume = 0.3;
          audioRef.current.play().catch(() => {});
        } catch {}
      }
    } catch (err) {
      console.error('Reminder poll error:', err);
    }
  }, [user?.id]);

  // Start polling
  useEffect(() => {
    if (!user?.id) return;

    // Check immediately on mount
    checkReminders();

    const interval = setInterval(checkReminders, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [user?.id, checkReminders]);

  // Dismiss a reminder
  const dismissReminder = (id: string) => {
    setReminders(prev =>
      prev.map(r => r.id === id ? { ...r, isExiting: true } : r)
    );
    setTimeout(() => {
      setReminders(prev => prev.filter(r => r.id !== id));
    }, 300);
  };

  // Snooze a reminder
  const snoozeReminder = async (reminder: ActiveReminder, minutes: number) => {
    try {
      const newDate = getSnoozeDate(minutes);
      await commentTasksApi.snoozeReminder(reminder.sourceId, newDate);
      seenIds.current.delete(reminder.sourceId);
      dismissReminder(reminder.id);
    } catch (err) {
      console.error('Failed to snooze:', err);
    }
  };

  // Mark as done
  const markDone = async (reminder: ActiveReminder) => {
    try {
      await commentTasksApi.toggleComplete(reminder.sourceId, true);
      dismissReminder(reminder.id);
    } catch (err) {
      console.error('Failed to mark done:', err);
    }
  };

  // Toggle snooze menu
  const toggleSnooze = (id: string) => {
    setReminders(prev =>
      prev.map(r => r.id === id ? { ...r, showSnooze: !r.showSnooze } : r)
    );
  };

  // View action
  const handleView = (reminder: ActiveReminder) => {
    onNavigate?.(reminder);
    dismissReminder(reminder.id);
  };

  if (reminders.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-3 max-w-[380px] w-full pointer-events-none print:hidden">
      <style>{`
        @keyframes reminderSlideIn {
          from { transform: translateX(110%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        @keyframes reminderSlideOut {
          from { transform: translateX(0); opacity: 1; }
          to { transform: translateX(110%); opacity: 0; }
        }
        @keyframes reminderPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(234, 179, 8, 0.3); }
          50% { box-shadow: 0 0 0 8px rgba(234, 179, 8, 0); }
        }
      `}</style>

      {reminders.map(reminder => {
        const priStyle = reminder.priority ? PRIORITY_STYLES[reminder.priority] : null;
        const PriIcon = priStyle?.icon || Bell;

        return (
          <div
            key={reminder.id}
            className="pointer-events-auto"
            style={{
              animation: reminder.isExiting
                ? 'reminderSlideOut 0.3s ease-in forwards'
                : 'reminderSlideIn 0.4s ease-out, reminderPulse 2s ease-in-out 0.5s 3',
            }}
          >
            <div className="bg-white rounded-2xl shadow-2xl border border-neutral-200 overflow-hidden">
              {/* Header stripe */}
              <div className={`h-1 ${
                reminder.priority === 'urgent' ? 'bg-red-500' :
                reminder.priority === 'high' ? 'bg-orange-500' :
                reminder.priority === 'medium' ? 'bg-blue-500' :
                'bg-neutral-400'
              }`} />

              <div className="p-4">
                {/* Top row */}
                <div className="flex items-start gap-3">
                  <div className={`w-9 h-9 rounded-xl ${priStyle?.bg || 'bg-amber-50'} flex items-center justify-center shrink-0`}>
                    <Bell className={`w-4.5 h-4.5 ${priStyle?.color || 'text-amber-600'}`} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-bold text-neutral-900">{reminder.title}</h4>
                      {reminder.priority && (
                        <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-semibold ${priStyle?.bg} ${priStyle?.color} border border-current/10`}>
                          <PriIcon className="w-2.5 h-2.5" />
                          {reminder.priority.charAt(0).toUpperCase() + reminder.priority.slice(1)}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-neutral-600 mt-0.5 line-clamp-2 leading-relaxed">{reminder.message}</p>
                    {reminder.projectName && (
                      <p className="text-[10px] text-neutral-400 mt-1 flex items-center gap-1">
                        <Bookmark className="w-3 h-3" /> {reminder.projectName}
                      </p>
                    )}
                  </div>

                  <button onClick={() => dismissReminder(reminder.id)} className="p-1 hover:bg-neutral-100 rounded-lg text-neutral-400 hover:text-neutral-600 shrink-0">
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Action buttons */}
                <div className="flex items-center gap-2 mt-3 ml-12">
                  <button
                    onClick={() => markDone(reminder)}
                    className="flex items-center gap-1 px-3 py-1.5 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" /> Done
                  </button>

                  <button
                    onClick={() => handleView(reminder)}
                    className="flex items-center gap-1 px-3 py-1.5 text-[11px] font-semibold text-[#476E66] bg-[#476E66]/5 border border-[#476E66]/20 rounded-lg hover:bg-[#476E66]/10 transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5" /> View
                  </button>

                  <div className="relative">
                    <button
                      onClick={() => toggleSnooze(reminder.id)}
                      className="flex items-center gap-1 px-3 py-1.5 text-[11px] font-medium text-neutral-500 bg-neutral-50 border border-neutral-200 rounded-lg hover:bg-neutral-100 transition-colors"
                    >
                      <Clock className="w-3.5 h-3.5" /> Snooze
                      <ChevronDown className={`w-3 h-3 transition-transform ${reminder.showSnooze ? 'rotate-180' : ''}`} />
                    </button>

                    {/* Snooze dropdown */}
                    {reminder.showSnooze && (
                      <div className="absolute top-full left-0 mt-1 bg-white border border-neutral-200 rounded-xl shadow-lg py-1 min-w-[140px] z-10">
                        {SNOOZE_OPTIONS.map(opt => (
                          <button
                            key={opt.label}
                            onClick={() => snoozeReminder(reminder, opt.minutes)}
                            className="w-full text-left px-3 py-1.5 text-xs text-neutral-600 hover:bg-neutral-50 hover:text-[#476E66] transition-colors"
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
