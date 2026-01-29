import { ethers } from 'ethers';
import {
  ValidationRequest,
  ValidationResponse,
  ValidationSummary,
  ValidationStatus,
  ValidationRequestResult,
  TxResult,
  KamiyoTier,
  TIER_TO_RESPONSE,
  RESPONSE_TO_TIER,
} from '../types';
import { ERC8004_VALIDATION_REGISTRY_ABI } from '../abis';

/**
 * Client for ERC-8004 Validation Registry
 */
export class ValidationClient {
  private contract: ethers.Contract;
  private provider: ethers.Provider;

  constructor(
    address: string,
    providerOrSigner: ethers.Provider | ethers.Signer
  ) {
    if ('getAddress' in providerOrSigner) {
      this.provider = providerOrSigner.provider!;
      this.contract = new ethers.Contract(
        address,
        ERC8004_VALIDATION_REGISTRY_ABI,
        providerOrSigner
      );
    } else {
      this.provider = providerOrSigner;
      this.contract = new ethers.Contract(
        address,
        ERC8004_VALIDATION_REGISTRY_ABI,
        providerOrSigner
      );
    }
  }

  /**
   * Connect with a signer for write operations
   */
  connect(signer: ethers.Signer): ValidationClient {
    return new ValidationClient(this.contract.target as string, signer);
  }

  /**
   * Request validation from a validator
   */
  async requestValidation(
    validatorAddress: string,
    agentId: bigint,
    requestURI: string
  ): Promise<ValidationRequestResult> {
    const requestHash = ethers.keccak256(ethers.toUtf8Bytes(requestURI));

    const tx = await this.contract.validationRequest(
      validatorAddress,
      agentId,
      requestURI,
      requestHash
    );

    const receipt = await tx.wait();
    if (!receipt) throw new Error('Transaction failed');

    return {
      txHash: tx.hash,
      blockNumber: receipt.blockNumber,
      success: true,
      requestHash,
    };
  }

  /**
   * Submit a validation response (for validators)
   */
  async submitResponse(
    requestHash: string,
    response: number,
    responseURI: string,
    tag?: string
  ): Promise<TxResult> {
    const responseHash = ethers.keccak256(ethers.toUtf8Bytes(responseURI));
    const tagBytes = tag
      ? ethers.encodeBytes32String(tag.slice(0, 31))
      : ethers.ZeroHash;

    const tx = await this.contract.validationResponse(
      requestHash,
      response,
      responseURI,
      responseHash,
      tagBytes
    );

    const receipt = await tx.wait();

    return {
      txHash: tx.hash,
      blockNumber: receipt?.blockNumber,
      success: true,
    };
  }

  /**
   * Submit validation response from KAMIYO tier
   */
  async submitResponseFromTier(
    requestHash: string,
    tier: KamiyoTier,
    responseURI: string
  ): Promise<TxResult> {
    const responseHash = ethers.keccak256(ethers.toUtf8Bytes(responseURI));

    const tx = await this.contract.validationResponseFromTier(
      requestHash,
      tier,
      responseURI,
      responseHash
    );

    const receipt = await tx.wait();

    return {
      txHash: tx.hash,
      blockNumber: receipt?.blockNumber,
      success: true,
    };
  }

  /**
   * Get validation status for a request
   */
  async getValidationStatus(requestHash: string): Promise<ValidationStatus> {
    const result = await this.contract.getValidationStatus(requestHash);

    return {
      validatorAddress: result.validatorAddress,
      agentId: result.agentId,
      response: result.response,
      responseHash: result.responseHash,
      tag: this.decodeTag(result.tag),
      lastUpdate: Number(result.lastUpdate),
      responded: result.lastUpdate > 0,
    };
  }

  /**
   * Get validation summary for an agent
   */
  async getSummary(
    agentId: bigint,
    validatorAddresses: string[] = [],
    tag?: string
  ): Promise<ValidationSummary> {
    const tagBytes = tag
      ? ethers.encodeBytes32String(tag.slice(0, 31))
      : ethers.ZeroHash;

    const result = await this.contract.getSummary(
      agentId,
      validatorAddresses,
      tagBytes
    );

    return {
      count: Number(result.count),
      averageResponse: result.averageResponse,
    };
  }

  /**
   * Get all validations for an agent
   */
  async getAgentValidations(agentId: bigint): Promise<string[]> {
    return this.contract.getAgentValidations(agentId);
  }

  /**
   * Get all requests for a validator
   */
  async getValidatorRequests(validatorAddress: string): Promise<string[]> {
    return this.contract.getValidatorRequests(validatorAddress);
  }

  /**
   * Check if address is a registered validator
   */
  async isValidator(address: string): Promise<boolean> {
    return this.contract.isValidator(address);
  }

  /**
   * Get all registered validators
   */
  async getValidators(): Promise<string[]> {
    return this.contract.getValidators();
  }

  /**
   * Get count of active validators
   */
  async getActiveValidatorCount(): Promise<number> {
    const count = await this.contract.getActiveValidatorCount();
    return Number(count);
  }

  /**
   * Convert KAMIYO tier to ERC-8004 response value
   */
  tierToResponse(tier: KamiyoTier): number {
    return TIER_TO_RESPONSE[tier];
  }

  /**
   * Convert ERC-8004 response to KAMIYO tier
   */
  responseToTier(response: number): KamiyoTier {
    return RESPONSE_TO_TIER(response);
  }

  /**
   * Get contract address
   */
  get address(): string {
    return this.contract.target as string;
  }

  private decodeTag(tag: string): string {
    if (tag === ethers.ZeroHash) return '';
    try {
      return ethers.decodeBytes32String(tag);
    } catch {
      return '';
    }
  }
}
