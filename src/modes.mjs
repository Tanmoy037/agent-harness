import { HarnessError } from './util.mjs';

/**
 * Run modes. Nothing here is hardcoded into the pipeline: the person starting a run picks
 * each one (wizard, flags, or a saved project config) and the harness behaves accordingly.
 */

export const GATES = ['spec', 'design', 'architecture', 'golive'];

export const APPROVALS = {
  'design-golive': {
    label: 'Design + go-live',
    description: 'You approve the design direction before engineers build, and anything that deploys or publishes. The boss approves the rest.',
    gates: ['design', 'golive'],
  },
  'every-phase': {
    label: 'Every major phase',
    description: 'You approve the product spec, the design, the architecture and the release. Slowest, most control.',
    gates: ['spec', 'design', 'architecture', 'golive'],
  },
  'golive-only': {
    label: 'Only before go-live',
    description: 'The boss approves spec, design and architecture. You are asked only before something is deployed or published.',
    gates: ['golive'],
  },
  autonomous: {
    label: 'Fully autonomous',
    description: 'The boss makes every call from interview to deployment, including deploying.',
    gates: [],
  },
};

export const ACCESS = {
  guarded: {
    label: 'Guarded',
    description: 'Agents edit and run commands freely in the product folder. Pushing, publishing, deploying and reading credentials are blocked unless approved.',
  },
  bypass: {
    label: 'Full bypass',
    description: 'No permission checks. Fastest, never gets stuck, but an agent mistake can affect anything your user account can touch.',
  },
  strict: {
    label: 'Strict allowlist',
    description: 'Agents edit files but may only run commands from a fixed list (git, package managers, test runners). Safest; agents get blocked more often.',
  },
};

export const PRODUCT_TYPES = {
  'web-app': { label: 'Web app / SaaS', description: 'Logged-in product with accounts, data and dashboards.', ui: true },
  'marketing-site': { label: 'Marketing site', description: 'Landing pages, company or product website, content site.', ui: true },
  'mobile-app': { label: 'Mobile app', description: 'iOS and Android app.', ui: true },
  backend: { label: 'API / backend / tool', description: 'Service, integration, CLI or pipeline with little or no UI.', ui: false },
};

/** Who plays the boss and the business specialists. Both run at high effort. */
export const BOSS_ENGINES = {
  codex: { label: 'Codex', description: 'The boss, market research, marketing and sales run on the Codex CLI.' },
  claude: { label: 'Claude Fable', description: 'Use when Codex is not available: the same roles run on Claude Fable.' },
};

/** Whether the team first maps an existing codebase before planning anything. */
export const SURVEY = {
  auto: { label: 'Automatic', description: 'Survey when the folder already contains a codebase; refresh the map when the code has changed since.' },
  always: { label: 'Always, from scratch', description: 'Rebuild the whole codebase map even if one exists.' },
  never: { label: 'Skip', description: 'Do not survey. Only sensible for a brand-new product.' },
};

export const DEFAULT_MODES = {
  approvals: 'design-golive',
  access: 'guarded',
  productTypes: ['web-app'],
  engineers: 3,
  business: true,
  bossEngine: 'codex',
  survey: 'auto',
};

const asOptions = (table) => Object.entries(table).map(([value, v]) => ({ value, label: v.label, description: v.description }));

export function validateModes(modes) {
  if (!APPROVALS[modes.approvals]) {
    throw new HarnessError(`Unknown approvals mode "${modes.approvals}". Choose one of: ${Object.keys(APPROVALS).join(', ')}`);
  }
  if (!ACCESS[modes.access]) {
    throw new HarnessError(`Unknown access mode "${modes.access}". Choose one of: ${Object.keys(ACCESS).join(', ')}`);
  }
  const types = modes.productTypes ?? [];
  if (!types.length) throw new HarnessError('Choose at least one product type.');
  for (const t of types) {
    if (!PRODUCT_TYPES[t]) {
      throw new HarnessError(`Unknown product type "${t}". Choose from: ${Object.keys(PRODUCT_TYPES).join(', ')}`);
    }
  }
  const n = Number(modes.engineers);
  if (!Number.isInteger(n) || n < 1 || n > 8) throw new HarnessError('Parallel engineers must be a whole number from 1 to 8.');
  if (!BOSS_ENGINES[modes.bossEngine]) {
    throw new HarnessError(`Unknown boss "${modes.bossEngine}". Choose one of: ${Object.keys(BOSS_ENGINES).join(', ')}`);
  }
  if (!SURVEY[modes.survey]) {
    throw new HarnessError(`Unknown survey mode "${modes.survey}". Choose one of: ${Object.keys(SURVEY).join(', ')}`);
  }
  return { ...modes, engineers: n, business: Boolean(modes.business) };
}

/** Flags given on the command line, in the shape of a partial modes object. */
export function modesFromFlags(flags) {
  const out = {};
  if (flags.approvals) out.approvals = String(flags.approvals);
  if (flags.access) out.access = String(flags.access);
  if (flags.type) out.productTypes = String(flags.type).split(',').map((s) => s.trim()).filter(Boolean);
  if (flags.engineers) out.engineers = Number(flags.engineers);
  if (flags.business !== undefined) out.business = !['false', 'no', '0'].includes(String(flags.business));
  if (flags.boss) out.bossEngine = String(flags.boss);
  if (flags.survey) out.survey = String(flags.survey);
  return out;
}

/**
 * Ask only for the modes not already fixed by flags. `saved` (the project's previous
 * choices) becomes the default for each question.
 */
export async function chooseModes(ui, { saved = {}, flags = {}, codexAvailable = true, existingCode = false } = {}) {
  const base = { ...DEFAULT_MODES, ...saved };
  if (!codexAvailable && !saved.bossEngine) base.bossEngine = 'claude';
  const modes = { ...base, ...flags };

  if (flags.bossEngine === undefined) {
    modes.bossEngine = await ui.select('Who is the boss (product and project manager)?', asOptions(BOSS_ENGINES), {
      fallback: base.bossEngine,
    });
  }
  if (flags.survey === undefined && existingCode) {
    modes.survey = await ui.select(
      'This folder already contains code. Should the engineers map the codebase and its deployment before planning?',
      asOptions(SURVEY),
      { fallback: base.survey },
    );
  }

  if (flags.approvals === undefined) {
    modes.approvals = await ui.select('When should the team stop and wait for your approval?', asOptions(APPROVALS), {
      fallback: base.approvals,
    });
  }
  if (flags.access === undefined) {
    modes.access = await ui.select('How much freedom do agents get on this machine?', asOptions(ACCESS), { fallback: base.access });
  }
  if (flags.productTypes === undefined) {
    modes.productTypes = await ui.multiSelect('What is being built? (decides which phases and skills apply)', asOptions(PRODUCT_TYPES), {
      fallback: base.productTypes,
    });
  }
  if (flags.engineers === undefined) {
    const answer = await ui.text('How many engineers may work in parallel, surveying and building? (1-8)', {
      fallback: String(base.engineers),
      hint: `More is faster but uses your Claude subscription limit faster. Enter = ${base.engineers}.`,
    });
    modes.engineers = Number(answer);
  }
  if (flags.business === undefined) {
    modes.business = await ui.confirm('Include market research, marketing and sales specialists?', { fallback: base.business });
  }
  return validateModes(modes);
}

export const hasUI = (modes) => modes.productTypes.some((t) => PRODUCT_TYPES[t].ui);
export const needsHuman = (modes, gate) => APPROVALS[modes.approvals].gates.includes(gate);

export function describeModes(modes) {
  return [
    `Boss: ${BOSS_ENGINES[modes.bossEngine].label}`,
    `Codebase survey: ${SURVEY[modes.survey].label}`,
    `Approvals: ${APPROVALS[modes.approvals].label}`,
    `Agent access: ${ACCESS[modes.access].label}`,
    `Product: ${modes.productTypes.map((t) => PRODUCT_TYPES[t].label).join(', ')}`,
    `Parallel engineers: ${modes.engineers}`,
    `Business specialists: ${modes.business ? 'yes' : 'no'}`,
  ].join('\n');
}
