/**
 * Priority Fee Calculator Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PublicKey } from '@solana/web3.js';
import { PriorityFeeCalculator } from '../src/priority-fees';
import { FEE_STRATEGIES, COMPUTE_UNITS } from '../src/constants';

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('PriorityFeeCalculator', () => {
    let calculator: PriorityFeeCalculator;

    beforeEach(() => {
        calculator = new PriorityFeeCalculator('test-api-key', 'mainnet-beta', 5000);
        mockFetch.mockReset();
    });

    afterEach(() => {
        calculator.clearCache();
    });

    describe('getEstimate', () => {
        it('should fetch priority fee estimate from Helius', async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => ({
                    jsonrpc: '2.0',
                    id: 'priority-fee-estimate',
                    result: {
                        priorityFeeEstimate: 5000,
                        priorityFeeLevels: {
                            min: 0,
                            low: 1000,
                            medium: 5000,
                            high: 10000,
                            veryHigh: 50000,
                            unsafeMax: 100000
                        },
                        percentiles: { 50: 5000, 75: 10000, 90: 25000 }
                    }
                })
            });

            const accounts = [PublicKey.unique()];
            const estimate = await calculator.getEstimate(accounts);

            expect(estimate.recommended).toBe(5000);
            expect(estimate.levels.medium).toBe(5000);
            expect(estimate.levels.high).toBe(10000);
            expect(mockFetch).toHaveBeenCalledOnce();
        });

        it('should cache estimates', async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => ({
                    jsonrpc: '2.0',
                    id: 'priority-fee-estimate',
                    result: { priorityFeeEstimate: 5000 }
                })
            });

            const accounts = [PublicKey.unique()];

            await calculator.getEstimate(accounts);
            await calculator.getEstimate(accounts);

            expect(mockFetch).toHaveBeenCalledOnce();
        });

        it('should throw on API error', async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => ({
                    jsonrpc: '2.0',
                    id: 'priority-fee-estimate',
                    error: { code: -32000, message: 'Rate limit exceeded' }
                })
            });

            const accounts = [PublicKey.unique()];

            await expect(calculator.getEstimate(accounts)).rejects.toThrow('Rate limit exceeded');
        });

        it('should throw on HTTP error', async () => {
            mockFetch.mockResolvedValue({
                ok: false,
                status: 500,
                statusText: 'Internal Server Error'
            });

            const accounts = [PublicKey.unique()];

            await expect(calculator.getEstimate(accounts)).rejects.toThrow('500');
        });
    });

    describe('calculateFee', () => {
        beforeEach(() => {
            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => ({
                    jsonrpc: '2.0',
                    id: 'priority-fee-estimate',
                    result: { priorityFeeEstimate: 10000 }
                })
            });
        });

        it('should calculate fee with economy strategy', async () => {
            const accounts = [PublicKey.unique()];
            const fee = await calculator.calculateFee(accounts, 'economy');

            expect(fee).toBe(5000); // 10000 * 0.5
        });

        it('should calculate fee with standard strategy', async () => {
            const accounts = [PublicKey.unique()];
            const fee = await calculator.calculateFee(accounts, 'standard');

            expect(fee).toBe(10000); // 10000 * 1.0
        });

        it('should calculate fee with urgent strategy', async () => {
            const accounts = [PublicKey.unique()];
            const fee = await calculator.calculateFee(accounts, 'urgent');

            expect(fee).toBe(25000); // 10000 * 2.5
        });

        it('should cap fee at strategy max', async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => ({
                    jsonrpc: '2.0',
                    id: 'priority-fee-estimate',
                    result: { priorityFeeEstimate: 1000000 } // Very high fee
                })
            });

            // Create new calculator without cache
            const newCalc = new PriorityFeeCalculator('test-api-key', 'mainnet-beta', 5000);
            const accounts = [PublicKey.unique()];
            const fee = await newCalc.calculateFee(accounts, 'economy');

            expect(fee).toBe(FEE_STRATEGIES.economy.maxFee);
        });
    });

    describe('getOperationFee', () => {
        beforeEach(() => {
            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => ({
                    jsonrpc: '2.0',
                    id: 'priority-fee-estimate',
                    result: { priorityFeeEstimate: 10000 }
                })
            });
        });

        it('should calculate operation fee with compute units', async () => {
            const escrowPda = PublicKey.unique();
            const result = await calculator.getOperationFee('INITIALIZE_ESCROW', escrowPda);

            expect(result.computeUnits).toBe(COMPUTE_UNITS.INITIALIZE_ESCROW);
            expect(result.priorityFee).toBeGreaterThan(0);
            expect(result.totalFee).toBeGreaterThan(5000); // Base fee is 5000
        });

        it('should use different strategies for different operations', async () => {
            const escrowPda = PublicKey.unique();

            const standardFee = await calculator.getOperationFee('INITIALIZE_ESCROW', escrowPda, [], 'standard');
            const urgentFee = await calculator.getOperationFee('RESOLVE_DISPUTE', escrowPda, [], 'urgent');

            expect(urgentFee.totalFee).toBeGreaterThan(standardFee.totalFee);
        });
    });

    describe('getAllStrategyFees', () => {
        beforeEach(() => {
            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => ({
                    jsonrpc: '2.0',
                    id: 'priority-fee-estimate',
                    result: { priorityFeeEstimate: 10000 }
                })
            });
        });

        it('should return fees for all strategies', async () => {
            const accounts = [PublicKey.unique()];
            const fees = await calculator.getAllStrategyFees(accounts);

            expect(fees.economy).toBe(5000);
            expect(fees.standard).toBe(10000);
            expect(fees.fast).toBe(15000);
            expect(fees.urgent).toBe(25000);
            expect(fees.critical).toBe(50000);
        });
    });

    describe('cache management', () => {
        it('should clear cache', async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => ({
                    jsonrpc: '2.0',
                    id: 'priority-fee-estimate',
                    result: { priorityFeeEstimate: 5000 }
                })
            });

            const accounts = [PublicKey.unique()];
            await calculator.getEstimate(accounts);

            calculator.clearCache();
            await calculator.getEstimate(accounts);

            expect(mockFetch).toHaveBeenCalledTimes(2);
        });

        it('should return cache stats', async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                json: async () => ({
                    jsonrpc: '2.0',
                    id: 'priority-fee-estimate',
                    result: { priorityFeeEstimate: 5000 }
                })
            });

            const accounts = [PublicKey.unique()];
            await calculator.getEstimate(accounts);

            const stats = calculator.getCacheStats();

            expect(stats.size).toBe(1);
            expect(stats.entries.length).toBe(1);
            expect(stats.entries[0].age).toBeLessThan(1000);
        });
    });
});
