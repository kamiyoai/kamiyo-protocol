"use strict";
/**
 * Production Oracle Test Script
 * Tests the full dispute resolution flow on Solana devnet
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
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
var anchor = __importStar(require("@coral-xyz/anchor"));
var web3_js_1 = require("@solana/web3.js");
var fs = __importStar(require("fs"));
var nacl = __importStar(require("tweetnacl"));
var PROGRAM_ID = new web3_js_1.PublicKey('E5EiaJhbg6Bav1v3P211LNv1tAqa4fHVeuGgRBHsEu6n');
var RPC_URL = 'https://api.devnet.solana.com';
// Load IDL
var idlPath = './packages/mitama-sdk/types/mitama_escrow.json';
var idl = JSON.parse(fs.readFileSync(idlPath, 'utf-8'));
// Oracle keypair (deterministic for demo)
var ORACLE_SEED = new Uint8Array(32);
for (var i = 0; i < 32; i++) {
    ORACLE_SEED[i] = i + 100;
}
var oracleKeypair = web3_js_1.Keypair.fromSeed(ORACLE_SEED);
function main() {
    return __awaiter(this, void 0, void 0, function () {
        var connection, agentKeypair, keypairPath, keypairData, agentBalance, airdropSig, e_1, wallet, provider, program, e_2, e_3, transactionId, amount, timeLock, escrowSig, e_4, qualityScore, refundPercentage, message, messageBytes, signature, resolveSig, refundAmount, e_5;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    console.log('Mitama Production Oracle Test\n');
                    connection = new web3_js_1.Connection(RPC_URL, 'confirmed');
                    keypairPath = './test-agent-keypair.json';
                    if (fs.existsSync(keypairPath)) {
                        keypairData = JSON.parse(fs.readFileSync(keypairPath, 'utf-8'));
                        agentKeypair = web3_js_1.Keypair.fromSecretKey(new Uint8Array(keypairData));
                        console.log('[OK] Loaded existing agent keypair');
                    }
                    else {
                        agentKeypair = web3_js_1.Keypair.generate();
                        fs.writeFileSync(keypairPath, JSON.stringify(Array.from(agentKeypair.secretKey)));
                        console.log('[OK] Generated new agent keypair');
                    }
                    console.log("Agent: ".concat(agentKeypair.publicKey.toString()));
                    console.log("Oracle: ".concat(oracleKeypair.publicKey.toString(), "\n"));
                    return [4 /*yield*/, connection.getBalance(agentKeypair.publicKey)];
                case 1:
                    agentBalance = _a.sent();
                    console.log("Agent balance: ".concat(agentBalance / web3_js_1.LAMPORTS_PER_SOL, " SOL"));
                    if (!(agentBalance < 0.1 * web3_js_1.LAMPORTS_PER_SOL)) return [3 /*break*/, 6];
                    console.log('\nWarning: Low balance! Requesting airdrop...');
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, 5, , 6]);
                    return [4 /*yield*/, connection.requestAirdrop(agentKeypair.publicKey, 1 * web3_js_1.LAMPORTS_PER_SOL)];
                case 3:
                    airdropSig = _a.sent();
                    return [4 /*yield*/, connection.confirmTransaction(airdropSig)];
                case 4:
                    _a.sent();
                    console.log('[OK] Airdrop successful');
                    return [3 /*break*/, 6];
                case 5:
                    e_1 = _a.sent();
                    console.error('[FAILED] Airdrop failed:', e_1.message);
                    console.log('Please manually fund the agent wallet with devnet SOL');
                    return [2 /*return*/];
                case 6:
                    wallet = new anchor.Wallet(agentKeypair);
                    provider = new anchor.AnchorProvider(connection, wallet, {
                        commitment: 'confirmed'
                    });
                    program = new anchor.Program(idl, PROGRAM_ID, provider);
                    console.log('\nRunning Production Test Flow\n');
                    // Step 1: Initialize reputation accounts
                    console.log('Step 1: Initializing reputation accounts...');
                    _a.label = 7;
                case 7:
                    _a.trys.push([7, 9, , 10]);
                    return [4 /*yield*/, initReputation(program, agentKeypair.publicKey, agentKeypair)];
                case 8:
                    _a.sent();
                    console.log('  [OK] Agent reputation initialized');
                    return [3 /*break*/, 10];
                case 9:
                    e_2 = _a.sent();
                    console.log('  [Info] Agent reputation exists or error:', e_2.message);
                    return [3 /*break*/, 10];
                case 10:
                    _a.trys.push([10, 12, , 13]);
                    return [4 /*yield*/, initReputation(program, oracleKeypair.publicKey, agentKeypair)];
                case 11:
                    _a.sent();
                    console.log('  [OK] API reputation initialized');
                    return [3 /*break*/, 13];
                case 12:
                    e_3 = _a.sent();
                    console.log('  [Info] API reputation exists or error:', e_3.message);
                    return [3 /*break*/, 13];
                case 13:
                    transactionId = "test_".concat(Date.now());
                    amount = new anchor.BN(0.01 * web3_js_1.LAMPORTS_PER_SOL);
                    timeLock = new anchor.BN(86400);
                    console.log('\nStep 2: Creating escrow...');
                    console.log("  Transaction ID: ".concat(transactionId));
                    console.log("  Amount: 0.01 SOL");
                    _a.label = 14;
                case 14:
                    _a.trys.push([14, 16, , 17]);
                    return [4 /*yield*/, createEscrow(program, agentKeypair, oracleKeypair.publicKey, amount, timeLock, transactionId)];
                case 15:
                    escrowSig = _a.sent();
                    console.log("  [OK] Escrow created: ".concat(escrowSig));
                    console.log("  Link: https://explorer.solana.com/tx/".concat(escrowSig, "?cluster=devnet"));
                    return [3 /*break*/, 17];
                case 16:
                    e_4 = _a.sent();
                    console.error('  [FAILED] Failed to create escrow:', e_4);
                    return [2 /*return*/];
                case 17:
                    // Step 3: Generate oracle assessment
                    console.log('\nStep 3: Generating oracle assessment...');
                    qualityScore = 65 + Math.floor(Math.random() * 15);
                    refundPercentage = qualityScore < 50 ? 100 : qualityScore < 80 ? Math.round((80 - qualityScore) / 80 * 100) : 0;
                    message = "".concat(transactionId, ":").concat(qualityScore);
                    messageBytes = new TextEncoder().encode(message);
                    signature = nacl.sign.detached(messageBytes, oracleKeypair.secretKey);
                    console.log("  Quality Score: ".concat(qualityScore, "/100"));
                    console.log("  Refund: ".concat(refundPercentage, "%"));
                    // Step 4: Resolve dispute
                    console.log('\nStep 4: Resolving dispute on-chain...');
                    _a.label = 18;
                case 18:
                    _a.trys.push([18, 20, , 21]);
                    return [4 /*yield*/, resolveDispute(program, agentKeypair, oracleKeypair.publicKey, transactionId, qualityScore, refundPercentage, Array.from(signature))];
                case 19:
                    resolveSig = _a.sent();
                    console.log("  [OK] Dispute resolved: ".concat(resolveSig));
                    console.log("  Link: https://explorer.solana.com/tx/".concat(resolveSig, "?cluster=devnet"));
                    refundAmount = (0.01 * refundPercentage / 100).toFixed(4);
                    console.log("\n[PASS] Success! Agent received ".concat(refundAmount, " SOL refund"));
                    return [3 /*break*/, 21];
                case 20:
                    e_5 = _a.sent();
                    console.error('  [FAILED] Failed to resolve dispute:', e_5);
                    if (e_5.logs) {
                        console.log('\nProgram logs:');
                        e_5.logs.forEach(function (log) { return console.log('  ', log); });
                    }
                    return [2 /*return*/];
                case 21:
                    console.log('\nProduction test completed successfully!\n');
                    return [2 /*return*/];
            }
        });
    });
}
function initReputation(program, entity, payer) {
    return __awaiter(this, void 0, void 0, function () {
        var reputationPda;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    reputationPda = web3_js_1.PublicKey.findProgramAddressSync([Buffer.from('reputation'), entity.toBuffer()], program.programId)[0];
                    return [4 /*yield*/, program.methods
                            .initReputation()
                            .accounts({
                            reputation: reputationPda,
                            entity: entity,
                            payer: payer.publicKey,
                            systemProgram: anchor.web3.SystemProgram.programId,
                        })
                            .signers([payer])
                            .rpc()];
                case 1: return [2 /*return*/, _a.sent()];
            }
        });
    });
}
function createEscrow(program, agent, api, amount, timeLock, transactionId) {
    return __awaiter(this, void 0, void 0, function () {
        var escrowPda;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    escrowPda = web3_js_1.PublicKey.findProgramAddressSync([Buffer.from('escrow'), Buffer.from(transactionId)], program.programId)[0];
                    return [4 /*yield*/, program.methods
                            .initializeEscrow(amount, timeLock, transactionId)
                            .accounts({
                            escrow: escrowPda,
                            agent: agent.publicKey,
                            api: api,
                            systemProgram: anchor.web3.SystemProgram.programId,
                        })
                            .signers([agent])
                            .rpc()];
                case 1: return [2 /*return*/, _a.sent()];
            }
        });
    });
}
function resolveDispute(program, agent, verifier, transactionId, qualityScore, refundPercentage, signature) {
    return __awaiter(this, void 0, void 0, function () {
        var escrowPda, escrowAccount, agentReputation, apiReputation, message, messageBytes, signatureBytes, publicKeyBytes, ed25519Ix, tx;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    escrowPda = web3_js_1.PublicKey.findProgramAddressSync([Buffer.from('escrow'), Buffer.from(transactionId)], program.programId)[0];
                    return [4 /*yield*/, program.account.escrow.fetch(escrowPda)];
                case 1:
                    escrowAccount = _a.sent();
                    agentReputation = web3_js_1.PublicKey.findProgramAddressSync([Buffer.from('reputation'), escrowAccount.agent.toBuffer()], program.programId)[0];
                    apiReputation = web3_js_1.PublicKey.findProgramAddressSync([Buffer.from('reputation'), escrowAccount.api.toBuffer()], program.programId)[0];
                    message = "".concat(transactionId, ":").concat(qualityScore);
                    messageBytes = new TextEncoder().encode(message);
                    signatureBytes = new Uint8Array(signature);
                    publicKeyBytes = verifier.toBytes();
                    ed25519Ix = createEd25519Instruction(signatureBytes, publicKeyBytes, messageBytes);
                    return [4 /*yield*/, program.methods
                            .resolveDispute(qualityScore, refundPercentage, signature)
                            .accounts({
                            escrow: escrowPda,
                            agent: escrowAccount.agent,
                            api: escrowAccount.api,
                            verifier: verifier,
                            instructionsSysvar: anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
                            agentReputation: agentReputation,
                            apiReputation: apiReputation,
                            systemProgram: anchor.web3.SystemProgram.programId,
                        })
                            .preInstructions([ed25519Ix])
                            .rpc()];
                case 2:
                    tx = _a.sent();
                    return [2 /*return*/, tx];
            }
        });
    });
}
function createEd25519Instruction(signature, publicKey, message) {
    var dataLayout = new Uint8Array(1 + 2 + 2 + 2 + 2 + 2 + 2 + 2 + 64 + 32 + message.length);
    var offset = 0;
    dataLayout[offset] = 1;
    offset += 1; // num_signatures
    dataLayout[offset] = 0;
    offset += 1; // padding
    var sigOffset = 16;
    dataLayout[offset] = sigOffset & 0xFF;
    dataLayout[offset + 1] = (sigOffset >> 8) & 0xFF;
    offset += 2;
    dataLayout[offset] = 0xFF;
    dataLayout[offset + 1] = 0xFF;
    offset += 2;
    var pubkeyOffset = sigOffset + 64;
    dataLayout[offset] = pubkeyOffset & 0xFF;
    dataLayout[offset + 1] = (pubkeyOffset >> 8) & 0xFF;
    offset += 2;
    dataLayout[offset] = 0xFF;
    dataLayout[offset + 1] = 0xFF;
    offset += 2;
    var messageOffset = pubkeyOffset + 32;
    dataLayout[offset] = messageOffset & 0xFF;
    dataLayout[offset + 1] = (messageOffset >> 8) & 0xFF;
    offset += 2;
    dataLayout[offset] = message.length & 0xFF;
    dataLayout[offset + 1] = (message.length >> 8) & 0xFF;
    offset += 2;
    dataLayout[offset] = 0xFF;
    dataLayout[offset + 1] = 0xFF;
    offset += 2;
    dataLayout.set(signature, sigOffset);
    dataLayout.set(publicKey, pubkeyOffset);
    dataLayout.set(message, messageOffset);
    return new anchor.web3.TransactionInstruction({
        keys: [],
        programId: anchor.web3.Ed25519Program.programId,
        data: Buffer.from(dataLayout)
    });
}
main().catch(console.error);
