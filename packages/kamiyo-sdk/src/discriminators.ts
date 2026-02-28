/**
 * Anchor instruction discriminators derived from IDL
 * Format: sha256("global:<instruction_name>")[0..8]
 */

export const DISCRIMINATORS = {
  // Agent instructions
  createAgent: Buffer.from([143, 66, 198, 95, 110, 85, 83, 249]),
  deactivateAgent: Buffer.from([205, 171, 239, 225, 82, 126, 96, 166]),

  // Escrow instructions
  initializeEscrow: Buffer.from([243, 160, 77, 153, 11, 92, 48, 209]),
  releaseFunds: Buffer.from([225, 88, 91, 108, 126, 52, 2, 26]),
  markDisputed: Buffer.from([136, 86, 152, 120, 3, 21, 223, 251]),
  claimExpiredEscrow: Buffer.from([249, 93, 128, 229, 7, 27, 93, 224]),

  // Reputation instructions
  initReputation: Buffer.from([236, 239, 233, 112, 220, 149, 26, 175]),

  // Oracle instructions
  initializeOracleRegistry: Buffer.from([190, 92, 228, 114, 56, 71, 101, 220]),
  addOracle: Buffer.from([185, 165, 165, 167, 208, 207, 55, 35]),

  // Blacklist instructions
  addToBlacklist: Buffer.from([90, 115, 98, 231, 173, 119, 117, 176]),

  // PoCH instructions
  initPoCHSubmission: Buffer.from([48, 98, 0, 229, 195, 156, 171, 163]),
  commitPoCHScoreBundle: Buffer.from([15, 201, 24, 249, 109, 35, 95, 19]),
  verifyPoCHProof: Buffer.from([166, 233, 168, 112, 217, 114, 72, 148]),
  finalizePoCH: Buffer.from([237, 71, 27, 71, 155, 130, 21, 160]),
  applyPoCHPenalty: Buffer.from([191, 218, 119, 20, 29, 122, 57, 135]),

  // Trusted launch instructions
  createTrustedLaunch: Buffer.from([125, 132, 155, 54, 52, 252, 242, 150]),
  recordGraduation: Buffer.from([89, 93, 12, 76, 198, 56, 162, 242]),
  releaseLaunch: Buffer.from([229, 144, 251, 90, 130, 37, 184, 154]),
  disputeLaunch: Buffer.from([231, 138, 9, 141, 248, 198, 41, 142]),

  // Trusted trader instructions (Elfa × Hyperliquid)
  createTraderSession: Buffer.from([234, 213, 168, 230, 177, 46, 220, 222]),
  createTradeEscrow: Buffer.from([149, 181, 111, 61, 122, 174, 71, 51]),
  closeTraderSession: Buffer.from([51, 80, 230, 21, 61, 68, 251, 62]),
} as const;
