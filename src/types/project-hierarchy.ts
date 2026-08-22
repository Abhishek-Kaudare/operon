export interface Bucket {
	/** Unique identifier (usually the relative folder path from vault root) */
	id: string;
	/** Display name of the bucket */
	name: string;
	/** Sub-buckets inside this bucket */
	subBuckets: Bucket[];
	/** Projects directly inside this bucket */
	projects: Project[];
	/** Vault path to this bucket folder */
	path: string;
}

export interface Project {
	/** Unique identifier (usually the relative folder path) */
	id: string;
	/** Display name of the project */
	name: string;
	/** The ID of the parent Bucket */
	bucketId: string;
	/** Display name of the parent Bucket */
	bucketName: string;
	/** Display name of the parent Sub-bucket (if applicable) */
	subBucketName?: string;
	/** Vault path to the project folder */
	path: string;
	/** Epics belonging to this project */
	epics: Epic[];
	/** Optional Project Serial Prefix parsed from project.md frontmatter */
	serialScope?: string;
}

export interface Epic {
	/** Unique identifier (usually the relative folder path) */
	id: string;
	/** Display name of the epic */
	name: string;
	/** The ID of the parent Project */
	projectId: string;
	/** Display name of the parent Bucket */
	bucketName: string;
	/** Display name of the parent Sub-bucket (if applicable) */
	subBucketName?: string;
	/** Display name of the parent Project */
	projectName: string;
	/** Vault path to the epic folder */
	path: string;
	/** Optional Project Serial Prefix parsed from epic.md frontmatter */
	serialScope?: string;
}

export interface ProjectHierarchy {
	buckets: Bucket[];
	/** Flat map of all projects for fast lookup */
	projectsById: Map<string, Project>;
	/** Flat map of all epics for fast lookup */
	epicsById: Map<string, Epic>;
}
