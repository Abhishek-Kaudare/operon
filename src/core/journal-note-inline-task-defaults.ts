import type { IndexedTask } from '../types/fields';
import type { OperonSettings } from '../types/settings';
import { resolveAutomationWorkflowStatus } from '../types/pipeline';
import { resolveJournalDateKeyFromPath } from './journal-note-path';
import type { JournalsJournalConfig } from './journals-core-config';
import {
	DAILY_NOTE_INLINE_TASK_DEFAULT_FRESHNESS_MS,
	isFreshlyCreatedOperonInlineTask,
} from './daily-note-inline-task-defaults';

export { DAILY_NOTE_INLINE_TASK_DEFAULT_FRESHNESS_MS as JOURNAL_NOTE_INLINE_TASK_DEFAULT_FRESHNESS_MS };

type JournalNoteInlineTaskDefaultSettings = Pick<
	OperonSettings,
	| 'inlineTaskJournalAddStartDate'
	| 'inlineTaskJournalAddScheduledDate'
	| 'pipelines'
	| 'defaultPipelineName'
>;

export interface JournalNoteInlineTaskDefaultPatchOptions {
	task: IndexedTask;
	journalDateKey: string;
	settings: JournalNoteInlineTaskDefaultSettings;
	now: string;
	freshnessMs?: number;
}

export interface JournalNoteInlineTaskDefaultDelta {
	before: IndexedTask | null;
	after: IndexedTask | null;
}

export interface JournalNoteInlineTaskDefaultWritePlan {
	operonId: string;
	payload: Record<string, string>;
}

export interface JournalNoteInlineTaskDefaultWritePlanOptions {
	changes: readonly JournalNoteInlineTaskDefaultDelta[];
	journalConfig: JournalsJournalConfig;
	settings: JournalNoteInlineTaskDefaultSettings;
	now: string;
	freshnessMs?: number;
}

export function buildJournalNoteInlineTaskDefaultPatch(
	options: JournalNoteInlineTaskDefaultPatchOptions,
): Record<string, string> {
	const { task, journalDateKey, settings, now, freshnessMs } = options;
	if (!settings.inlineTaskJournalAddStartDate && !settings.inlineTaskJournalAddScheduledDate) return {};
	if (!isFreshlyCreatedOperonInlineTask(task, now, freshnessMs)) return {};

	const patch: Record<string, string> = {};
	if (settings.inlineTaskJournalAddStartDate && isBlank(task.fieldValues['dateStarted'])) {
		patch['dateStarted'] = journalDateKey;
	}
	if (settings.inlineTaskJournalAddScheduledDate && isBlank(task.fieldValues['dateScheduled'])) {
		patch['dateScheduled'] = journalDateKey;
	}
	if (patch['dateScheduled'] && !hasOwnFieldValue(task, 'status') && task.checkbox === 'open') {
		const workflow = resolveAutomationWorkflowStatus(
			settings.pipelines,
			undefined,
			settings.defaultPipelineName,
			'scheduled',
		);
		if (workflow) {
			patch['status'] = workflow.value;
		}
	}

	return patch;
}

export function buildJournalNoteInlineTaskDefaultWritePlans(
	options: JournalNoteInlineTaskDefaultWritePlanOptions,
): JournalNoteInlineTaskDefaultWritePlan[] {
	const { changes, journalConfig, settings, now, freshnessMs } = options;
	if (!settings.inlineTaskJournalAddStartDate && !settings.inlineTaskJournalAddScheduledDate) return [];

	const plans: JournalNoteInlineTaskDefaultWritePlan[] = [];
	for (const change of changes) {
		const task = change.before ? null : change.after;
		if (!task || task.primary.format !== 'inline') continue;

		const journalDateKey = resolveJournalDateKeyFromPath(task.primary.filePath, journalConfig);
		if (!journalDateKey) continue;

		const patch = buildJournalNoteInlineTaskDefaultPatch({
			task,
			journalDateKey,
			settings,
			now,
			freshnessMs,
		});
		if (Object.keys(patch).length === 0) continue;

		plans.push({
			operonId: task.operonId,
			payload: {
				...patch,
				datetimeModified: now,
			},
		});
	}

	return plans;
}

function isBlank(value: string | null | undefined): boolean {
	return !(value ?? '').trim();
}

function hasOwnFieldValue(task: IndexedTask, key: string): boolean {
	return Object.keys(task.fieldValues).includes(key);
}
