import swarmteamsRoutes from '../routes/hive';
import swarmTeamRoutes from '../routes/hive-teams';
import buybackRoutes from '../routes/buyback';
import channelsRoutes from '../routes/channels';
import kamiyoTokenRoutes from '../routes/kamiyo-token';
import type { ApiRouteGroup } from './types';

export function createModuleRouteGroups(): ApiRouteGroup[] {
  return [
    { ownership: 'module', routeIds: ['hive'], path: '/api/hive', handlers: [swarmteamsRoutes] },
    { ownership: 'module', routeIds: ['hive-teams'], path: '/api/hive-teams', handlers: [swarmTeamRoutes] },
    { ownership: 'module', routeIds: ['hive-teams'], path: '/api/swarm-teams', handlers: [swarmTeamRoutes] },
    { ownership: 'module', routeIds: ['buyback'], path: '/api/buyback', handlers: [buybackRoutes] },
    { ownership: 'module', routeIds: ['channels'], path: '/api/channels', handlers: [channelsRoutes] },
    { ownership: 'module', routeIds: ['kamiyo-token'], path: '/api/kamiyo', handlers: [kamiyoTokenRoutes] },
  ];
}
