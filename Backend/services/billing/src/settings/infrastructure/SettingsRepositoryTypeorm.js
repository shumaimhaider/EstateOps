import { DEFAULT_SETTINGS } from '../domain/settings.js';

export class SettingsRepositoryTypeorm {
  constructor(manager) {
    this.manager = manager;
  }

  async get(tenantId) {
    const rows = await this.manager.query(
      'SELECT grace_days, escalation_missed FROM billing.collection_setting WHERE tenant_id = $1',
      [tenantId],
    );
    return rows[0]
      ? { graceDays: rows[0].grace_days, escalationMissed: rows[0].escalation_missed }
      : { ...DEFAULT_SETTINGS };
  }

  async ensure(tenantId, defaults) {
    await this.manager.query(
      'INSERT INTO billing.collection_setting (tenant_id, grace_days, escalation_missed) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
      [tenantId, defaults.graceDays, defaults.escalationMissed],
    );
  }

  async put(tenantId, s, updatedBy) {
    await this.manager.query(
      `INSERT INTO billing.collection_setting (tenant_id, grace_days, escalation_missed, updated_by_name) VALUES ($1, $2, $3, $4)
       ON CONFLICT (tenant_id) DO UPDATE SET grace_days = EXCLUDED.grace_days, escalation_missed = EXCLUDED.escalation_missed,
         updated_by_name = EXCLUDED.updated_by_name, updated_at = now()`,
      [tenantId, s.graceDays, s.escalationMissed, updatedBy],
    );
    return { graceDays: s.graceDays, escalationMissed: s.escalationMissed };
  }
}
