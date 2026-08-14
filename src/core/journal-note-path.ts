import { moment } from 'obsidian';
import type { IndexedTask } from '../types/fields';
import type { JournalsJournalConfig } from './journals-core-config';

// ─── Template evaluation ──────────────────────────────────────────────────────

const DATE_TOKEN_RE = /\{\{date(?::([^}]+))?\}\}/gu;

/**
 * Evaluate a Journals template string (containing {{date}} or {{date:FORMAT}} tokens)
 * against the given moment date object.
 */
export function evaluateJournalTemplate(
	template: string,
	date: moment.Moment,
	dateFormat = 'YYYY-MM-DD',
): string {
	return template.replace(DATE_TOKEN_RE, (_, fmt?: string) => {
		const formatString = fmt?.trim() || dateFormat;
		return date.format(formatString);
	});
}

// ─── Path normalization ───────────────────────────────────────────────────────

function normalizeJournalPath(path: string): string {
	return path.trim().replace(/^\/+|\/+$/gu, '');
}

function joinJournalPath(folder: string, name: string): string {
	const normalizedFolder = normalizeJournalPath(folder);
	const normalizedName = normalizeJournalPath(name);
	if (!normalizedName) return '';
	return normalizedFolder ? `${normalizedFolder}/${normalizedName}.md` : `${normalizedName}.md`;
}

function journalPathsMatch(left: string | null | undefined, right: string | null | undefined): boolean {
	const normalizedLeft = normalizeJournalPath(left ?? '');
	const normalizedRight = normalizeJournalPath(right ?? '');
	return !!normalizedLeft && normalizedLeft === normalizedRight;
}

// ─── Date parsing ─────────────────────────────────────────────────────────────

type MomentDate = {
	isValid: () => boolean;
	format: (format: string) => string;
};

type MomentParser = (input: string, format: string, strict: boolean) => MomentDate;

const ISO_DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/u;

export function isIsoDateKey(value: string | null | undefined): boolean {
	return ISO_DATE_KEY_RE.test((value ?? '').trim());
}

function parseMomentFromIsoDateKey(dateKey: string): moment.Moment | null {
	const parseMoment = moment as unknown as MomentParser;
	const parsed = parseMoment(dateKey.trim(), 'YYYY-MM-DD', true);
	return parsed.isValid() ? (parsed as unknown as moment.Moment) : null;
}

// ─── Forward resolution: dateKey → vault path ─────────────────────────────────

/**
 * Resolve the vault-relative file path for a journal note given an ISO date key (YYYY-MM-DD).
 * Returns null if the date key is invalid or the config produces an empty path.
 */
export function resolveJournalNotePathFromDateKey(
	dateKey: string,
	journal: JournalsJournalConfig,
): string | null {
	const normalizedKey = dateKey.trim();
	if (!isIsoDateKey(normalizedKey)) return null;

	const date = parseMomentFromIsoDateKey(normalizedKey);
	if (!date) return null;

	const folder = evaluateJournalTemplate(journal.folderTemplate, date, journal.dateFormat);
	const name = evaluateJournalTemplate(journal.nameTemplate, date, journal.dateFormat);
	const path = joinJournalPath(folder, name);
	return path || null;
}

// ─── Reverse resolution: vault path → dateKey ─────────────────────────────────

const MAX_REVERSE_DAYS = 730;

/**
 * Given a vault-relative file path, attempt to reverse-engineer the ISO date key
 * by trying today ± MAX_REVERSE_DAYS candidate dates.
 * Returns null if the path does not belong to this journal config.
 *
 * For performance in common cases (recently-created notes), the scan starts from
 * today and expands outward in ±1 day steps.
 */
export function resolveJournalDateKeyFromPath(
	filePath: string | null | undefined,
	journal: JournalsJournalConfig,
): string | null {
	const normalizedPath = normalizeJournalPath(filePath ?? '');
	if (!normalizedPath || !normalizedPath.endsWith('.md')) return null;

	const today = (moment as any)();

	for (let offset = 0; offset <= MAX_REVERSE_DAYS; offset++) {
		const candidates = offset === 0
			? [today.clone()]
			: [today.clone().add(offset, 'days'), today.clone().subtract(offset, 'days')];

		for (const candidate of candidates) {
			const dateKey = candidate.format('YYYY-MM-DD');
			const expectedPath = resolveJournalNotePathFromDateKey(dateKey, journal);
			if (expectedPath && journalPathsMatch(normalizedPath, expectedPath)) {
				return dateKey;
			}
		}
	}

	return null;
}

// ─── Membership check ─────────────────────────────────────────────────────────

/**
 * Returns true if the given indexed task is the journal note file task for the given date.
 */
export function isJournalNoteFileTaskForDate(
	task: IndexedTask | null | undefined,
	dateKey: string,
	journal: JournalsJournalConfig,
): boolean {
	if (!task) return false;
	if (task.primary.format !== 'yaml') return false;
	const expectedPath = resolveJournalNotePathFromDateKey(dateKey, journal);
	return journalPathsMatch(task.primary.filePath, expectedPath);
}
