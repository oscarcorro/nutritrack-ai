// Local reminders using the browser Notification API + setTimeout.
// No server push, no Web Push subscriptions. All times are interpreted in
// the user's local timezone (Madrid for the target user).

export type NotificationPrefs = {
  enabled: boolean
  meals: boolean
  weighIn: boolean
}

export const NOTIF_PREFS_KEY = "nt:notifications:v1"

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  enabled: false,
  meals: true,
  weighIn: true,
}

export function loadNotificationPrefs(): NotificationPrefs {
  if (typeof window === "undefined") return { ...DEFAULT_NOTIFICATION_PREFS }
  try {
    const raw = localStorage.getItem(NOTIF_PREFS_KEY)
    if (!raw) return { ...DEFAULT_NOTIFICATION_PREFS }
    const parsed = JSON.parse(raw) as Partial<NotificationPrefs>
    return { ...DEFAULT_NOTIFICATION_PREFS, ...parsed }
  } catch {
    return { ...DEFAULT_NOTIFICATION_PREFS }
  }
}

export function saveNotificationPrefs(prefs: NotificationPrefs): void {
  try {
    localStorage.setItem(NOTIF_PREFS_KEY, JSON.stringify(prefs))
  } catch {
    /* ignore */
  }
}

type Reminder = {
  id: string
  hour: number
  minute: number
  label: string
  kind: "meal" | "weighIn"
}

const DEFAULT_REMINDERS: Reminder[] = [
  { id: "weighIn", hour: 8, minute: 0, label: "Pésate antes de desayunar", kind: "weighIn" },
  { id: "breakfast", hour: 8, minute: 30, label: "Hora del desayuno", kind: "meal" },
  { id: "morning_snack", hour: 11, minute: 0, label: "Hora de media mañana", kind: "meal" },
  { id: "lunch", hour: 14, minute: 0, label: "Hora de la comida", kind: "meal" },
  { id: "afternoon_snack", hour: 17, minute: 30, label: "Hora de la merienda", kind: "meal" },
  { id: "dinner", hour: 21, minute: 0, label: "Hora de la cena", kind: "meal" },
]

let activeTimer: ReturnType<typeof setTimeout> | null = null

function clearTimer() {
  if (activeTimer !== null) {
    clearTimeout(activeTimer)
    activeTimer = null
  }
}

function nextOccurrence(hour: number, minute: number, from: Date): Date {
  const d = new Date(from)
  d.setSeconds(0, 0)
  d.setHours(hour, minute, 0, 0)
  if (d.getTime() <= from.getTime()) {
    d.setDate(d.getDate() + 1)
  }
  return d
}

function pickNextReminder(prefs: NotificationPrefs, now: Date): { reminder: Reminder; at: Date } | null {
  const candidates: { reminder: Reminder; at: Date }[] = []
  for (const r of DEFAULT_REMINDERS) {
    if (r.kind === "meal" && !prefs.meals) continue
    if (r.kind === "weighIn" && !prefs.weighIn) continue
    candidates.push({ reminder: r, at: nextOccurrence(r.hour, r.minute, now) })
  }
  if (candidates.length === 0) return null
  candidates.sort((a, b) => a.at.getTime() - b.at.getTime())
  return candidates[0]
}

function fire(reminder: Reminder) {
  // TODO: dedupe — skip meal reminders if a food_log already exists for the
  // matching meal slot today (requires Supabase access; left for v1.1).
  try {
    if (typeof Notification === "undefined") return
    if (Notification.permission !== "granted") return
    new Notification("NutriTrack", {
      body: reminder.label,
      icon: "/icon.svg",
      tag: `nt-${reminder.id}`,
    })
  } catch {
    /* ignore */
  }
}

/**
 * Schedules a single timer for the next reminder due. Re-arms after firing.
 * Safe to call multiple times — previous timer is cleared.
 */
export function initReminders(): void {
  if (typeof window === "undefined") return
  clearTimer()

  const prefs = loadNotificationPrefs()
  if (!prefs.enabled) return
  if (typeof Notification === "undefined") return
  if (Notification.permission !== "granted") return

  const now = new Date()
  const next = pickNextReminder(prefs, now)
  if (!next) return

  const delay = Math.max(1000, next.at.getTime() - now.getTime())
  // setTimeout max ~24.8 days; our delay is always < 24h so this is safe.
  activeTimer = setTimeout(() => {
    fire(next.reminder)
    // Re-arm for the next one.
    initReminders()
  }, delay)
}

export function cancelReminders(): void {
  clearTimer()
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (typeof Notification === "undefined") return "denied"
  if (Notification.permission === "granted") return "granted"
  if (Notification.permission === "denied") return "denied"
  try {
    return await Notification.requestPermission()
  } catch {
    return "denied"
  }
}
