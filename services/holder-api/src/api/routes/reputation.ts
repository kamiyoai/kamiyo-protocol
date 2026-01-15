import { Router, Request, Response } from 'express';
import type { Router as IRouter } from 'express-serve-static-core';
import { getProtocol } from '../../protocol.js';
import { logger } from '../../logger.js';

const router: IRouter = Router();

router.post('/proof', async (req: Request, res: Response) => {
  const { threshold, score } = req.body;

  if (typeof threshold !== 'number' || threshold < 0 || threshold > 100) {
    res.status(400).json({
      error: { code: 'INVALID_REQUEST', message: 'Threshold must be 0-100' },
    });
    return;
  }

  if (typeof score !== 'number' || score < 0 || score > 100) {
    res.status(400).json({
      error: { code: 'INVALID_REQUEST', message: 'Score must be 0-100' },
    });
    return;
  }

  if (score < threshold) {
    res.status(400).json({
      error: {
        code: 'INVALID_REQUEST',
        message: 'Score must be >= threshold to generate proof',
      },
    });
    return;
  }

  const protocol = getProtocol();
  if (!protocol.hasProver()) {
    res.status(503).json({
      error: { code: 'SERVICE_UNAVAILABLE', message: 'ZK prover not available' },
    });
    return;
  }

  try {
    const proof = await protocol.generateReputationProof(score, threshold);

    if (!proof) {
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: 'Proof generation failed' },
      });
      return;
    }

    res.json({
      proof: {
        a: proof.a.map(String),
        b: proof.b.map((row) => row.map(String)),
        c: proof.c.map(String),
        protocol: 'groth16',
        curve: 'bn128',
      },
      publicInputs: proof.publicInputs.map(String),
      commitment: proof.commitment,
      threshold,
      tier:
        threshold >= 90 ? 4 : threshold >= 75 ? 3 : threshold >= 50 ? 2 : threshold >= 25 ? 1 : 0,
      generatedAt: Date.now(),
    });
  } catch (err) {
    logger.error('Proof generation failed', { error: String(err) });
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Proof generation failed' },
    });
  }
});

router.post('/verify', async (req: Request, res: Response) => {
  const { proof, publicInputs, commitment } = req.body;

  if (!proof || !publicInputs || !commitment) {
    res.status(400).json({
      error: { code: 'INVALID_REQUEST', message: 'Missing proof, publicInputs, or commitment' },
    });
    return;
  }

  const protocol = getProtocol();
  if (!protocol.hasProver()) {
    res.status(503).json({
      error: { code: 'SERVICE_UNAVAILABLE', message: 'ZK prover not available' },
    });
    return;
  }

  try {
    const proofData = {
      a: proof.a.map(BigInt) as [bigint, bigint],
      b: proof.b.map((row: string[]) => row.map(BigInt)) as [[bigint, bigint], [bigint, bigint]],
      c: proof.c.map(BigInt) as [bigint, bigint],
      publicInputs: publicInputs.map(BigInt),
      commitment,
    };

    const isValid = await protocol.verifyProof(proofData);

    res.json({
      valid: isValid,
      verifiedAt: Date.now(),
    });
  } catch (err) {
    logger.error('Proof verification failed', { error: String(err) });
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Proof verification failed' },
    });
  }
});

export default router;
