/**
 * x402Resolve Oracle Transaction System
 * Production implementation for real on-chain dispute resolution
 */

const PROGRAM_ID = 'E5EiaJhbg6Bav1v3P211LNv1tAqa4fHVeuGgRBHsEu6n';
const DEVNET_RPC = 'https://api.devnet.solana.com';

// Browser-compatible Buffer replacement
class BufferPolyfill {
    static from(data, encoding) {
        let arr;
        if (Array.isArray(data)) {
            arr = new Uint8Array(data);
        } else if (typeof data === 'string') {
            const encoder = new TextEncoder();
            arr = encoder.encode(data);
        } else {
            arr = new Uint8Array(data);
        }

        // Add copy method to all from() results
        arr.copy = function(target, targetStart, sourceStart, sourceEnd) {
            const start = sourceStart || 0;
            const end = sourceEnd || this.length;
            target.set(this.slice(start, end), targetStart);
        };

        return arr;
    }

    static alloc(size) {
        const arr = new Uint8Array(size);
        // Add helper methods
        arr.writeBigUInt64LE = function(value, offset) {
            const view = new DataView(this.buffer);
            view.setBigUint64(offset, value, true);
        };
        arr.writeBigInt64LE = function(value, offset) {
            const view = new DataView(this.buffer);
            view.setBigInt64(offset, value, true);
        };
        arr.writeUInt32LE = function(value, offset) {
            const view = new DataView(this.buffer);
            view.setUint32(offset, value, true);
        };
        arr.writeUInt8 = function(value, offset) {
            this[offset] = value;
        };
        arr.copy = function(target, targetStart, sourceStart, sourceEnd) {
            const start = sourceStart || 0;
            const end = sourceEnd || this.length;
            target.set(this.slice(start, end), targetStart);
        };
        arr.toString = function(encoding) {
            if (encoding === 'hex') {
                return Array.from(this).map(b => b.toString(16).padStart(2, '0')).join('');
            }
            return new TextDecoder().decode(this);
        };
        return arr;
    }
}

const Buffer = BufferPolyfill;

// Oracle keypair for signing (in production, this would be a secure backend service)
// For demo purposes, we'll generate a deterministic keypair
const ORACLE_SEED = new Uint8Array(32);
for (let i = 0; i < 32; i++) {
    ORACLE_SEED[i] = i + 100; // Deterministic seed for demo
}

class OracleTransactionSystem {
    constructor() {
        this.connection = new solanaWeb3.Connection(DEVNET_RPC, 'confirmed');
        this.programId = new solanaWeb3.PublicKey(PROGRAM_ID);
        this.oracleKeypair = null;
        this.initOracle();
    }

    async initOracle() {
        // Generate oracle keypair from seed (deterministic for demo)
        this.oracleKeypair = solanaWeb3.Keypair.fromSeed(ORACLE_SEED);
        console.log('Oracle Public Key:', this.oracleKeypair.publicKey.toString());
    }

    /**
     * Derive PDA addresses
     */
    deriveEscrowPDA(transactionId) {
        const [pda, bump] = solanaWeb3.PublicKey.findProgramAddressSync(
            [
                Buffer.from('escrow'),
                Buffer.from(transactionId)
            ],
            this.programId
        );
        return { pda, bump };
    }

    deriveReputationPDA(entity) {
        const [pda, bump] = solanaWeb3.PublicKey.findProgramAddressSync(
            [
                Buffer.from('reputation'),
                entity.toBuffer()
            ],
            this.programId
        );
        return { pda, bump };
    }

    /**
     * Generate quality score and Ed25519 signature
     */
    async generateQualityAssessment(transactionId) {
        // Simulate quality analysis (in production, this would be AI-powered)
        const baseScore = 65 + Math.floor(Math.random() * 15);
        const qualityScore = Math.max(50, Math.min(85, baseScore));

        // Message format must match contract: "{transaction_id}:{quality_score}"
        const message = `${transactionId}:${qualityScore}`;
        const messageBytes = new TextEncoder().encode(message);

        // Sign with oracle keypair using Ed25519
        const signature = nacl.sign.detached(messageBytes, this.oracleKeypair.secretKey);

        // Calculate refund percentage based on quality score
        let refundPercentage = 0;
        if (qualityScore < 50) {
            refundPercentage = 100;
        } else if (qualityScore < 80) {
            refundPercentage = Math.round((80 - qualityScore) / 80 * 100);
        }

        return {
            qualityScore,
            refundPercentage,
            signature: Array.from(signature),
            message: message,
            oraclePublicKey: this.oracleKeypair.publicKey
        };
    }

    /**
     * Create Ed25519 verify instruction
     */
    createEd25519Instruction(signature, publicKey, message) {
        const signatureBytes = new Uint8Array(signature);
        const publicKeyBytes = publicKey.toBytes();
        const messageBytes = new TextEncoder().encode(message);

        console.log('Ed25519 instruction data:', {
            signatureLen: signatureBytes.length,
            publicKeyLen: publicKeyBytes.length,
            messageLen: messageBytes.length,
            message: message
        });

        // Ed25519 instruction data format:
        // Header (16 bytes) + Signature (64) + Public Key (32) + Message (variable)
        const headerSize = 16;
        const sigOffset = headerSize;
        const pubkeyOffset = sigOffset + 64;
        const messageOffset = pubkeyOffset + 32;
        const totalSize = messageOffset + messageBytes.length;

        const dataLayout = new Uint8Array(totalSize);

        let offset = 0;

        // num_signatures (1 byte)
        dataLayout[offset] = 1;
        offset += 1;

        // padding (1 byte)
        dataLayout[offset] = 0;
        offset += 1;

        // signature_offset (u16 LE)
        dataLayout[offset] = sigOffset & 0xFF;
        dataLayout[offset + 1] = (sigOffset >> 8) & 0xFF;
        offset += 2;

        // signature_instruction_index (u16 LE) - 0xFFFF means current instruction
        dataLayout[offset] = 0xFF;
        dataLayout[offset + 1] = 0xFF;
        offset += 2;

        // public_key_offset (u16 LE)
        dataLayout[offset] = pubkeyOffset & 0xFF;
        dataLayout[offset + 1] = (pubkeyOffset >> 8) & 0xFF;
        offset += 2;

        // public_key_instruction_index (u16 LE)
        dataLayout[offset] = 0xFF;
        dataLayout[offset + 1] = 0xFF;
        offset += 2;

        // message_data_offset (u16 LE)
        dataLayout[offset] = messageOffset & 0xFF;
        dataLayout[offset + 1] = (messageOffset >> 8) & 0xFF;
        offset += 2;

        // message_data_size (u16 LE)
        dataLayout[offset] = messageBytes.length & 0xFF;
        dataLayout[offset + 1] = (messageBytes.length >> 8) & 0xFF;
        offset += 2;

        // message_instruction_index (u16 LE)
        dataLayout[offset] = 0xFF;
        dataLayout[offset + 1] = 0xFF;
        offset += 2;

        // Verify offsets are correct
        if (sigOffset + signatureBytes.length > totalSize) {
            throw new Error(`Signature offset ${sigOffset} + length ${signatureBytes.length} exceeds total size ${totalSize}`);
        }
        if (pubkeyOffset + publicKeyBytes.length > totalSize) {
            throw new Error(`Pubkey offset ${pubkeyOffset} + length ${publicKeyBytes.length} exceeds total size ${totalSize}`);
        }
        if (messageOffset + messageBytes.length > totalSize) {
            throw new Error(`Message offset ${messageOffset} + length ${messageBytes.length} exceeds total size ${totalSize}`);
        }

        // Signature data (64 bytes)
        dataLayout.set(signatureBytes, sigOffset);

        // Public key data (32 bytes)
        dataLayout.set(publicKeyBytes, pubkeyOffset);

        // Message data
        dataLayout.set(messageBytes, messageOffset);

        console.log('Ed25519 instruction created successfully, total size:', totalSize);

        return new solanaWeb3.TransactionInstruction({
            keys: [],
            programId: solanaWeb3.Ed25519Program.programId,
            data: Buffer.from(dataLayout)
        });
    }

    /**
     * Initialize reputation account if it doesn't exist
     */
    async ensureReputationAccount(entity, payer) {
        const { pda } = this.deriveReputationPDA(entity);

        try {
            const accountInfo = await this.connection.getAccountInfo(pda);
            if (accountInfo) {
                console.log(`Reputation account already exists for ${entity.toString().substring(0, 8)}...`);
                return pda;
            }
        } catch (e) {
            // Account doesn't exist, create it
        }

        console.log(`Creating reputation account for ${entity.toString().substring(0, 8)}...`);

        // Build init_reputation instruction
        const discriminator = Buffer.from([
            236, 239, 233, 112, 220, 149, 26, 175  // init_reputation discriminator from IDL
        ]);

        const data = discriminator;

        const instruction = new solanaWeb3.TransactionInstruction({
            keys: [
                { pubkey: pda, isSigner: false, isWritable: true },
                { pubkey: entity, isSigner: false, isWritable: false },
                { pubkey: payer, isSigner: true, isWritable: true },
                { pubkey: solanaWeb3.SystemProgram.programId, isSigner: false, isWritable: false },
            ],
            programId: this.programId,
            data
        });

        const transaction = new solanaWeb3.Transaction().add(instruction);

        return { transaction, pda };
    }

    /**
     * Create and fund escrow
     */
    async createEscrow(wallet, amount, transactionId, apiPublicKey) {
        try {
            console.log('createEscrow called with:', { wallet: wallet.toString(), amount, transactionId, api: apiPublicKey.toString() });
            const { pda: escrowPda } = this.deriveEscrowPDA(transactionId);

        // Check if escrow already exists
        const accountInfo = await this.connection.getAccountInfo(escrowPda);
        if (accountInfo) {
            console.log('Escrow already exists for transaction ID:', transactionId, '- skipping creation');
            return null; // Return null to indicate escrow already exists
        }

        console.log('Creating new escrow:', { transactionId, amount, escrowPda: escrowPda.toString() });

        const amountLamports = Math.floor(amount * solanaWeb3.LAMPORTS_PER_SOL);
        const timeLock = 86400; // 24 hours

        // Build initialize_escrow instruction
        const discriminator = Buffer.from([243, 160, 77, 153, 11, 92, 48, 209]); // initialize_escrow discriminator from IDL

        const dataLayout = Buffer.alloc(1000); // Allocate enough space
        let offset = 0;

        // Discriminator
        discriminator.copy(dataLayout, offset);
        offset += 8;

        // amount (u64 LE)
        dataLayout.writeBigUInt64LE(BigInt(amountLamports), offset);
        offset += 8;

        // time_lock (i64 LE)
        dataLayout.writeBigInt64LE(BigInt(timeLock), offset);
        offset += 8;

        // transaction_id (String - length prefix + bytes)
        const txIdBytes = Buffer.from(transactionId, 'utf-8');
        dataLayout.writeUInt32LE(txIdBytes.length, offset);
        offset += 4;
        txIdBytes.copy(dataLayout, offset);
        offset += txIdBytes.length;

        const data = dataLayout.slice(0, offset);

        console.log('Initialize escrow instruction:', {
            escrowPda: escrowPda.toString(),
            agent: wallet.toString(),
            api: apiPublicKey.toString(),
            programId: this.programId.toString(),
            dataLength: data.length,
            amount: amountLamports,
            timeLock,
            transactionId,
            dataHex: Array.from(data).map(b => b.toString(16).padStart(2, '0')).join('')
        });

        console.log('=== CHECKPOINT 1: After logging instruction ===');
        console.log('About to create TransactionInstruction...');
        console.log('=== CHECKPOINT 2: Before creating instruction ===');

        const instruction = new solanaWeb3.TransactionInstruction({
            keys: [
                { pubkey: escrowPda, isSigner: false, isWritable: true },
                { pubkey: wallet, isSigner: true, isWritable: true },
                { pubkey: apiPublicKey, isSigner: false, isWritable: false },
                { pubkey: solanaWeb3.SystemProgram.programId, isSigner: false, isWritable: false },
            ],
            programId: this.programId,
            data
        });

        console.log('TransactionInstruction created successfully');

        try {
            console.log('Building transaction...');
            const transaction = new solanaWeb3.Transaction().add(instruction);
            console.log('Transaction built successfully');
            return transaction;
        } catch (txError) {
            console.error('CRITICAL ERROR building transaction:', txError);
            console.error('Error details:', {
                name: txError.name,
                message: txError.message,
                stack: txError.stack
            });
            throw txError;
        }
        } catch (error) {
            console.error('FATAL ERROR in createEscrow:', error);
            console.error('Error type:', error.constructor.name);
            console.error('Error message:', error.message);
            console.error('Stack:', error.stack);
            throw error;
        }
    }

    /**
     * Mark escrow as disputed
     */
    async markDisputed(wallet, transactionId) {
        const { pda: escrowPda } = this.deriveEscrowPDA(transactionId);
        const { pda: reputationPda } = this.deriveReputationPDA(wallet);

        // Build mark_disputed instruction (discriminator would need to be computed)
        const discriminator = Buffer.from([0x3d, 0x5e, 0xa2, 0x4f, 0x8c, 0x1b, 0x7a, 0x6d]);

        const instruction = new solanaWeb3.TransactionInstruction({
            keys: [
                { pubkey: escrowPda, isSigner: false, isWritable: true },
                { pubkey: reputationPda, isSigner: false, isWritable: true },
                { pubkey: wallet, isSigner: true, isWritable: true },
            ],
            programId: this.programId,
            data: discriminator
        });

        return new solanaWeb3.Transaction().add(instruction);
    }

    /**
     * Resolve dispute with oracle signature
     */
    async resolveDispute(transactionId, assessment) {
        const { pda: escrowPda } = this.deriveEscrowPDA(transactionId);

        // Fetch escrow to get agent and API addresses
        const escrowAccount = await this.connection.getAccountInfo(escrowPda);
        if (!escrowAccount) {
            throw new Error('Escrow account not found');
        }

        // Parse escrow data (simplified - would need proper deserialization)
        const escrowData = escrowAccount.data;
        const agentPubkey = new solanaWeb3.PublicKey(escrowData.slice(8, 40));
        const apiPubkey = new solanaWeb3.PublicKey(escrowData.slice(40, 72));

        const { pda: agentReputation } = this.deriveReputationPDA(agentPubkey);
        const { pda: apiReputation } = this.deriveReputationPDA(apiPubkey);

        // Create Ed25519 verification instruction
        const ed25519Ix = this.createEd25519Instruction(
            assessment.signature,
            assessment.oraclePublicKey,
            assessment.message
        );

        // Build resolve_dispute instruction
        const discriminator = Buffer.from([231, 6, 202, 6, 96, 103, 12, 230]); // resolve_dispute discriminator from IDL

        console.log('Building resolve_dispute instruction:', {
            qualityScore: assessment.qualityScore,
            refundPercentage: assessment.refundPercentage,
            signatureLength: assessment.signature.length,
            signatureType: typeof assessment.signature,
            oracleKey: assessment.oraclePublicKey.toString()
        });

        const dataLayout = Buffer.alloc(100);
        let offset = 0;

        discriminator.copy(dataLayout, offset);
        offset += 8;

        // quality_score (u8)
        dataLayout.writeUInt8(assessment.qualityScore, offset);
        offset += 1;

        // refund_percentage (u8)
        dataLayout.writeUInt8(assessment.refundPercentage, offset);
        offset += 1;

        // signature ([u8; 64])
        const sigBytes = Buffer.from(assessment.signature);
        if (sigBytes.length !== 64) {
            throw new Error(`Signature must be 64 bytes, got ${sigBytes.length}`);
        }
        sigBytes.copy(dataLayout, offset);
        offset += 64;

        const data = dataLayout.slice(0, offset);
        console.log('Instruction data size:', data.length, 'bytes');

        const resolveIx = new solanaWeb3.TransactionInstruction({
            keys: [
                { pubkey: escrowPda, isSigner: false, isWritable: true },
                { pubkey: agentPubkey, isSigner: false, isWritable: true },
                { pubkey: apiPubkey, isSigner: false, isWritable: true },
                { pubkey: assessment.oraclePublicKey, isSigner: false, isWritable: false },
                { pubkey: solanaWeb3.SYSVAR_INSTRUCTIONS_PUBKEY, isSigner: false, isWritable: false },
                { pubkey: agentReputation, isSigner: false, isWritable: true },
                { pubkey: apiReputation, isSigner: false, isWritable: true },
                { pubkey: solanaWeb3.SystemProgram.programId, isSigner: false, isWritable: false },
            ],
            programId: this.programId,
            data
        });

        // Ed25519 instruction MUST come first
        return new solanaWeb3.Transaction().add(ed25519Ix).add(resolveIx);
    }

    /**
     * Fetch recent dispute resolutions from chain
     */
    async fetchRecentDisputes(limit = 10) {
        try {
            const signatures = await this.connection.getSignaturesForAddress(
                this.programId,
                { limit }
            );

            const disputes = [];

            for (const sig of signatures) {
                try {
                    const tx = await this.connection.getParsedTransaction(sig.signature, {
                        maxSupportedTransactionVersion: 0
                    });

                    if (tx && tx.meta && tx.meta.logMessages) {
                        // Look for DisputeResolved event
                        const disputeLog = tx.meta.logMessages.find(log => log.includes('DisputeResolved'));
                        if (disputeLog) {
                            disputes.push({
                                signature: sig.signature,
                                slot: sig.slot,
                                timestamp: sig.blockTime,
                                logs: tx.meta.logMessages
                            });
                        }
                    }
                } catch (e) {
                    console.error(`Failed to fetch transaction ${sig.signature}:`, e);
                }
            }

            return disputes;
        } catch (error) {
            console.error('Failed to fetch disputes:', error);
            return [];
        }
    }

    /**
     * Send and confirm transaction
     */
    async sendAndConfirm(transaction, wallet) {
        try {
            // Get recent blockhash
            const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash();
            transaction.recentBlockhash = blockhash;
            transaction.feePayer = wallet;

            // Pre-flight simulation
            try {
                const simulation = await this.connection.simulateTransaction(transaction);
                if (simulation.value.err) {
                    console.error('Pre-flight validation failed:', simulation.value);

                    // Log full simulation details
                    if (simulation.value.logs) {
                        console.error('Program logs:', simulation.value.logs);
                    }

                    // Try to decode Anchor error
                    let errorMsg = JSON.stringify(simulation.value.err);
                    if (simulation.value.err.InstructionError) {
                        const [idx, err] = simulation.value.err.InstructionError;

                        // Decode common Anchor errors
                        if (typeof err === 'object') {
                            if (err.Custom !== undefined) {
                                const errorCode = err.Custom;
                                const anchorErrors = {
                                    1: 'Anchor constraint violation (account not writable or already initialized)',
                                    100: 'InvalidAmount',
                                    101: 'AmountTooLarge',
                                    102: 'InvalidTimeLock',
                                    103: 'InvalidTransactionId',
                                    104: 'EscrowNotActive',
                                    105: 'EscrowNotDisputed',
                                    106: 'UnauthorizedCaller',
                                    107: 'InvalidSignature',
                                    108: 'TimeLockNotExpired'
                                };
                                errorMsg = `Instruction ${idx}: ${anchorErrors[errorCode] || `Custom error ${errorCode}`}`;
                            } else if (err.InvalidInstruction !== undefined) {
                                errorMsg = `Instruction ${idx}: Invalid instruction - check discriminator and data format`;
                            }
                        }
                    }

                    throw new Error(`Transaction validation failed: ${errorMsg}`);
                }
                console.log('Pre-flight validation passed:', simulation.value);
            } catch (simError) {
                console.error('Validation error:', simError);
                throw simError;
            }

            // Use signAndSendTransaction for better Phantom compatibility
            if (window.solana && window.solana.signAndSendTransaction) {
                console.log('Requesting wallet signature...');
                const { signature } = await window.solana.signAndSendTransaction(transaction);
                console.log('Transaction sent with signature:', signature);

                // Confirm transaction
                const confirmation = await this.connection.confirmTransaction({
                    signature,
                    blockhash,
                    lastValidBlockHeight
                }, 'confirmed');

                if (confirmation.value.err) {
                    throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
                }

                return signature;
            } else {
                console.log('Using fallback: signTransaction + sendRawTransaction');
                // Fallback to signTransaction + sendRawTransaction
                const signed = await window.solana.signTransaction(transaction);

                // Send transaction
                const signature = await this.connection.sendRawTransaction(signed.serialize(), {
                    skipPreflight: false,
                    maxRetries: 3
                });

                console.log('Transaction sent:', signature);

                // Confirm transaction
                const confirmation = await this.connection.confirmTransaction({
                    signature,
                    blockhash,
                    lastValidBlockHeight
                }, 'confirmed');

                if (confirmation.value.err) {
                    throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
                }

                return signature;
            }
        } catch (error) {
            console.error('sendAndConfirm failed:', error);
            console.error('Error type:', error.constructor.name);
            console.error('Error message:', error.message);
            if (error.logs) {
                console.error('Transaction logs:', error.logs);
            }
            throw error;
        }
    }
}

// Global instance
window.oracleSystem = new OracleTransactionSystem();
