import { App, MarkdownPostProcessorContext, MarkdownRenderChild, TFile, normalizePath } from 'obsidian';
import { OperonIndexer } from '../indexer/indexer';
import { IndexedTask } from '../types/fields';
import { ProjectIndexer } from '../indexer/project-indexer';
import type { Epic } from '../types/project-hierarchy';

export function createProjectVisualProcessor(
	app: App,
	indexer: OperonIndexer,
	projectIndexer: ProjectIndexer,
) {
	return async (source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
		const renderChild = new ProjectDashboardRenderChild(el, app, indexer, projectIndexer, ctx.sourcePath);
		ctx.addChild(renderChild);
	};
}

class ProjectDashboardRenderChild extends MarkdownRenderChild {
	private app: App;
	private indexer: OperonIndexer;
	private projectIndexer: ProjectIndexer;
	private sourcePath: string;

	private showAllEpics = false;
	private showAllOpenTasks = false;
	private showCompletedTasks = false;
	private expandedParentTaskIds = new Set<string>();

	constructor(
		containerEl: HTMLElement,
		app: App,
		indexer: OperonIndexer,
		projectIndexer: ProjectIndexer,
		sourcePath: string,
	) {
		super(containerEl);
		this.app = app;
		this.indexer = indexer;
		this.projectIndexer = projectIndexer;
		this.sourcePath = sourcePath;
	}

	onload(): void {
		this.renderDashboard();
		
		// Subscribe to index updates for real-time live updates
		const unsubscribe = this.indexer.subscribeIndexUpdates(() => {
			this.renderDashboard();
		});
		this.register(unsubscribe);
	}

	private formatStatusLabel(rawStatus: string | undefined): string {
		if (!rawStatus) return '';
		const parts = rawStatus.split('.');
		return parts[parts.length - 1];
	}

	private async renderDashboard(): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(this.sourcePath);
		if (!(file instanceof TFile)) return;

		let hierarchy = this.projectIndexer.getHierarchy();
		if (hierarchy.buckets.length === 0) {
			await this.projectIndexer.buildIndex(this.app, 'Projects');
			hierarchy = this.projectIndexer.getHierarchy();
		}

		const parentFolderPath = file.parent?.path || '';

		const project = Array.from(hierarchy.projectsById.values()).find(
			p => p.path === parentFolderPath || p.path === file.path || (file.name === 'project.md' && p.name === file.parent?.name)
		);

		const epic = Array.from(hierarchy.epicsById.values()).find(
			e => e.path === parentFolderPath || e.path === file.path || (file.name === 'epic.md' && e.name === file.parent?.name)
		);

		const isProject = !!project || file.name === 'project.md';
		const contextName = project?.name || epic?.name || file.parent?.name || file.basename;
		const childrenEpics: Epic[] = project?.epics || [];

		const allTasks = this.indexer.getAllTasks();
		const matchedTasks = allTasks.filter(t => {
			const path = t.primary?.filePath || '';
			const taskProj = (t.fieldValues['project'] ?? '').trim();
			const taskEpic = (t.fieldValues['epic'] ?? '').trim();
			if (project) {
				return taskProj === project.name ||
					taskProj === project.id ||
					taskProj === `${project.bucketName}/${project.name}` ||
					(project.subBucketName ? taskProj === `${project.bucketName}/${project.subBucketName}/${project.name}` : false) ||
					path.startsWith(project.path + '/');
			}
			if (epic) {
				return taskEpic === epic.name ||
					taskEpic === epic.id ||
					taskEpic === `${epic.projectName}/${epic.name}` ||
					taskEpic === `${epic.bucketName}/${epic.projectName}/${epic.name}` ||
					path.startsWith(epic.path + '/');
			}
			return taskProj === contextName || taskEpic === contextName;
		});

		const doneTasks = matchedTasks.filter(t => t.checkbox === 'done' || t.checkbox === 'cancelled' || t.fieldValues['status'] === 'Done' || t.fieldValues['status'] === 'Completed');
		const openTasks = matchedTasks.filter(t => !doneTasks.includes(t));

		const total = matchedTasks.length;
		const progress = total === 0 ? 0 : Math.round((doneTasks.length / total) * 100);

		this.containerEl.empty();
		const container = this.containerEl.createEl('div', { cls: 'operon-project-dashboard' });

		// Header
		const headerRow = container.createEl('div', { cls: 'operon-project-header-row' });
		headerRow.createEl('h3', { cls: 'operon-project-title', text: contextName });
		headerRow.createEl('span', {
			cls: `operon-project-badge ${isProject ? 'badge-project' : 'badge-epic'}`,
			text: isProject ? 'PROJECT' : 'EPIC',
		});

		// Progress
		const statsRow = container.createEl('div', { cls: 'operon-project-stats-row' });
		statsRow.createEl('span', { text: `${doneTasks.length} of ${total} tasks completed (${progress}%)` });

		const progressTrack = container.createEl('div', { cls: 'operon-project-progress-track' });
		const progressBar = progressTrack.createEl('div', { cls: 'operon-project-progress-fill' });
		progressBar.style.width = `${progress}%`;

		// Epics Accordion (If Project)
		if (isProject && childrenEpics.length > 0) {
			const epicsSection = container.createEl('div', { cls: 'operon-project-sub-section' });
			const epicsHeader = epicsSection.createEl('div', { cls: 'operon-project-section-header' });
			epicsHeader.createEl('h4', { text: `EPICS (${childrenEpics.length})` });

			if (childrenEpics.length > 3) {
				const toggleBtn = epicsHeader.createEl('button', {
					cls: 'operon-project-accordion-toggle',
					text: this.showAllEpics ? 'Collapse' : `Show All (${childrenEpics.length})`,
				});
				toggleBtn.addEventListener('click', (e) => {
					e.stopPropagation();
					this.showAllEpics = !this.showAllEpics;
					this.renderDashboard();
				});
			}

			const visibleEpics = this.showAllEpics ? childrenEpics : childrenEpics.slice(0, 3);
			const epicsGrid = epicsSection.createEl('div', { cls: 'operon-project-epics-grid' });
			for (const ep of visibleEpics) {
				const epicCard = epicsGrid.createEl('div', { cls: 'operon-project-epic-chip' });
				epicCard.createEl('span', { cls: 'epic-chip-icon', text: '⚡' });
				epicCard.createEl('span', { text: ep.name });
			}
		}

		// Open Tasks Accordion
		const tasksSection = container.createEl('div', { cls: 'operon-project-sub-section' });
		const tasksHeader = tasksSection.createEl('div', { cls: 'operon-project-section-header' });
		tasksHeader.createEl('h4', { text: `OPEN TASKS (${openTasks.length})` });

		if (openTasks.length > 3) {
			const toggleBtn = tasksHeader.createEl('button', {
				cls: 'operon-project-accordion-toggle',
				text: this.showAllOpenTasks ? 'Collapse' : `Show All (${openTasks.length})`,
			});
			toggleBtn.addEventListener('click', (e) => {
				e.stopPropagation();
				this.showAllOpenTasks = !this.showAllOpenTasks;
				this.renderDashboard();
			});
		}

		if (openTasks.length === 0) {
			tasksSection.createEl('div', { cls: 'operon-project-empty-tasks', text: 'No open tasks in this scope.' });
		} else {
			const visibleTasks = this.showAllOpenTasks ? openTasks : openTasks.slice(0, 3);
			this.renderTaskList(tasksSection, visibleTasks, matchedTasks, isProject);
		}

		// Completed Tasks Accordion (Collapsible)
		if (doneTasks.length > 0) {
			const doneSection = container.createEl('div', { cls: 'operon-project-sub-section' });
			const doneHeader = doneSection.createEl('div', { cls: 'operon-project-section-header' });
			doneHeader.createEl('h4', { text: `COMPLETED TASKS (${doneTasks.length})` });

			const toggleBtn = doneHeader.createEl('button', {
				cls: 'operon-project-accordion-toggle',
				text: this.showCompletedTasks ? 'Hide' : `Show (${doneTasks.length})`,
			});
			toggleBtn.addEventListener('click', (e) => {
				e.stopPropagation();
				this.showCompletedTasks = !this.showCompletedTasks;
				this.renderDashboard();
			});

			if (this.showCompletedTasks) {
				this.renderTaskList(doneSection, doneTasks, matchedTasks, isProject);
			}
		}
	}

	private renderTaskList(
		container: HTMLElement,
		tasksToRender: IndexedTask[],
		allScopeTasks: IndexedTask[],
		isProjectView: boolean,
	): void {
		const tasksList = container.createEl('div', { cls: 'operon-project-task-list' });

		// Separate root tasks and subtasks for hierarchy accordion
		const taskIdsInScope = new Set(allScopeTasks.map(t => t.operonId));
		const rootTasks = tasksToRender.filter(t => {
			const parentId = (t.fieldValues['parentTask'] ?? '').trim();
			return !parentId || !taskIdsInScope.has(parentId);
		});

		for (const task of rootTasks) {
			this.renderTaskItemRow(tasksList, task, allScopeTasks, isProjectView, 0);
		}
	}

	private renderTaskItemRow(
		container: HTMLElement,
		task: IndexedTask,
		allScopeTasks: IndexedTask[],
		isProjectView: boolean,
		depth: number,
	): void {
		const item = container.createEl('div', { cls: 'operon-project-task-item' });
		if (depth > 0) {
			item.style.marginLeft = `${depth * 18}px`;
		}

		// Hyperlink click to open file at position
		item.style.cursor = 'pointer';
		item.addEventListener('click', async (evt) => {
			evt.preventDefault();
			const path = task.primary?.filePath;
			if (!path) return;
			const targetFile = this.app.vault.getAbstractFileByPath(path);
			if (targetFile instanceof TFile) {
				const leaf = this.app.workspace.getLeaf(false);
				await leaf.openFile(targetFile, {
					eState: { line: (task.primary.lineNumber ?? 1) - 1 },
				});
			}
		});

		item.createEl('span', { cls: 'task-bullet', text: depth > 0 ? '↳' : '•' });
		item.createEl('span', { cls: 'task-desc', text: task.description });

		// Epic Chip (Requirement 2)
		const epicName = task.fieldValues['epic'];
		if (epicName) {
			const epicChip = item.createEl('span', { cls: 'operon-task-epic-chip' });
			epicChip.setText(`⚡ ${epicName}`);
		}

		// Status Tag (Requirement 3: Cleaned without pipeline name)
		const rawStatus = task.fieldValues['status'];
		if (rawStatus) {
			const cleanStatus = this.formatStatusLabel(rawStatus);
			item.createEl('span', { cls: 'task-status-tag', text: cleanStatus });
		}

		// Subtasks Accordion (Requirement 6)
		const subtasks = allScopeTasks.filter(
			child => (child.fieldValues['parentTask'] ?? '').trim() === task.operonId
		);

		if (subtasks.length > 0) {
			const isExpanded = this.expandedParentTaskIds.has(task.operonId);
			const subtaskToggle = item.createEl('button', {
				cls: 'operon-subtask-accordion-toggle',
				text: isExpanded ? `▲ ${subtasks.length}` : `▼ ${subtasks.length}`,
			});
			subtaskToggle.addEventListener('click', (e) => {
				e.stopPropagation();
				if (isExpanded) {
					this.expandedParentTaskIds.delete(task.operonId);
				} else {
					this.expandedParentTaskIds.add(task.operonId);
				}
				this.renderDashboard();
			});

			if (isExpanded) {
				const subtaskContainer = container.createEl('div', { cls: 'operon-project-subtask-container' });
				for (const sub of subtasks) {
					this.renderTaskItemRow(subtaskContainer, sub, allScopeTasks, isProjectView, depth + 1);
				}
			}
		}
	}
}
