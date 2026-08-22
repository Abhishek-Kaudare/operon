import { t } from '../../core/i18n';
import { createButton, createFloatingPanel, requestFloatingInputFocus } from './common';
import type { ProjectHierarchy } from '../../types/project-hierarchy';

interface ProjectHierarchyPickerOptions {
	hierarchy: ProjectHierarchy;
	canonicalKey: 'bucket' | 'subBucket' | 'project' | 'epic';
	value?: string;
	contextValues: Record<string, string>;
	retainInputFocus?: boolean;
	onSelect: (value: string) => void;
	onClear?: () => void;
	onClose?: () => void;
}

export function showProjectHierarchyPicker(anchor: HTMLElement | DOMRect, options: ProjectHierarchyPickerOptions): () => void {
	let completed = false;
	const { panel, close } = createFloatingPanel(anchor, 'operon-floating-panel operon-status-picker-panel', () => {
		if (!completed) options.onClose?.();
	}, {
		retainInputFocus: options.retainInputFocus,
	});

	const input = panel.createEl('input');
	input.type = 'text';
	input.className = 'operon-floating-input';
	
	let placeholder = '';
	if (options.canonicalKey === 'bucket') placeholder = 'Filter buckets...';
	else if (options.canonicalKey === 'subBucket') placeholder = 'Filter sub-buckets...';
	else if (options.canonicalKey === 'project') placeholder = 'Filter projects...';
	else if (options.canonicalKey === 'epic') placeholder = 'Filter epics...';
	
	input.placeholder = placeholder;
	input.value = options.value ?? '';

	const list = panel.createDiv('operon-status-picker-list');

	const actions = panel.createDiv('operon-floating-actions');
	if (options.onClear) {
		const clearButton = createButton(t('buttons', 'clear'), 'operon-floating-btn is-secondary', actions);
		clearButton.addEventListener('click', () => {
			completed = true;
			options.onClear?.();
			close();
		});
		actions.appendChild(clearButton);
	}

	// Filter options based on contextValues
	const availableOptions = new Set<string>();
	const { bucket, subBucket, project, epic } = options.contextValues;
	const { hierarchy } = options;

	if (options.canonicalKey === 'bucket') {
		for (const b of hierarchy.buckets) {
			availableOptions.add(b.name);
		}
	} else if (options.canonicalKey === 'subBucket') {
		for (const b of hierarchy.buckets) {
			if (bucket && b.name !== bucket) continue;
			for (const sb of b.subBuckets) {
				availableOptions.add(sb.name);
			}
		}
	} else if (options.canonicalKey === 'project') {
		const nameCount = new Map<string, number>();
		for (const p of hierarchy.projectsById.values()) {
			nameCount.set(p.name, (nameCount.get(p.name) ?? 0) + 1);
		}
		for (const p of hierarchy.projectsById.values()) {
			if (bucket && p.bucketName !== bucket) continue;
			if (subBucket && p.subBucketName !== subBucket) continue;
			const isDuplicate = (nameCount.get(p.name) ?? 0) > 1;
			const val = isDuplicate ? `${p.bucketName}/${p.name}` : p.name;
			availableOptions.add(val);
		}
	} else if (options.canonicalKey === 'epic') {
		const nameCount = new Map<string, number>();
		for (const e of hierarchy.epicsById.values()) {
			nameCount.set(e.name, (nameCount.get(e.name) ?? 0) + 1);
		}
		if (project) {
			const projectObj = Array.from(hierarchy.projectsById.values()).find(p => p.name === project || project.endsWith('/' + p.name));
			if (projectObj) {
				for (const ep of projectObj.epics) {
					const isDuplicate = (nameCount.get(ep.name) ?? 0) > 1;
					const val = isDuplicate ? `${ep.projectName}/${ep.name}` : ep.name;
					availableOptions.add(val);
				}
			}
		}
		for (const e of hierarchy.epicsById.values()) {
			if (project && e.projectName !== project && !project.endsWith('/' + e.projectName)) continue;
			if (bucket && e.bucketName !== bucket) continue;
			if (subBucket && e.subBucketName !== subBucket) continue;
			const isDuplicate = (nameCount.get(e.name) ?? 0) > 1;
			const val = isDuplicate ? `${e.projectName}/${e.name}` : e.name;
			availableOptions.add(val);
		}
	}

	const allOptions = Array.from(availableOptions).sort((a, b) => a.localeCompare(b));
	let matches = allOptions;
	let activeIndex = 0;

	const selectOption = (value: string) => {
		completed = true;
		options.onSelect(value);
		close();
	};

	const updateVisibleActiveItem = () => {
		const items = Array.from(list.querySelectorAll<HTMLElement>('.operon-status-dropdown-item'));
		for (const item of items) {
			const itemIndex = Number(item.dataset.index ?? '-1');
			item.classList.toggle('is-active', itemIndex === activeIndex);
		}
		// ensure visible
		if (matches.length > 0 && activeIndex >= 0) {
			const activeEl = list.children[activeIndex] as HTMLElement;
			if (activeEl) {
				const containerRect = list.getBoundingClientRect();
				const itemRect = activeEl.getBoundingClientRect();
				if (itemRect.top < containerRect.top) {
					list.scrollTop -= containerRect.top - itemRect.top;
				} else if (itemRect.bottom > containerRect.bottom) {
					list.scrollTop += itemRect.bottom - containerRect.bottom;
				}
			}
		}
	};

	const render = () => {
		list.replaceChildren();
		if (matches.length === 0) return;
		matches.forEach((match, index) => {
			const item = list.createEl('button');
			item.type = 'button';
			item.className = 'operon-status-dropdown-item';
			item.dataset.index = String(index);
			if (index === activeIndex) item.classList.add('is-active');

			const label = item.createSpan('operon-status-item-name');
			label.textContent = match;

			item.addEventListener('mouseenter', () => {
				if (activeIndex !== index) {
					activeIndex = index;
					updateVisibleActiveItem();
				}
			});
			item.addEventListener('mousedown', event => {
				event.preventDefault();
				selectOption(match);
			});

			list.appendChild(item);
		});
		updateVisibleActiveItem();
	};

	const updateMatches = (query: string) => {
		const q = query.toLowerCase().trim();
		if (!q) {
			matches = allOptions;
		} else {
			matches = allOptions.filter(opt => opt.toLowerCase().includes(q));
		}
		const selectedIndex = matches.findIndex(opt => opt === options.value);
		activeIndex = selectedIndex >= 0 ? selectedIndex : 0;
		render();
	};

	input.addEventListener('input', () => updateMatches(input.value));
	input.addEventListener('keydown', event => {
		if (matches.length === 0) return;
		if (event.key === 'ArrowDown') {
			event.preventDefault();
			activeIndex = Math.min(activeIndex + 1, matches.length - 1);
			updateVisibleActiveItem();
		} else if (event.key === 'ArrowUp') {
			event.preventDefault();
			activeIndex = Math.max(activeIndex - 1, 0);
			updateVisibleActiveItem();
		} else if (event.key === 'Enter') {
			event.preventDefault();
			if (matches[activeIndex]) selectOption(matches[activeIndex]);
		}
	});
	updateMatches(input.value);
	requestFloatingInputFocus(input);
	return close;
}
