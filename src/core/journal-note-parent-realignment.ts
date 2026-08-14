import { IndexedTask } from '../types/fields';
import {
	isJournalNoteFileTaskForDate,
	isIsoDateKey,
} from './journal-note-path';
import type { JournalsJournalConfig } from './journals-core-config';

export interface JournalNoteParentRealignmentInput {
	enabled: boolean;
	currentFieldValues: Record<string, string>;
	patch: Record<string, string>;
	currentParentTask: IndexedTask | null | undefined;
	journal: JournalsJournalConfig;
	mode?: 'merge' | 'replace';
}

/**
 * Parallel to resolveDailyNoteParentRealignmentTargetDate but for Journals notes.
 * When a task's dateScheduled changes and its current parent is the previous date's
 * journal note, returns the new target date so the parent can be re-pointed.
 */
export function resolveJournalNoteParentRealignmentTargetDate({
	enabled,
	currentFieldValues,
	patch,
	currentParentTask,
	journal,
	mode = 'merge',
}: JournalNoteParentRealignmentInput): string | null {
	if (!enabled) return null;
	if (!hasOwn(patch, 'dateScheduled')) return null;

	const previousScheduled = normalizeFieldValue(currentFieldValues['dateScheduled']);
	const nextScheduled = normalizeFieldValue(patch['dateScheduled']);
	if (!isIsoDateKey(previousScheduled)) return null;
	if (!isIsoDateKey(nextScheduled)) return null;
	if (previousScheduled === nextScheduled) return null;

	const currentParentId = normalizeFieldValue(currentFieldValues['parentTask']);
	if (!currentParentId) return null;

	if (hasOwn(patch, 'parentTask')) {
		const patchedParentId = normalizeFieldValue(patch['parentTask']);
		if (patchedParentId !== currentParentId) return null;
	} else if (mode === 'replace') {
		return null;
	}

	if (!isJournalNoteFileTaskForDate(currentParentTask, previousScheduled, journal)) return null;
	return nextScheduled;
}

function normalizeFieldValue(value: string | null | undefined): string {
	return (value ?? '').trim();
}

function hasOwn(source: Record<string, string>, key: string): boolean {
	return Object.prototype.hasOwnProperty.call(source, key) === true;
}
