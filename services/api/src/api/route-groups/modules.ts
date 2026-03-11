import swarmteamsRoutes from '../routes/hive';
import swarmTeamRoutes from '../routes/hive-teams';
import buybackRoutes from '../routes/buyback';
import channelsRoutes from '../routes/channels';
import kamiyoTokenRoutes from '../routes/kamiyo-token';
import type { ApiRouteGroup } from './types';

export function createModuleRouteGroups(): ApiRouteGroup[] {
  return [
    { ownership: 'module', path: '/api/hive', handlers: [swarmteamsRoutes] },
    { ownership: 'module', path: '/api/hive-teams', handlers: [swarmTeamRoutes] },
    { ownership: 'module', path: '/api/swarm-teams', handlers: [swarmTeamRoutes] },
    { ownership: 'module', path: '/api/buyback', handlers: [buybackRoutes] },
    { ownership: 'module', path: '/api/channels', handlers: [channelsRoutes] },
    { ownership: 'module', path: '/api/kamiyo', handlers: [kamiyoTokenRoutes] },
  ];
}
