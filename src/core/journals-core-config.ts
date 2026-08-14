import type { App } from 'obsidian';

// ─── Types ───────────────────────────────────────────────────────────────────

export type JournalWriteType = 'day' | 'week' | 'month' | 'quarter' | 'year';

export interface JournalsFrontmatterConfig {
	dateField: string;
	addStartDate: boolean;
	startDateField: string;
	addEndDate: boolean;
	endDateField: string;
	indexField: string;
}

export interface JournalsJournalConfig {
	name: string;
	writeType: JournalWriteType;
	nameTemplate: string;
	dateFormat: string;
	folderTemplate: string;
	templates: string[];
	frontmatter: JournalsFrontmatterConfig;
}

export interface JournalsCoreConfig {
	version: number;
	journals: Record<string, JournalsJournalConfig>;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const JOURNALS_PLUGIN_ID = 'journals';
const JOURNALS_DATA_FILE = 'data.json';

// ─── Raw schema (as stored on disk) ──────────────────────────────────────────

interface RawJournalEntry {
	name?: unknown;
	write?: { type?: unknown };
	nameTemplate?: unknown;
	dateFormat?: unknown;
	folder?: unknown;
	templates?: unknown;
	frontmatter?: {
		dateField?: unknown;
		addStartDate?: unknown;
		startDateField?: unknown;
		addEndDate?: unknown;
		endDateField?: unknown;
		indexField?: unknown;
	};
}

interface RawJournalsData {
	version?: unknown;
	journals?: unknown;
}

// ─── Parsing helpers ──────────────────────────────────────────────────────────

function normalizeWriteType(raw: unknown): JournalWriteType {
	if (raw === 'week' || raw === 'month' || raw === 'quarter' || raw === 'year') return raw;
	return 'day';
}

function normalizeString(value: unknown, fallback: string): string {
	return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function normalizeTemplatesArray(raw: unknown): string[] {
	if (!Array.isArray(raw)) return [];
	return raw.filter((t): t is string => typeof t === 'string' && t.trim().length > 0);
}

function normalizeFrontmatter(raw: RawJournalEntry['frontmatter']): JournalsFrontmatterConfig {
	return {
		dateField: normalizeString(raw?.dateField, 'journal-date'),
		addStartDate: raw?.addStartDate === true,
		startDateField: normalizeString(raw?.startDateField, ''),
		addEndDate: raw?.addEndDate === true,
		endDateField: normalizeString(raw?.endDateField, ''),
		indexField: normalizeString(raw?.indexField, ''),
	};
}

function parseJournalEntry(raw: RawJournalEntry, key: string): JournalsJournalConfig {
	return {
		name: normalizeString(raw.name, key),
		writeType: normalizeWriteType(raw.write?.type),
		nameTemplate: normalizeString(raw.nameTemplate, '{{date:YYYY-MM-DD}}'),
		dateFormat: normalizeString(raw.dateFormat, 'YYYY-MM-DD'),
		folderTemplate: normalizeString(raw.folder, ''),
		templates: normalizeTemplatesArray(raw.templates),
		frontmatter: normalizeFrontmatter(raw.frontmatter),
	};
}

function parseJournalsCoreConfig(raw: RawJournalsData): JournalsCoreConfig {
	const journals: Record<string, JournalsJournalConfig> = {};
	if (raw.journals && typeof raw.journals === 'object' && !Array.isArray(raw.journals)) {
		for (const [key, entry] of Object.entries(raw.journals as Record<string, unknown>)) {
			if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
				journals[key] = parseJournalEntry(entry as RawJournalEntry, key);
			}
		}
	}
	return {
		version: typeof raw.version === 'number' ? raw.version : 0,
		journals,
	};
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Read and parse the Journals plugin configuration from the vault's plugin data.
 * Returns null when the Journals plugin is not installed or its config is unreadable.
 */
export async function loadJournalsCoreConfig(app: App): Promise<JournalsCoreConfig | null> {
	try {
		const dataPath = `${app.vault.configDir}/plugins/${JOURNALS_PLUGIN_ID}/${JOURNALS_DATA_FILE}`;
		const raw = await app.vault.adapter.read(dataPath);
		const parsed = JSON.parse(raw) as RawJournalsData;
		return parseJournalsCoreConfig(parsed);
	} catch {
		return null;
	}
}

/**
 * Returns true when a non-null JournalsCoreConfig was loaded successfully and contains at least one day-type journal.
 */
export function isJournalsPluginAvailable(config: JournalsCoreConfig | null): boolean {
	return config !== null && getDayJournalNames(config).length > 0;
}

/**
 * Returns the config for a specific named journal, or null if not found.
 */
export function getJournalConfig(
	config: JournalsCoreConfig | null,
	journalName: string,
): JournalsJournalConfig | null {
	if (!config) return null;
	const normalized = journalName.trim();
	return config.journals[normalized] ?? null;
}

/**
 * Returns all journal configs whose writeType matches the given type.
 * Defaults to 'day' (daily journals only).
 */
export function getJournalsByWriteType(
	config: JournalsCoreConfig | null,
	writeType: JournalWriteType = 'day',
): JournalsJournalConfig[] {
	if (!config) return [];
	return Object.values(config.journals).filter(j => j.writeType === writeType);
}

/**
 * Returns the names of all day-type journals, for use in settings dropdowns.
 */
export function getDayJournalNames(config: JournalsCoreConfig | null): string[] {
	return getJournalsByWriteType(config, 'day').map(j => j.name);
}
