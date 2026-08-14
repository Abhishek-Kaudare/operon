export type InlineTaskSaveMode = 'daily-notes' | 'journals' | 'specific-file' | 'active-file' | 'ask-every-time';

export interface InlineTaskSaveModeSettings {
	inlineTaskSaveMode?: InlineTaskSaveMode;
	inlineTaskUseDailyNote: boolean;
}

export function resolveEffectiveInlineTaskSaveMode(
	settings: InlineTaskSaveModeSettings,
	dailyNotesAvailable: boolean,
	journalsAvailable = false,
): InlineTaskSaveMode {
	const requestedMode = settings.inlineTaskSaveMode
		?? (settings.inlineTaskUseDailyNote ? 'daily-notes' : 'specific-file');
	if (requestedMode === 'daily-notes' && !dailyNotesAvailable) return 'specific-file';
	if (requestedMode === 'journals' && !journalsAvailable) return 'specific-file';
	return requestedMode;
}
