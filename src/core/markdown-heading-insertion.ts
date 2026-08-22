export interface InlineHeadingKeywordInsertionResult {
	content: string;
	insertedLineNumber: number;
	headingLineNumber: number;
	headingWasCreated: boolean;
}

const MARKDOWN_HEADING_RE = /^(#{1,6})\s+(.+?)\s*#*\s*$/;

function splitPreservingEmptyTrailingLine(content: string): string[] {
	if (!content.length) return [];
	return content.split('\n');
}

export function normalizeMarkdownHeadingKeyword(raw: string, fallback: string): string {
	const trimmed = raw.trim();
	const withoutHeadingMarker = trimmed.replace(/^#{1,6}\s+/, '').trim();
	return withoutHeadingMarker || fallback.trim();
}

export function insertInlineTaskUnderFirstHeadingKeyword(
	content: string,
	keyword: string,
	taskLine: string,
	headingLevel = 2,
): InlineHeadingKeywordInsertionResult {
	const safeKeyword = keyword.trim();
	const headingSearch = safeKeyword.toLowerCase();
	const lines = splitPreservingEmptyTrailingLine(content);

	// Extract parentTask ID if this task line is a subtask
	const parentMatch = taskLine.match(/\{\{parentTask::\s*([^\}]+)\}\}/);
	const parentId = parentMatch ? parentMatch[1].trim() : null;

	if (parentId) {
		let parentIndex = -1;
		let parentIndent = '';
		for (let i = 0; i < lines.length; i++) {
			if (lines[i].includes(`{{operonId:: ${parentId}}}`) || lines[i].includes(`{{operonId::${parentId}}}`)) {
				parentIndex = i;
				const indentMatch = lines[i].match(/^(\s*)/);
				parentIndent = indentMatch ? indentMatch[1] : '';
				break;
			}
		}

		if (parentIndex !== -1) {
			const childIndent = parentIndent ? `${parentIndent}\t` : '\t';
			const rawTaskText = taskLine.replace(/^\s*/, '');
			const formattedTaskLine = rawTaskText.startsWith('\t') || rawTaskText.startsWith(' ')
				? rawTaskText
				: `${childIndent}${rawTaskText}`;

			let insertIndex = parentIndex + 1;
			while (insertIndex < lines.length) {
				const line = lines[insertIndex];
				if (MARKDOWN_HEADING_RE.test(line.trim())) break;
				if (line.trim().length > 0 && !/^\s+/.test(line) && !line.startsWith('\t')) break;
				insertIndex++;
			}

			lines.splice(insertIndex, 0, formattedTaskLine);
			return {
				content: lines.join('\n'),
				insertedLineNumber: insertIndex,
				headingLineNumber: parentIndex,
				headingWasCreated: false,
			};
		}
	}

	for (let index = 0; index < lines.length; index++) {
		const match = lines[index].trim().match(MARKDOWN_HEADING_RE);
		if (!match) continue;
		const headingText = match[2].trim().toLowerCase();
		if (!headingText.includes(headingSearch)) continue;

		let insertIndex = index + 1;
		while (insertIndex < lines.length) {
			const line = lines[insertIndex].trim();
			if (MARKDOWN_HEADING_RE.test(line)) break;
			insertIndex++;
		}

		lines.splice(insertIndex, 0, taskLine);
		return {
			content: lines.join('\n'),
			insertedLineNumber: insertIndex,
			headingLineNumber: index,
			headingWasCreated: false,
		};
	}

	const nextLines = [...lines];
	while (nextLines.length > 0 && !nextLines[nextLines.length - 1].trim()) {
		nextLines.pop();
	}
	if (nextLines.length > 0) {
		nextLines.push('');
	}

	const headingDepth = Math.max(1, Math.min(6, Math.floor(headingLevel)));
	nextLines.push(`${'#'.repeat(headingDepth)} ${safeKeyword}`);
	nextLines.push(taskLine);

	return {
		content: nextLines.join('\n'),
		insertedLineNumber: nextLines.length - 1,
		headingLineNumber: nextLines.length - 2,
		headingWasCreated: true,
	};
}
