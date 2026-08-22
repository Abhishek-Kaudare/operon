import { App, TAbstractFile, TFile, TFolder, normalizePath, parseFrontMatterEntry } from 'obsidian';
import type { Bucket, Epic, Project, ProjectHierarchy } from '../types/project-hierarchy';

export class ProjectIndexer {
	private hierarchy: ProjectHierarchy = {
		buckets: [],
		projectsById: new Map(),
		epicsById: new Map(),
	};

	public getHierarchy(): ProjectHierarchy {
		return this.hierarchy;
	}

	public async buildIndex(app: App, basePath: string): Promise<void> {
		this.hierarchy = {
			buckets: [],
			projectsById: new Map(),
			epicsById: new Map(),
		};

		const cleanPath = normalizePath(basePath || 'Projects');
		const rootFolder = app.vault.getAbstractFileByPath(cleanPath);
		if (!rootFolder || !(rootFolder instanceof TFolder)) {
			return;
		}

		for (const child of rootFolder.children) {
			if (child instanceof TFolder) {
				const bucket = await this.scanBucket(app, child, '', child.name);
				if (bucket) {
					this.hierarchy.buckets.push(bucket);
				}
			}
		}
	}

	public getContextForTask(filePath: string): Record<string, string> | undefined {
		// Longest path match wins, so check epics first, then projects, then subBuckets, then buckets
		for (const epic of this.hierarchy.epicsById.values()) {
			if (filePath.startsWith(epic.path + '/') || filePath === epic.path) {
				const context: Record<string, string> = {
					bucket: epic.bucketName,
					project: epic.projectName,
					epic: epic.name,
				};
				if (epic.subBucketName) context.subBucket = epic.subBucketName;
				return context;
			}
		}

		for (const project of this.hierarchy.projectsById.values()) {
			if (filePath.startsWith(project.path + '/') || filePath === project.path) {
				const context: Record<string, string> = {
					bucket: project.bucketName,
					project: project.name,
				};
				if (project.subBucketName) context.subBucket = project.subBucketName;
				return context;
			}
		}
		
		// For buckets/sub-buckets, we only assign bucket/subBucket fields if they are not in a project
		let bestContext: Record<string, string> | undefined = undefined;
		let bestLength = -1;

		const checkBucket = (b: Bucket, bName: string, sbName?: string) => {
			if (filePath.startsWith(b.path + '/') || filePath === b.path) {
				if (b.path.length > bestLength) {
					bestLength = b.path.length;
					bestContext = { bucket: bName };
					if (sbName) bestContext.subBucket = sbName;
				}
			}
			for (const sub of b.subBuckets) {
				checkBucket(sub, bName, sub.name);
			}
		};

		for (const bucket of this.hierarchy.buckets) {
			checkBucket(bucket, bucket.name);
		}

		return bestContext;
	}

	private async scanBucket(app: App, folder: TFolder, parentPath: string, bucketName: string, subBucketName?: string): Promise<Bucket | null> {
		const bucket: Bucket = {
			id: folder.path,
			name: folder.name,
			path: folder.path,
			subBuckets: [],
			projects: [],
		};

		for (const child of folder.children) {
			if (child instanceof TFolder) {
				// Check if it's a project (contains project.md or <FolderName>.md)
				const projectFile = child.children.find(c => c instanceof TFile && (c.name === 'project.md' || c.name === `${child.name}.md`)) as TFile | undefined;
				
				if (projectFile) {
					const project = await this.scanProject(app, child, bucket.id, projectFile, bucketName, subBucketName);
					bucket.projects.push(project);
					this.hierarchy.projectsById.set(project.id, project);
				} else {
					// It's a sub-bucket
					const subBucket = await this.scanBucket(app, child, folder.path, bucketName, child.name);
					if (subBucket) {
						bucket.subBuckets.push(subBucket);
					}
				}
			}
		}

		return bucket;
	}

	private async scanProject(app: App, folder: TFolder, bucketId: string, projectFile: TFile, bucketName: string, subBucketName?: string): Promise<Project> {
		const cache = app.metadataCache.getFileCache(projectFile);
		const serialScope = cache?.frontmatter ? parseFrontMatterEntry(cache.frontmatter, 'Project Serial') : undefined;

		const project: Project = {
			id: folder.path,
			name: folder.name,
			bucketId,
			bucketName,
			subBucketName,
			path: folder.path,
			epics: [],
			serialScope: typeof serialScope === 'string' ? serialScope : undefined,
		};

		for (const child of folder.children) {
			if (child instanceof TFolder) {
				const epicFile = child.children.find(c => c instanceof TFile && (c.name === 'epic.md' || c.name === `${child.name}.md`)) as TFile | undefined;
				if (epicFile) {
					const epic = await this.scanEpic(app, child, project.id, epicFile, bucketName, subBucketName, project.name);
					project.epics.push(epic);
					this.hierarchy.epicsById.set(epic.id, epic);
				}
			}
		}

		return project;
	}

	private async scanEpic(app: App, folder: TFolder, projectId: string, epicFile: TFile, bucketName: string, subBucketName: string | undefined, projectName: string): Promise<Epic> {
		const cache = app.metadataCache.getFileCache(epicFile);
		const serialScope = cache?.frontmatter ? parseFrontMatterEntry(cache.frontmatter, 'Project Serial') : undefined;

		return {
			id: folder.path,
			name: folder.name,
			projectId,
			bucketName,
			subBucketName,
			projectName,
			path: folder.path,
			serialScope: typeof serialScope === 'string' ? serialScope : undefined,
		};
	}
}
