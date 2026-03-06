import { initDb, closeDb } from './database.js';
import { presetRoles } from '../services/preset-roles.js';
import { roleRepo } from './repository.js';
import { logger } from '../logger.js';

async function init() {
  logger.info('Initializing database...');
  await initDb();

  // Load preset roles if no roles exist
  const existingRoles = roleRepo.list();
  if (existingRoles.length === 0) {
    logger.info('Loading preset roles...');
    for (const role of presetRoles) {
      roleRepo.create(role);
      logger.info(`Created preset role: ${role.name}`);
    }
  } else {
    logger.info(`${existingRoles.length} roles already exist, skipping presets.`);
  }

  closeDb();
  logger.info('Database initialization complete.');
}

init().catch(console.error);
