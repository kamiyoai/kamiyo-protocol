"use strict";
/*
 * KAMIYO Agent Collaboration SDK
 *
 * ZK-private coordination for AI agent swarms.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createMerkleTree = exports.MerkleTree = exports.generateAgentId = exports.generateRegistrationSecret = exports.generateOwnerSecret = exports.generateRandomSalt = exports.MitamaProver = void 0;
__exportStar(require("./types"), exports);
__exportStar(require("./client"), exports);
var prover_1 = require("./prover");
Object.defineProperty(exports, "MitamaProver", { enumerable: true, get: function () { return prover_1.MitamaProver; } });
Object.defineProperty(exports, "generateRandomSalt", { enumerable: true, get: function () { return prover_1.generateRandomSalt; } });
Object.defineProperty(exports, "generateOwnerSecret", { enumerable: true, get: function () { return prover_1.generateOwnerSecret; } });
Object.defineProperty(exports, "generateRegistrationSecret", { enumerable: true, get: function () { return prover_1.generateRegistrationSecret; } });
Object.defineProperty(exports, "generateAgentId", { enumerable: true, get: function () { return prover_1.generateAgentId; } });
var merkle_1 = require("./merkle");
Object.defineProperty(exports, "MerkleTree", { enumerable: true, get: function () { return merkle_1.MerkleTree; } });
Object.defineProperty(exports, "createMerkleTree", { enumerable: true, get: function () { return merkle_1.createMerkleTree; } });
//# sourceMappingURL=index.js.map