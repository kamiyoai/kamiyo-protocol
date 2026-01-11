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

  // Oracle instructions
  addOracle: Buffer.from([185, 165, 165, 167, 208, 207, 55, 35]),

  // Blacklist instructions
  addToBlacklist: Buffer.from([90, 115, 98, 231, 173, 119, 117, 176]),
} as const;
