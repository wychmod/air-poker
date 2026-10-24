import { airTotals, accountingSummary, isCompletedRecord } from '../game/records.js';

export const RECORD_STORAGE_KEY = 'air-poker-last-record-v1';

// Resolve storage lazily: accessing localStorage itself can throw.
export function createRecordStore({ storage = () => localStorage } = {}) {
  return {
    load() {
      try {
        const raw = storage().getItem(RECORD_STORAGE_KEY);
        if (raw === null) return { record: null, status: 'empty' };
        const record = JSON.parse(raw);
        if (!isCompletedRecord(record)) return { record: null, status: 'invalid' };
        record.accounting = accountingSummary(record);
        record.totals = airTotals(record);
        for (const round of record.rounds) round.totals = airTotals(record, round.number);
        return { record, status: 'saved' };
      } catch {
        return { record: null, status: 'unavailable' };
      }
    },
    save(record) {
      if (!isCompletedRecord(record)) return false;
      try {
        storage().setItem(RECORD_STORAGE_KEY, JSON.stringify(record));
        return true;
      } catch {
        return false;
      }
    },
  };
}
