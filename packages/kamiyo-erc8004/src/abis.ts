/**
 * Contract ABIs for ERC-8004 contracts
 */

export const ERC8004_IDENTITY_REGISTRY_ABI = [
  // Registration
  'function register(string agentURI, tuple(string key, bytes value)[] metadata) returns (uint256)',
  'function register(string agentURI) returns (uint256)',
  'function register() returns (uint256)',

  // URI Management
  'function setAgentURI(uint256 agentId, string newURI)',
  'function tokenURI(uint256 tokenId) view returns (string)',

  // Metadata
  'function setMetadata(uint256 agentId, string metadataKey, bytes metadataValue)',
  'function getMetadata(uint256 agentId, string metadataKey) view returns (bytes)',

  // Wallet Management
  'function setAgentWallet(uint256 agentId, address newWallet, uint256 deadline, bytes signature)',
  'function getAgentWallet(uint256 agentId) view returns (address)',
  'function unsetAgentWallet(uint256 agentId)',

  // Global ID
  'function getGlobalId(uint256 agentId) view returns (string)',

  // ERC-721
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function balanceOf(address owner) view returns (uint256)',
  'function transferFrom(address from, address to, uint256 tokenId)',
  'function approve(address to, uint256 tokenId)',
  'function getApproved(uint256 tokenId) view returns (address)',

  // View
  'function totalSupply() view returns (uint256)',
  'function exists(uint256 agentId) view returns (bool)',
  'function registeredAt(uint256 agentId) view returns (uint64)',

  // Constants
  'function SET_WALLET_TYPEHASH() view returns (bytes32)',
  'function AGENT_WALLET_KEY() view returns (bytes32)',

  // Events
  'event Registered(uint256 indexed agentId, string agentURI, address indexed owner)',
  'event URIUpdated(uint256 indexed agentId, string newURI, address indexed updatedBy)',
  'event MetadataSet(uint256 indexed agentId, string indexed indexedMetadataKey, string metadataKey, bytes metadataValue)',
  'event AgentWalletSet(uint256 indexed agentId, address indexed wallet)',
  'event AgentWalletUnset(uint256 indexed agentId)',
  'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)',
] as const;

export const ERC8004_REPUTATION_REGISTRY_ABI = [
  // Feedback
  'function giveFeedback(uint256 agentId, int128 value, uint8 valueDecimals, bytes32 tag1, bytes32 tag2, bytes32 endpoint, string feedbackURI, bytes32 feedbackHash)',
  'function revokeFeedback(uint256 agentId, uint64 feedbackIndex)',
  'function appendResponse(uint256 agentId, address clientAddress, uint64 feedbackIndex, string responseURI, bytes32 responseHash)',

  // Queries
  'function getSummary(uint256 agentId, address[] clientAddresses, bytes32 tag1, bytes32 tag2) view returns (uint64 count, int128 summaryValue, uint8 decimals)',
  'function readFeedback(uint256 agentId, address clientAddress, uint64 feedbackIndex) view returns (int128 value, uint8 valueDecimals, bytes32 tag1, bytes32 tag2, bool isRevoked)',
  'function readAllFeedback(uint256 agentId, address[] clientAddresses, bytes32 tag1, bytes32 tag2, bool includeRevoked) view returns (address[] clients, uint64[] indices, int128[] values, uint8[] valueDecimals, bytes32[] tag1s, bytes32[] tag2s, bool[] revoked)',
  'function getLastIndex(uint256 agentId, address clientAddress) view returns (uint64)',
  'function getClients(uint256 agentId) view returns (address[])',

  // Extended
  'function getFeedbackFull(uint256 agentId, address clientAddress, uint64 feedbackIndex) view returns (tuple(int128 value, uint8 valueDecimals, bytes32 tag1, bytes32 tag2, bytes32 endpoint, string feedbackURI, bytes32 feedbackHash, uint64 timestamp, bool isRevoked))',
  'function getResponseCount(uint256 agentId, address clientAddress, uint64 feedbackIndex) view returns (uint256)',
  'function getResponse(uint256 agentId, address clientAddress, uint64 feedbackIndex, uint256 responseIndex) view returns (address responder, string responseURI, bytes32 responseHash, uint64 timestamp)',

  // Events
  'event NewFeedback(uint256 indexed agentId, address indexed clientAddress, uint64 feedbackIndex, int128 value, uint8 valueDecimals, bytes32 indexed indexedTag1, bytes32 tag1, bytes32 tag2, bytes32 endpoint, string feedbackURI, bytes32 feedbackHash)',
  'event FeedbackRevoked(uint256 indexed agentId, address indexed clientAddress, uint64 indexed feedbackIndex)',
  'event ResponseAppended(uint256 indexed agentId, address indexed clientAddress, uint64 feedbackIndex, address indexed responder, string responseURI, bytes32 responseHash)',
] as const;

export const ERC8004_VALIDATION_REGISTRY_ABI = [
  // Request/Response
  'function validationRequest(address validatorAddress, uint256 agentId, string requestURI, bytes32 requestHash)',
  'function validationResponse(bytes32 requestHash, uint8 response, string responseURI, bytes32 responseHash, bytes32 tag)',
  'function validationResponseFromTier(bytes32 requestHash, uint8 kamiyoTier, string responseURI, bytes32 responseHash)',

  // Queries
  'function getValidationStatus(bytes32 requestHash) view returns (address validatorAddress, uint256 agentId, uint8 response, bytes32 responseHash, bytes32 tag, uint64 lastUpdate)',
  'function getSummary(uint256 agentId, address[] validatorAddresses, bytes32 tag) view returns (uint64 count, uint8 averageResponse)',
  'function getAgentValidations(uint256 agentId) view returns (bytes32[])',
  'function getValidatorRequests(address validatorAddress) view returns (bytes32[])',

  // Tier conversion
  'function tierToResponse(uint8 tier) pure returns (uint8)',
  'function responseToTier(uint8 response) pure returns (uint8)',

  // Validator management
  'function isValidator(address) view returns (bool)',
  'function getValidators() view returns (address[])',
  'function getActiveValidatorCount() view returns (uint256)',

  // Events
  'event ValidationRequest(address indexed validatorAddress, uint256 indexed agentId, string requestURI, bytes32 indexed requestHash)',
  'event ValidationResponse(address indexed validatorAddress, uint256 indexed agentId, bytes32 indexed requestHash, uint8 response, string responseURI, bytes32 responseHash, bytes32 tag)',
  'event ValidatorAdded(address indexed validator)',
  'event ValidatorRemoved(address indexed validator)',
] as const;

export const ZK_REPUTATION_BRIDGE_ABI = [
  // Linking
  'function linkAgent(uint256 agentId)',
  'function unlinkAgent()',
  'function agentToIdentity(address) view returns (uint256)',
  'function identityToAgent(uint256) view returns (address)',

  // Attestation
  'function requestAttestation(address agentAddress, uint256 requestedTier) returns (bytes32)',
  'function fulfillAttestation(bytes32 requestHash, uint256[2] pA, uint256[2][2] pB, uint256[2] pC, uint256 threshold)',
  'function attestCurrentTier(address agentAddress) returns (uint256 agentId, uint8 tier, uint8 response)',
  'function batchAttestCurrentTier(address[] agentAddresses)',

  // Queries
  'function getLinkedIdentity(address agentAddress) view returns (uint256)',
  'function getLinkedAgent(uint256 agentId) view returns (address)',
  'function getAttestationRequest(bytes32 requestHash) view returns (address agentAddress, uint256 agentId, uint256 requestedTier, uint64 timestamp, bool fulfilled)',
  'function getAgentStatus(address agentAddress) view returns (bool linked, uint256 agentId, uint8 tier, uint8 response)',

  // Events
  'event AgentLinked(address indexed agentAddress, uint256 indexed agentId)',
  'event AgentUnlinked(address indexed agentAddress, uint256 indexed agentId)',
  'event AttestationRequested(bytes32 indexed requestHash, address indexed agentAddress, uint256 indexed agentId, uint256 requestedTier)',
  'event AttestationFulfilled(bytes32 indexed requestHash, address indexed agentAddress, uint256 verifiedTier, uint8 erc8004Response)',
  'event TierAttested(address indexed agentAddress, uint256 indexed agentId, uint8 tier, uint8 response)',
] as const;

export const AGENT_REGISTRY_ADAPTER_ABI = [
  // Linking
  'function linkToGlobalId(string globalId)',
  'function unlinkGlobalId()',
  'function agentGlobalId(address) view returns (string)',
  'function getAgentByGlobalId(string globalId) view returns (address)',
  'function isLinked(address agent) view returns (bool)',

  // Metadata
  'function setAgentURI(string uri)',
  'function agentURI(address) view returns (string)',
  'function setMetadata(string key, bytes value)',
  'function getMetadata(address agent, string key) view returns (bytes)',
  'function getAgentWallet(address agent) pure returns (address)',

  // Views
  'function getAgentFull(address agent) view returns (tuple(address owner, string name, uint256 stake, uint64 registeredAt, uint64 totalTrades, int64 totalPnl, uint64 copiers, uint64 successfulTrades, bool active), string globalId, string uri)',
  'function buildAgentProfile(address agent) view returns (string name, address wallet, uint256 stake, uint64 registeredAt, uint64 totalTrades, uint64 successfulTrades, bool active, string globalId, string uri)',
  'function getLinkedAgents(address[] agents) view returns (address[] linkedAgents, string[] globalIds)',

  // Events
  'event AgentLinked(address indexed agent, string globalId)',
  'event AgentUnlinked(address indexed agent, string globalId)',
  'event URIUpdated(address indexed agent, string newURI)',
  'event MetadataSet(address indexed agent, string key, bytes value)',
] as const;

export const IDENTITY_MIRROR_ABI = [
  // Mirror
  'function mirrorIdentity(string globalId, address owner, address wallet, string agentURI, uint8 tier, tuple(uint256[2] a, uint256[2][2] b, uint256[2] c) proof, uint256[] pubInputs)',
  'function mirrorIdentityAdmin(string globalId, address owner, address wallet, string agentURI, uint8 tier)',
  'function batchMirrorIdentities(string[] globalIds, address[] owners, address[] wallets, string[] agentURIs, uint8[] tiers)',

  // Queries
  'function getIdentity(bytes32 globalIdHash) view returns (tuple(bytes32 globalIdHash, string globalId, address owner, address wallet, string agentURI, uint256 timestamp, uint8 tier, bool exists))',
  'function getIdentityByGlobalId(string globalId) view returns (tuple(bytes32 globalIdHash, string globalId, address owner, address wallet, string agentURI, uint256 timestamp, uint8 tier, bool exists))',
  'function getIdentityByWallet(address wallet) view returns (tuple(bytes32 globalIdHash, string globalId, address owner, address wallet, string agentURI, uint256 timestamp, uint8 tier, bool exists))',
  'function hasIdentity(bytes32 globalIdHash) view returns (bool)',
  'function getAgentWallet(bytes32 globalIdHash) view returns (address)',
  'function getTier(bytes32 globalIdHash) view returns (uint8)',
  'function getIdentitiesByOwner(address owner) view returns (bytes32[])',
  'function tierToResponse(uint8 tier) pure returns (uint8)',
  'function totalIdentities() view returns (uint256)',

  // Events
  'event IdentityMirrored(bytes32 indexed globalIdHash, string globalId, address indexed owner, address wallet, uint8 tier)',
  'event IdentityUpdated(bytes32 indexed globalIdHash, address indexed owner, uint8 tier, uint256 timestamp)',
  'event ProofVerified(bytes32 indexed globalIdHash, bool valid)',
] as const;
