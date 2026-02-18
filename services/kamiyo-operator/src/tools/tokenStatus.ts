import { Connection, PublicKey } from '@solana/web3.js';

const TOKEN_METADATA_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');

export function deriveMetadataPda(mint: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('metadata'), TOKEN_METADATA_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    TOKEN_METADATA_PROGRAM_ID
  );
  return pda;
}

function formatTokenAmount(amount: bigint, decimals: number): string {
  if (decimals <= 0) return amount.toString();

  const base = 10n ** BigInt(decimals);
  const whole = amount / base;
  const frac = amount % base;

  const fracStr = frac.toString().padStart(decimals, '0').replace(/0+$/, '');
  return fracStr ? `${whole.toString()}.${fracStr}` : whole.toString();
}

function readU32LE(buf: Buffer, offset: number): { value: number; next: number } {
  if (offset + 4 > buf.length) throw new Error('unexpected eof');
  return { value: buf.readUInt32LE(offset), next: offset + 4 };
}

function readBorshString(buf: Buffer, offset: number): { value: string; next: number } {
  const { value: len, next } = readU32LE(buf, offset);
  const end = next + len;
  if (end > buf.length) throw new Error('unexpected eof');
  const raw = buf.subarray(next, end);
  return { value: raw.toString('utf8').replace(/\0+$/g, ''), next: end };
}

export function parseMetaplexMetadataMinimal(data: Buffer):
  | {
      updateAuthority: string;
      mint: string;
      name: string;
      symbol: string;
      uri: string;
      sellerFeeBasisPoints: number;
    }
  | null {
  try {
    let o = 0;

    // key: u8
    if (data.length < 1 + 32 + 32) return null;
    o += 1;

    const updateAuthority = new PublicKey(data.subarray(o, o + 32)).toBase58();
    o += 32;

    const mint = new PublicKey(data.subarray(o, o + 32)).toBase58();
    o += 32;

    const name = readBorshString(data, o);
    o = name.next;

    const symbol = readBorshString(data, o);
    o = symbol.next;

    const uri = readBorshString(data, o);
    o = uri.next;

    if (o + 2 > data.length) return null;
    const sellerFeeBasisPoints = data.readUInt16LE(o);

    return {
      updateAuthority,
      mint,
      name: name.value,
      symbol: symbol.value,
      uri: uri.value,
      sellerFeeBasisPoints,
    };
  } catch {
    return null;
  }
}

export async function fetchTokenStatus(params: { connection: Connection; mint: PublicKey }) {
  const { connection, mint } = params;

  const parsedInfo = await connection.getParsedAccountInfo(mint, 'confirmed');
  if (!parsedInfo.value) {
    return {
      mint: mint.toBase58(),
      exists: false,
    };
  }

  const ownerProgram = parsedInfo.value.owner.toBase58();
  const data = parsedInfo.value.data as any;

  let mintInfo: any | null = null;
  if (data && typeof data === 'object' && 'parsed' in data) {
    if (data.parsed?.type === 'mint') mintInfo = data.parsed?.info ?? null;
  }

  const metadataPda = deriveMetadataPda(mint);
  const metadataInfo = await connection.getAccountInfo(metadataPda, 'confirmed');

  const decimals = mintInfo ? Number(mintInfo.decimals) : null;
  const supplyRaw = mintInfo?.supply ? BigInt(String(mintInfo.supply)) : null;

  const metaplex = metadataInfo?.data ? parseMetaplexMetadataMinimal(metadataInfo.data) : null;

  return {
    mint: mint.toBase58(),
    exists: true,
    ownerProgram,
    mintInfo: mintInfo
      ? {
          decimals,
          supplyRaw: supplyRaw?.toString() ?? null,
          supplyUi: supplyRaw !== null && decimals !== null ? formatTokenAmount(supplyRaw, decimals) : null,
          isInitialized: mintInfo.isInitialized ?? null,
          mintAuthority: mintInfo.mintAuthority ?? null,
          freezeAuthority: mintInfo.freezeAuthority ?? null,
        }
      : null,
    metadata: {
      pda: metadataPda.toBase58(),
      exists: metadataInfo !== null,
      ...(metaplex
        ? {
            updateAuthority: metaplex.updateAuthority,
            name: metaplex.name,
            symbol: metaplex.symbol,
            uri: metaplex.uri,
            sellerFeeBasisPoints: metaplex.sellerFeeBasisPoints,
          }
        : {}),
    },
  };
}
