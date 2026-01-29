export { IdentityRegistry } from './IdentityRegistry';
export {
  parseGlobalId,
  formatGlobalId,
  isValidGlobalId,
  getChainFromGlobalId,
  isCanonicalGlobalId,
  hashGlobalId,
  globalIdsEqual,
  extractAgentId,
  extractRegistry,
  extractChainId,
} from './GlobalId';
export {
  validateAgentProfile,
  parseAgentProfile,
  serializeAgentProfile,
  createMinimalProfile,
  createTradingProfile,
  createAgentProfile,
  updateProfileEndpoints,
  updateProfileTier,
  getTierFromProfile,
  buildProfileURI,
} from './AgentProfile';
