// Daily review times in local time (v1 DailyReviewSchedule).
import { LocalizedError } from '../errors';

export interface DailyReviewSlot {
  /** Local time "HH:mm". */
  readonly time: string;
  /** Number of questions of the series started at this time (1 or more). */
  readonly questions: number;
}

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isValidSlotTime(time: string): boolean {
  return TIME_PATTERN.test(time);
}

/** Checks the slots (unique valid times, positive question counts) and sorts them by time. */
export function validateDailySlots(slots: readonly DailyReviewSlot[], required: boolean): DailyReviewSlot[] {
  const times = new Set(slots.map((slot) => slot.time));
  const valid = (!required || slots.length > 0)
    && times.size === slots.length
    && slots.every((slot) => isValidSlotTime(slot.time) && Number.isSafeInteger(slot.questions) && slot.questions >= 1);
  if (!valid) {
    throw new LocalizedError('InvalidDailySchedule');
  }

  return [...slots].sort((a, b) => a.time.localeCompare(b.time));
}

/**
 * First slot strictly after `now`, in local time. Missed slots are never replayed; times that do not
 * exist when clocks go forward are skipped and the first occurrence is used when clocks go back.
 */
export function nextDailySlot(slots: readonly DailyReviewSlot[], now: number): { at: number; questions: number } {
  if (slots.length === 0) {
    throw new RangeError('Un horaire au moins est requis.');
  }

  const today = new Date(now);
  for (let day = 0; day <= 366; day += 1) {
    for (const slot of slots) {
      const [hours, minutes] = slot.time.split(':').map(Number) as [number, number];
      const candidate = new Date(today.getFullYear(), today.getMonth(), today.getDate() + day, hours, minutes);
      const exists = candidate.getHours() === hours && candidate.getMinutes() === minutes;
      if (exists && candidate.getTime() > now) {
        return { at: candidate.getTime(), questions: slot.questions };
      }
    }
  }

  throw new RangeError('Aucun horaire futur n’a été trouvé.');
}
