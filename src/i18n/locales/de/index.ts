import { common } from './common.ts';
import { home } from './home.ts';
import { train } from './train.ts';
import { parallel } from './parallel.ts';
import { chain } from './chain.ts';
import { custom } from './custom.ts';
import { analyse } from './progress.ts'; // Datei nicht „analyse.ts“: /analyse.js steht in EasyPrivacy
import { lernen } from './lernen.ts';
import { settings } from './settings.ts';
import { release } from './release.ts';
import { core } from './core.ts';
import { account } from './account.ts';
import { sol } from './sol.ts';
import { onboarding } from './onboarding.ts';
import { guide } from './guide.ts';
import { compete } from './compete.ts';
import { placement } from './placement.ts';
import { tour } from './tour.ts';
import { cases } from './cases.ts'; // v9 C

export const dict = { tour, common, home, train, parallel, chain, custom, analyse, lernen, settings, release, core, account, sol, onboarding, guide, compete, placement, cases } as const;
