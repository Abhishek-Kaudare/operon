/**
 * Utilities for extracting and re-indenting an inline task subtree
 * (a parent task line and all its directly nested, indented child lines)
 * from one file's content string, ready for insertion in another file.
 */

export interface ExtractedSubtree {
	/** The extracted block of lines (parent + all indented children), as a single string. */
	block: string;
	/** Lines remaining after removal of the subtree (including removal of any trailing blank line left behind). */
	remainingLines: string[];
	/** Original 0-based start line index of the extracted block. */
	startLineIndex: number;
	/** Original 0-based end line index (inclusive) of the extracted block. */
	endLineIndex: number;
}

/**
 * Count leading tabs in a string (2 spaces count as 1 tab equivalent).
 */
export function countLeadingSpaces(line: string): number {
	let count = 0;
	let spaces = 0;
	for (const ch of line) {
		if (ch === '\t') {
			count++;
			spaces = 0;
		} else if (ch === ' ') {
			spaces++;
			if (spaces === 2) {
				count++;
				spaces = 0;
			}
		} else {
			break;
		}
	}
	return count;
}

/**
 * Extract an inline task subtree starting at `startLineIndex` from `lines`.
 * The subtree includes the task line itself and all immediately following lines
 * that are indented deeper than the task line (direct children, grandchildren, etc.).
 *
 * Returns null if the startLineIndex is out of bounds.
 */
export function extractInlineTaskSubtree(
	lines: string[],
	startLineIndex: number,
): ExtractedSubtree | null {
	if (startLineIndex < 0 || startLineIndex >= lines.length) return null;

	const parentLine = lines[startLineIndex];
	const parentIndent = countLeadingSpaces(parentLine);
	const subtreeLines: string[] = [parentLine];
	let endLineIndex = startLineIndex;

	for (let i = startLineIndex + 1; i < lines.length; i++) {
		const line = lines[i];
		// A blank line that is sandwiched between indented children should be included,
		// but a blank line after a shallower-or-equal-indent line stops the subtree.
		if (line.trim() === '') {
			// Peek ahead: if the next non-blank line is still deeper, include the blank.
			let nextNonBlank = i + 1;
			while (nextNonBlank < lines.length && lines[nextNonBlank].trim() === '') nextNonBlank++;
			if (nextNonBlank < lines.length && countLeadingSpaces(lines[nextNonBlank]) > parentIndent) {
				subtreeLines.push(line);
				endLineIndex = i;
				continue;
			}
			break;
		}
		if (countLeadingSpaces(line) > parentIndent) {
			subtreeLines.push(line);
			endLineIndex = i;
		} else {
			break;
		}
	}

	// Build remaining lines: remove extracted block + any single trailing blank line
	const remainingLines = [...lines];
	let removeCount = endLineIndex - startLineIndex + 1;
	// Also remove a following blank line if it was left behind by the extraction
	if (
		startLineIndex + removeCount < remainingLines.length &&
		remainingLines[startLineIndex + removeCount].trim() === ''
	) {
		removeCount++;
	}
	remainingLines.splice(startLineIndex, removeCount);

	return {
		block: subtreeLines.join('\n'),
		remainingLines,
		startLineIndex,
		endLineIndex,
		// For backward compatibility keep the parameter name or type
	} as any;
}

/**
 * Re-indent all lines of a subtree block so that the first (parent) line
 * sits at `targetIndentLevel` leading tabs, and all other lines maintain
 * their relative indentation.
 */
export function reindentSubtreeBlock(block: string, targetIndentLevel: number): string {
	const lines = block.split('\n');
	if (lines.length === 0) return block;

	const originalParentIndent = countLeadingSpaces(lines[0]);
	const indent = '\t'.repeat(Math.max(0, targetIndentLevel));

	return lines.map((line, index) => {
		if (index === 0) {
			// Trim original indent then add target
			return indent + line.trimStart();
		}
		const lineIndent = countLeadingSpaces(line);
		const relativeExtraIndent = Math.max(0, lineIndent - originalParentIndent);
		return indent + '\t'.repeat(relativeExtraIndent) + line.trimStart();
	}).join('\n');
}

/**
 * Insert a (possibly re-indented) subtree block into `lines` immediately after `afterLineIndex`.
 * Returns the new content string.
 */
export function insertSubtreeAfterLine(
	lines: string[],
	afterLineIndex: number,
	subtreeBlock: string,
): string {
	const insertAt = afterLineIndex + 1;
	const before = lines.slice(0, insertAt);
	const after = lines.slice(insertAt);
	return [...before, subtreeBlock, ...after].join('\n');
}
