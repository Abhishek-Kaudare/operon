import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ProjectIndexer } from '../src/indexer/project-indexer.js';
import { parseTaskLine } from '../src/core/parser.js';
import { TFile, TFolder } from 'obsidian';

const testRun = (async () => {
	await describe('Project Hierarchy and Parsing', async () => {
		await test('ProjectIndexer should maintain hierarchy correctly', async () => {
			const indexer = new ProjectIndexer();
			
			const projectMd1 = { path: 'Projects/Personal/MyProject/project.md', name: 'project.md' } as any as TFile;
			const personalProjectFolder = { path: 'Projects/Personal/MyProject', name: 'MyProject', children: [projectMd1] } as any as TFolder;

			const personalFolder = { path: 'Projects/Personal', name: 'Personal', children: [personalProjectFolder] } as any as TFolder;
			
			const epicMd = { path: 'Projects/Work/Website/V2/epic.md', name: 'epic.md' } as any as TFile;
			const v2EpicFolder = { path: 'Projects/Work/Website/V2', name: 'V2', children: [epicMd] } as any as TFolder;
			
			const projectMd2 = { path: 'Projects/Work/Website/project.md', name: 'project.md' } as any as TFile;
			const websiteFolder = { path: 'Projects/Work/Website', name: 'Website', children: [projectMd2, v2EpicFolder] } as any as TFolder;
			
			const workFolder = { path: 'Projects/Work', name: 'Work', children: [websiteFolder] } as any as TFolder;
			
			const projectsFolder = { path: 'Projects', name: 'Projects', children: [personalFolder, workFolder] } as any as TFolder;

			const mockApp = {
				vault: {
					getAbstractFileByPath: (path: string) => {
						if (path === 'Projects/' || path === 'Projects') return projectsFolder;
						return null;
					}
				},
				metadataCache: {
					getFileCache: () => null
				}
			};

			// @ts-ignore
			await indexer.buildIndex(mockApp, 'Projects/');
			const hierarchy = indexer.getHierarchy();
			
			assert.equal(hierarchy.epicsById.size, 1);
			const v2Epic = Array.from(hierarchy.epicsById.values())[0];
			assert.equal(v2Epic.name, 'V2');
			
			assert.equal(hierarchy.projectsById.size, 2);
			const personalProject = Array.from(hierarchy.projectsById.values()).find(p => p.name === 'MyProject');
			const websiteProject = Array.from(hierarchy.projectsById.values()).find(p => p.name === 'Website');
			
			assert.ok(personalProject);
			assert.ok(websiteProject);
			assert.deepEqual(websiteProject.epics.map(e => e.name), ['V2']);
			
			assert.equal(hierarchy.buckets.length, 2); 
			const workBucket = hierarchy.buckets.find(b => b.name === 'Work');
			assert.ok(workBucket);
			assert.ok(workBucket.projects.find(p => p.name === 'Website'));
		});

		await test('parser.ts should extract project hierarchy fields', () => {
			const line = '- [ ] My task #project/Website #epic/V2 #bucket/Work #sub-bucket/Frontend';
			const parsed = parseTaskLine(line, 0, 'some-file.md', []);
			
			assert.ok(parsed);
			const fields = parsed.fields;
			
			const projectField = fields.find(f => f.key === 'project');
			assert.equal(projectField?.value, 'Website');
			
			const epicField = fields.find(f => f.key === 'epic');
			assert.equal(epicField?.value, 'V2');
			
			const bucketField = fields.find(f => f.key === 'bucket');
			assert.equal(bucketField?.value, 'Work');
			
			const subBucketField = fields.find(f => f.key === 'subBucket');
			assert.equal(subBucketField?.value, 'Frontend');
		});
	});
})();

// @ts-ignore
globalThis.__operonProjectHierarchyTestRun = testRun;
