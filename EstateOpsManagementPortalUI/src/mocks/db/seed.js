import { faker } from '@faker-js/faker';
import { createClock, SIM_START } from '../engine/clock.js';
import { layoutProject } from './layout.js';
import { seedSales } from './seedSales.js';

/**
 * Deterministic seed (fixed faker seed). Rows are stored DTO-shaped (snake_case, money in
 * minor units). Slice 1 seeds tenants, staff, projects, phases, blocks, floors and units;
 * later slices extend this file.
 */
const SEED = 20261021;
const WEIGHTS = [
  { value: 'available', weight: 55 },
  { value: 'held', weight: 5 },
  { value: 'booked', weight: 20 },
  { value: 'sold', weight: 15 },
  { value: 'blocked', weight: 5 },
];
const CHAIN = {
  held: ['held'],
  booked: ['held', 'booked'],
  sold: ['held', 'booked', 'sold'],
  blocked: ['blocked'],
  available: [],
};
const ROLES = [
  'owner',
  'admin',
  'sales_manager',
  'sales_agent',
  'finance',
  'inventory_manager',
  'dealer_manager',
  'support',
  'marketing',
  'auditor',
];
const FACINGS = ['North', 'South', 'East', 'West'];
const VIEWS = ['Park', 'Road', 'Garden', 'City', null];

/** Each block describes what it contains; `rate` is major currency per area unit. */
const TENANTS = [
  {
    slug: 'pk',
    name: 'Zameen Developers',
    currency: 'PKR',
    locale: 'en-PK',
    time_zone: 'Asia/Karachi',
    area_unit: 'marla',
    projects: [
      {
        name: 'Gulberg Greens',
        location: 'Lahore',
        kind: 'plot_society',
        phases: ['Phase 1', 'Phase 2'],
        blocks: ['A', 'B', 'C', 'D'].map((l, i) => ({
          name: `Block ${l}`,
          kind: 'plot_block',
          phase: i < 2 ? 0 : 1,
          unitKind: 'plot',
          prefix: l,
          count: 40,
          choices: [
            { value: 5, unit: 'marla', rate: 3_000_000 },
            { value: 10, unit: 'marla', rate: 2_800_000 },
            { value: 1, unit: 'kanal', rate: 55_000_000 },
          ],
        })),
      },
      {
        name: 'Skyline Tower',
        location: 'Karachi',
        kind: 'tower',
        phases: ['Phase 1'],
        blocks: [flatBlock('Tower A', 'T', 20, 8, 'sq_ft', 22_000)],
      },
      {
        name: 'Maple Boulevard',
        location: 'Islamabad',
        kind: 'mixed',
        phases: ['Phase 1'],
        blocks: [
          {
            name: 'Commercial Block',
            kind: 'plot_block',
            phase: 0,
            unitKind: 'shop',
            prefix: 'S',
            count: 30,
            choices: [
              { value: 300, unit: 'sq_ft', rate: 60_000 },
              { value: 500, unit: 'sq_ft', rate: 55_000 },
            ],
          },
          {
            name: 'Villa Block',
            kind: 'plot_block',
            phase: 0,
            unitKind: 'villa',
            prefix: 'V',
            count: 20,
            choices: [
              { value: 7, unit: 'marla', rate: 9_000_000 },
              { value: 10, unit: 'marla', rate: 8_500_000 },
            ],
          },
          flatBlock('Residence B', 'R', 5, 4, 'sq_ft', 28_000),
        ],
      },
    ],
  },
  {
    slug: 'ae',
    name: 'Desert Rose Properties',
    currency: 'AED',
    locale: 'en-AE',
    time_zone: 'Asia/Dubai',
    area_unit: 'sq_ft',
    projects: [
      {
        name: 'Marina Heights',
        location: 'Dubai Marina',
        kind: 'tower',
        phases: ['Phase 1'],
        blocks: [flatBlock('Tower 1', 'M', 20, 8, 'sq_ft', 1_900)],
      },
      {
        name: 'Palm Residences',
        location: 'Palm Jumeirah',
        kind: 'plot_society',
        phases: ['Phase 1', 'Phase 2'],
        blocks: ['A', 'B'].map((l, i) => ({
          name: `Cluster ${l}`,
          kind: 'plot_block',
          phase: i,
          unitKind: 'villa',
          prefix: l,
          count: 50,
          choices: [
            { value: 3500, unit: 'sq_ft', rate: 1_600 },
            { value: 5000, unit: 'sq_ft', rate: 1_450 },
          ],
        })),
      },
      {
        name: 'Creek Mixed',
        location: 'Dubai Creek',
        kind: 'mixed',
        phases: ['Phase 1'],
        blocks: [
          {
            name: 'Retail Podium',
            kind: 'plot_block',
            phase: 0,
            unitKind: 'shop',
            prefix: 'P',
            count: 30,
            choices: [{ value: 600, unit: 'sq_ft', rate: 2_400 }],
          },
          flatBlock('Residence C', 'C', 5, 4, 'sq_ft', 2_100),
        ],
      },
    ],
  },
];

function flatBlock(name, prefix, floors, perFloor, unit, rate) {
  return {
    name,
    kind: 'building',
    phase: 0,
    unitKind: 'flat',
    prefix,
    floors,
    perFloor,
    unit,
    rate,
  };
}

const iso = (d) => d.toISOString();
const plusMinutes = (isoStr, m) => new Date(Date.parse(isoStr) + m * 60_000).toISOString();

function pickStatus() {
  return faker.helpers.weightedArrayElement(WEIGHTS);
}

function buildHistory(status, createdAt, ownerUser) {
  const history = [
    { status: 'available', changed_by: null, changed_by_name: null, changed_at: createdAt },
  ];
  CHAIN[status].forEach((s, i) => {
    const staff = s === 'blocked';
    history.push({
      status: s,
      changed_by: staff ? ownerUser.id : null,
      changed_by_name: staff ? ownerUser.name : null,
      changed_at: plusMinutes(createdAt, 60 * 24 * (i + 1)),
    });
  });
  return history;
}

function seedTenant(db, def) {
  const tenant = {
    id: faker.string.uuid(),
    slug: def.slug,
    name: def.name,
    currency: def.currency,
    locale: def.locale,
    time_zone: def.time_zone,
    area_unit: def.area_unit,
  };
  db.tenants.push(tenant);

  const staff = ROLES.map((role) => ({
    id: faker.string.uuid(),
    tenant_id: tenant.id,
    name: faker.person.fullName(),
    email: `${role.replace('_', '.')}@${def.slug}.estateops.test`,
    role,
  }));
  db.users.push(...staff);
  const owner = staff[0];

  const projectCreated = iso(faker.date.between({ from: '2026-03-01', to: '2026-03-31' }));
  for (const pdef of def.projects) {
    const project = {
      id: faker.string.uuid(),
      tenant_id: tenant.id,
      name: pdef.name,
      location: pdef.location,
      kind: pdef.kind,
      created_at: projectCreated,
      updated_at: projectCreated,
      created_by: owner.id,
    };
    db.projects.push(project);
    const phases = pdef.phases.map((name) => {
      const phase = { id: faker.string.uuid(), tenant_id: tenant.id, project_id: project.id, name };
      db.phases.push(phase);
      return phase;
    });
    for (const bdef of pdef.blocks) {
      const block = {
        id: faker.string.uuid(),
        tenant_id: tenant.id,
        project_id: project.id,
        phase_id: phases[bdef.phase].id,
        name: bdef.name,
        kind: bdef.kind,
      };
      db.blocks.push(block);
      seedBlockUnits(db, { tenant, owner, project, phase: phases[bdef.phase], block, bdef });
    }
    const blocks = db.blocks.filter((b) => b.project_id === project.id);
    const floorsById = new Map(db.floors.map((f) => [f.id, f]));
    const unitsByBlock = new Map(
      blocks.map((b) => [b.id, db.units.filter((u) => u.block_id === b.id)]),
    );
    layoutProject(blocks, unitsByBlock, floorsById);
  }
}

function seedBlockUnits(db, ctx) {
  const { bdef } = ctx;
  if (bdef.floors) {
    for (let n = 1; n <= bdef.floors; n += 1) {
      const floor = {
        id: faker.string.uuid(),
        tenant_id: ctx.tenant.id,
        block_id: ctx.block.id,
        number: n,
        label: `Floor ${n}`,
      };
      db.floors.push(floor);
      for (let i = 1; i <= bdef.perFloor; i += 1) {
        const area = faker.number.int({ min: 13, max: 36 }) * 50;
        const premium = 1 + n * 0.005;
        addUnit(db, ctx, {
          floor,
          unit_no: `${bdef.prefix}${n}${String(i).padStart(2, '0')}`,
          kind: 'flat',
          area: { value: area, unit: bdef.unit },
          bedrooms: Math.min(3, Math.ceil(area / 600)),
          priceMajor: bdef.rate * area * premium,
        });
      }
    }
    return;
  }
  for (let i = 1; i <= bdef.count; i += 1) {
    const choice = faker.helpers.arrayElement(bdef.choices);
    addUnit(db, ctx, {
      floor: null,
      unit_no: `${bdef.prefix}-${String(i).padStart(2, '0')}`,
      kind: bdef.unitKind,
      area: { value: choice.value, unit: choice.unit },
      bedrooms: bdef.unitKind === 'villa' ? faker.number.int({ min: 3, max: 5 }) : null,
      priceMajor: choice.rate * choice.value,
    });
  }
}

function addUnit(db, ctx, spec) {
  const corner = faker.datatype.boolean({ probability: 0.15 });
  const major = Math.round(spec.priceMajor * (corner ? 1.08 : 1));
  const status = pickStatus();
  const createdAt = iso(faker.date.between({ from: '2026-04-21', to: '2026-05-15' }));
  const history = buildHistory(status, createdAt, ctx.owner);
  db.units.push({
    id: faker.string.uuid(),
    tenant_id: ctx.tenant.id,
    project_id: ctx.project.id,
    phase_id: ctx.phase.id,
    block_id: ctx.block.id,
    floor_id: spec.floor?.id ?? null,
    unit_no: spec.unit_no,
    kind: spec.kind,
    area_value: spec.area.value,
    area_unit: spec.area.unit,
    bedrooms: spec.bedrooms,
    facing: faker.helpers.arrayElement(FACINGS),
    view: faker.helpers.arrayElement(VIEWS),
    corner,
    parking: spec.kind === 'shop' ? 0 : faker.number.int({ min: 1, max: 2 }),
    attributes: {},
    status,
    list_price: major * 100,
    currency: ctx.tenant.currency,
    geometry: null,
    booking_id: null,
    status_history: history,
    created_at: createdAt,
    updated_at: history.at(-1).changed_at,
    created_by: ctx.owner.id,
  });
}

export function buildSeed(seedVersion) {
  faker.seed(SEED);
  const db = {
    seedVersion,
    clock: createClock(),
    settings: { latencyMs: [200, 800], failureRate: 0, forcedErrors: {}, escalationMissed: 3 },
    tenants: [],
    users: [],
    projects: [],
    phases: [],
    blocks: [],
    floors: [],
    units: [],
    customers: [],
    bookings: [],
    installments: [],
    notices: [],
    loginHistory: [],
    audit: [],
    idempotency: {},
  };
  for (const def of TENANTS) seedTenant(db, def);
  for (const tenant of db.tenants) {
    seedSales(
      db,
      tenant,
      db.users.find((u) => u.tenant_id === tenant.id && u.role === 'owner'),
    );
  }
  db.seededAt = SIM_START;
  return db;
}
