/** Public surface for the API and admin services (read models live in the same database). */
export { loadConfig, loadDeployment, deploymentSchema } from './config.js';
export type { Config, Deployment } from './config.js';
export { contractSet } from './contracts.js';
export type { ContractSet } from './contracts.js';
export { openDatabase, migrate } from './db/client.js';
export type { Database, Db } from './db/client.js';
export * as schema from './db/schema.js';
export { Indexer, rebuildProjections } from './indexer.js';
export { Metrics } from './metrics.js';
export { RpcSource } from './source.js';
export type { LogSource } from './source.js';
