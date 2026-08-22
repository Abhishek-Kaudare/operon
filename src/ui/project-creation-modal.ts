import { App, Modal, Notice, Setting, TFile, TFolder, normalizePath } from 'obsidian';
import { ProjectIndexer } from '../indexer/project-indexer';
import { OperonSettings } from '../types/settings';

export class ProjectCreationModal extends Modal {
	private settings: OperonSettings;
	private projectIndexer: ProjectIndexer;
	private type: 'bucket' | 'subBucket' | 'project' | 'epic' = 'project';
	private name = '';
	private selectedBucket = '';
	private selectedSubBucket = '';
	private selectedProject = '';

	constructor(app: App, settings: OperonSettings, projectIndexer: ProjectIndexer) {
		super(app);
		this.settings = settings;
		this.projectIndexer = projectIndexer;
	}

	async onOpen(): Promise<void> {
		const basePath = normalizePath(this.settings.projectsBasePath || 'Projects');
		await this.projectIndexer.buildIndex(this.app, basePath);

		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl('h2', { text: 'Create Project Hierarchy Item' });

		const hierarchy = this.projectIndexer.getHierarchy();
		
		// Collect bucket names from hierarchy and vault folder structure
		const bucketNamesSet = new Set<string>();
		const rootFolder = this.app.vault.getAbstractFileByPath(basePath);
		if (rootFolder instanceof TFolder) {
			for (const child of rootFolder.children) {
				if (child instanceof TFolder) {
					bucketNamesSet.add(child.name);
				}
			}
		}
		for (const b of hierarchy.buckets) {
			bucketNamesSet.add(b.name);
		}
		const bucketNames = Array.from(bucketNamesSet);

		new Setting(contentEl)
			.setName('Type')
			.setDesc('Select the hierarchy level to create')
			.addDropdown(dropdown => {
				dropdown
					.addOption('bucket', 'Bucket (Top-level container)')
					.addOption('subBucket', 'Sub-Bucket (Nested container inside bucket)')
					.addOption('project', 'Project (Contains project dashboard)')
					.addOption('epic', 'Epic (Sub-container inside project)')
					.setValue(this.type)
					.onChange(val => {
						this.type = val as 'bucket' | 'subBucket' | 'project' | 'epic';
						this.onOpen();
					});
			});

		if (this.type === 'subBucket' || this.type === 'project' || this.type === 'epic') {
			new Setting(contentEl)
				.setName('Bucket')
				.setDesc('Parent bucket')
				.addDropdown(dropdown => {
					dropdown.addOption('', '-- Select Bucket --');
					for (const name of bucketNames) {
						dropdown.addOption(name, name);
					}
					dropdown.setValue(this.selectedBucket);
					dropdown.onChange(val => {
						this.selectedBucket = val;
						this.selectedSubBucket = '';
						if (this.type === 'epic' || this.type === 'project') this.onOpen();
					});
				});
		}

		if (this.type === 'project' && this.selectedBucket) {
			const subBucketNamesSet = new Set<string>();
			const bucketFolder = this.app.vault.getAbstractFileByPath(normalizePath(`${basePath}/${this.selectedBucket}`));
			if (bucketFolder instanceof TFolder) {
				for (const child of bucketFolder.children) {
					if (child instanceof TFolder && !child.children.some(c => c instanceof TFile && (c.name === 'project.md' || c.name === `${child.name}.md`))) {
						subBucketNamesSet.add(child.name);
					}
				}
			}
			const subBucketNames = Array.from(subBucketNamesSet);
			if (subBucketNames.length > 0) {
				new Setting(contentEl)
					.setName('Sub-Bucket (Optional)')
					.setDesc('Nested bucket container')
					.addDropdown(dropdown => {
						dropdown.addOption('', '-- None (Directly under Bucket) --');
						for (const name of subBucketNames) {
							dropdown.addOption(name, name);
						}
						dropdown.setValue(this.selectedSubBucket);
						dropdown.onChange(val => {
							this.selectedSubBucket = val;
						});
					});
			}
		}

		if (this.type === 'epic') {
			const projectNamesSet = new Set<string>();
			if (this.selectedBucket && rootFolder instanceof TFolder) {
				const bucketFolder = this.app.vault.getAbstractFileByPath(normalizePath(`${basePath}/${this.selectedBucket}`));
				if (bucketFolder instanceof TFolder) {
					for (const child of bucketFolder.children) {
						if (child instanceof TFolder) {
							// Check if child is project or sub-bucket containing projects
							projectNamesSet.add(child.name);
							for (const subChild of child.children) {
								if (subChild instanceof TFolder) {
									projectNamesSet.add(subChild.name);
								}
							}
						}
					}
				}
			}
			const currentBucket = hierarchy.buckets.find(b => b.name === this.selectedBucket);
			if (currentBucket) {
				for (const p of currentBucket.projects) {
					projectNamesSet.add(p.name);
				}
			}
			const projectNames = Array.from(projectNamesSet);

			new Setting(contentEl)
				.setName('Project')
				.setDesc('Parent project')
				.addDropdown(dropdown => {
					dropdown.addOption('', '-- Select Project --');
					for (const name of projectNames) {
						dropdown.addOption(name, name);
					}
					dropdown.setValue(this.selectedProject);
					dropdown.onChange(val => {
						this.selectedProject = val;
					});
				});
		}

		new Setting(contentEl)
			.setName('Name')
			.setDesc(`Name for the new ${this.type}`)
			.addText(text => {
				text.setValue(this.name).onChange(val => {
					this.name = val;
				});
			});

		new Setting(contentEl)
			.addButton(btn => {
				btn.setButtonText('Create')
					.setCta()
					.onClick(async () => {
						if (!this.name.trim()) {
							new Notice('Please enter a name.');
							return;
						}
						await this.createItem();
						this.close();
					});
			});
	}

	private async createItem(): Promise<void> {
		const basePath = this.settings.projectsBasePath || 'Projects/';
		const sanitizeName = (n: string) => n.trim().replace(/[\\/:*?"<>|]/g, '');
		const cleanName = sanitizeName(this.name);

		try {
			if (this.type === 'bucket') {
				const folderPath = normalizePath(`${basePath}/${cleanName}`);
				await this.app.vault.createFolder(folderPath);
				new Notice(`Created bucket: ${cleanName}`);
			} else if (this.type === 'subBucket') {
				if (!this.selectedBucket) {
					new Notice('Please select a parent bucket.');
					return;
				}
				const folderPath = normalizePath(`${basePath}/${this.selectedBucket}/${cleanName}`);
				await this.app.vault.createFolder(folderPath);
				new Notice(`Created sub-bucket: ${cleanName}`);
			} else if (this.type === 'project') {
				if (!this.selectedBucket) {
					new Notice('Please select a bucket.');
					return;
				}
				const relativePath = this.selectedSubBucket
					? `${this.selectedBucket}/${this.selectedSubBucket}/${cleanName}`
					: `${this.selectedBucket}/${cleanName}`;
				const folderPath = normalizePath(`${basePath}/${relativePath}`);
				await this.app.vault.createFolder(folderPath);
				const projectFilePath = normalizePath(`${folderPath}/${cleanName}.md`);
				const content = `\`\`\`operon-project\n\`\`\`\n\n## Tasks\n`;
				await this.app.vault.create(projectFilePath, content);
				new Notice(`Created project: ${cleanName}`);
			} else if (this.type === 'epic') {
				if (!this.selectedBucket || !this.selectedProject) {
					new Notice('Please select a bucket and project.');
					return;
				}
				const folderPath = normalizePath(`${basePath}/${this.selectedBucket}/${this.selectedProject}/${cleanName}`);
				await this.app.vault.createFolder(folderPath);
				const epicFilePath = normalizePath(`${folderPath}/${cleanName}.md`);
				const content = `\`\`\`operon-project\n\`\`\`\n\n## Tasks\n`;
				await this.app.vault.create(epicFilePath, content);
				new Notice(`Created epic: ${cleanName}`);
			}

			await this.projectIndexer.buildIndex(this.app, basePath);
		} catch (err: any) {
			new Notice(`Failed to create ${this.type}: ${err.message}`);
		}
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
	}
}
