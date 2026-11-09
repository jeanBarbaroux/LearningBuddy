// Local calendar helpers: days are identified by their local midnight (epoch milliseconds).

const DAY_MS = 86_400_000;

export function startOfDay(epochMs: number): number {
  const date = new Date(epochMs);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

export function addDays(day: number, count: number): number {
  const date = new Date(day);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + count).getTime();
}

/** Last millisecond of a local day. */
export function endOfDay(day: number): number {
  return addDays(day, 1) - 1;
}

/** Monday of the week of a local day. */
export function startOfWeek(day: number): number {
  const weekday = (new Date(day).getDay() + 6) % 7;
  return addDays(startOfDay(day), -weekday);
}

export function startOfMonth(day: number): number {
  const date = new Date(day);
  return new Date(date.getFullYear(), date.getMonth(), 1).getTime();
}

export function addMonths(day: number, count: number): number {
  const date = new Date(day);
  return new Date(date.getFullYear(), date.getMonth() + count, 1).getTime();
}

/** Number of calendar days from `start` to `end`, both included. */
export function daysBetweenInclusive(start: number, end: number): number {
  return Math.round((startOfDay(end) - startOfDay(start)) / DAY_MS) + 1;
}

/** Local date "YYYY-MM-DD", as used by date inputs. */
export function toDateInputValue(day: number): string {
  const date = new Date(day);
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function fromDateInputValue(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return null;
  }

  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return toDateInputValue(date.getTime()) === value ? date.getTime() : null;
}
