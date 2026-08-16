import { setIcon } from 'obsidian';
import { composeStatusValue, getNextWorkflowStatus, Pipeline } from '../../types/pipeline';
import {
	resolveConfiguredStatusIdentity,
	type WorkflowStatusIdentityIndex,
} from '../../core/workflow-status-identity';

export interface StatusHoverDropdownOptions {
	operonId: string;
	currentStatusValue?: string;
	pipelines: Pipeline[];
	workflowStatusIdentityIndex: WorkflowStatusIdentityIndex;
	updateStatus: (nextValue: string) => void;
}

export function bindStatusHoverDropdown(
	chip: HTMLElement,
	options: StatusHoverDropdownOptions,
): void {
	const openDropdown = () => {
		if ((window as any).activeOperonStatusDropdown) {
			if ((window as any).activeOperonStatusDropdownAnchor === chip) {
				return; // Already open for this chip
			}
			(window as any).activeOperonStatusDropdown.remove();
			(window as any).activeOperonStatusDropdown = null;
			(window as any).activeOperonStatusDropdownAnchor = null;
		}

		const doc = chip.ownerDocument || document;
		const dropdown = doc.createElement('div');
		dropdown.className = 'operon-status-hover-dropdown';

		const resolution = resolveConfiguredStatusIdentity(
			options.currentStatusValue,
			options.workflowStatusIdentityIndex,
		);
		let activePipeline: Pipeline | undefined = undefined;
		if (resolution.kind === 'configured') {
			activePipeline = resolution.pipeline;
		} else if (options.pipelines.length > 0) {
			activePipeline = options.pipelines[0];
		}

		if (activePipeline) {
			for (const status of activePipeline.statuses) {
				const item = doc.createElement('button');
				item.type = 'button';
				item.className = 'operon-status-dropdown-item';

				const logoEl = doc.createElement('span');
				logoEl.className = 'operon-status-logo';
				if (status.pipelineStatusIcon) {
					setIcon(logoEl, status.pipelineStatusIcon);
				} else {
					setIcon(logoEl, 'circle');
				}
				logoEl.style.color = status.color;
				item.appendChild(logoEl);

				const labelEl = doc.createElement('span');
				labelEl.className = 'operon-status-item-name';
				labelEl.textContent = status.label;
				item.appendChild(labelEl);

				const selectItem = (e: Event) => {
					e.preventDefault();
					e.stopPropagation();
					const nextValue = composeStatusValue(activePipeline!.name, status.label);
					options.updateStatus(nextValue);
					closeDropdown();
				};
				item.addEventListener('mousedown', selectItem);
				item.addEventListener('click', selectItem);
				dropdown.appendChild(item);
			}
		}

		doc.body.appendChild(dropdown);
		(window as any).activeOperonStatusDropdown = dropdown;
		(window as any).activeOperonStatusDropdownAnchor = chip;

		const rect = chip.getBoundingClientRect();
		dropdown.style.left = `${rect.left}px`;
		dropdown.style.top = `${rect.bottom + 4}px`;

		let timeoutId: any = null;
		const startCloseTimeout = () => {
			timeoutId = setTimeout(() => {
				closeDropdown();
			}, 200);
		};
		const clearCloseTimeout = () => {
			if (timeoutId) {
				clearTimeout(timeoutId);
				timeoutId = null;
			}
		};

		chip.addEventListener('mouseleave', startCloseTimeout);
		chip.addEventListener('mouseenter', clearCloseTimeout);
		dropdown.addEventListener('mouseleave', startCloseTimeout);
		dropdown.addEventListener('mouseenter', clearCloseTimeout);

		const docClickListener = (e: MouseEvent) => {
			if (!dropdown.contains(e.target as Node) && !chip.contains(e.target as Node)) {
				closeDropdown();
			}
		};
		doc.addEventListener('mousedown', docClickListener, true);
		doc.addEventListener('click', docClickListener, true);

		const closeDropdown = () => {
			dropdown.remove();
			if ((window as any).activeOperonStatusDropdown === dropdown) {
				(window as any).activeOperonStatusDropdown = null;
				(window as any).activeOperonStatusDropdownAnchor = null;
			}
			doc.removeEventListener('mousedown', docClickListener, true);
			doc.removeEventListener('click', docClickListener, true);
			chip.removeEventListener('mouseleave', startCloseTimeout);
			chip.removeEventListener('mouseenter', clearCloseTimeout);
			dropdown.removeEventListener('mouseleave', startCloseTimeout);
			dropdown.removeEventListener('mouseenter', clearCloseTimeout);
		};
	};

	chip.addEventListener('mouseenter', () => {
		openDropdown();
	});

	const setNextPipelineStatus = (e: Event) => {
		e.preventDefault();
		e.stopPropagation();
		if ((window as any).activeOperonStatusDropdown) {
			(window as any).activeOperonStatusDropdown.remove();
			(window as any).activeOperonStatusDropdown = null;
			(window as any).activeOperonStatusDropdownAnchor = null;
		}
		const cycled = getNextWorkflowStatus(options.pipelines, options.currentStatusValue);
		let nextValue = cycled?.value;
		if (!nextValue && options.pipelines.length > 0 && options.pipelines[0].statuses.length > 0) {
			nextValue = composeStatusValue(options.pipelines[0].name, options.pipelines[0].statuses[0].label);
		}
		if (nextValue) {
			options.updateStatus(nextValue);
		}
	};
	chip.addEventListener('mousedown', setNextPipelineStatus);
	chip.addEventListener('click', setNextPipelineStatus);
}
