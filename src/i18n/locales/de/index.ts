import { common } from './common.ts';
import { home } from './home.ts';
import { train } from './train.ts';
import { parallel } from './parallel.ts';
import { chain } from './chain.ts';
import { custom } from './custom.ts';
import { analyse } from './analyse.ts';
import { lernen } from './lernen.ts';
import { settings } from './settings.ts';
import { release } from './release.ts';
import { core } from './core.ts';
import { account } from './account.ts';
import { sol } from './sol.ts';
import { onboarding } from './onboarding.ts';

export const dict = { common, home, train, parallel, chain, custom, analyse, lernen, settings, release, core, account, sol, onboarding } as const;
