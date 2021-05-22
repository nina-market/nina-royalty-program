// TODO: use the `@solana/spl-token` package instead of utils here.

const anchor = require("@project-serum/anchor");
const serumCmn = require("@project-serum/common");
const TokenInstructions = require("@project-serum/serum").TokenInstructions;

// TODO: remove this constant once @project-serum/serum uses the same version
//       of @solana/web3.js as anchor (or switch packages).
const TOKEN_PROGRAM_ID = new anchor.web3.PublicKey(
  TokenInstructions.TOKEN_PROGRAM_ID.toString()
);

const ASSOCIATED_TOKEN_PROGRAM_ID = new anchor.web3.PublicKey(
  'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL'
);

// Our own sleep function.
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getTokenAccount(provider, addr) {
  return await serumCmn.getTokenAccount(provider, addr);
}

const bnToDecimal = (amount) => {
  return amount / Math.pow(10, 6)
}

async function createMint(provider, authority, decimals=0) {
  if (authority === undefined) {
    authority = provider.wallet.publicKey;
  }
  const mint = new anchor.web3.Account();
  const instructions = await createMintInstructions(
    provider,
    authority,
    mint.publicKey,
    decimals,
  );

  const tx = new anchor.web3.Transaction();
  tx.add(...instructions);

  await provider.send(tx, [mint]);

  return mint.publicKey;
}

async function createMintInstructions(provider, authority, mint, decimals) {
  let instructions = [
    anchor.web3.SystemProgram.createAccount({
      fromPubkey: provider.wallet.publicKey,
      newAccountPubkey: mint,
      space: 82,
      lamports: await provider.connection.getMinimumBalanceForRentExemption(82),
      programId: TOKEN_PROGRAM_ID,
    }),
    TokenInstructions.initializeMint({
      mint,
      decimals,
      mintAuthority: authority,
    }),
  ];
  return instructions;
}

async function createTokenAccount(provider, mint, owner) {
  const vault = new anchor.web3.Account();
  const tx = new anchor.web3.Transaction();
  tx.add(
    ...(await createTokenAccountInstrs(provider, vault.publicKey, mint, owner))
  );
  await provider.send(tx, [vault]);
  return vault.publicKey;
}

async function createTokenAccountInstrs(
  provider,
  newAccountPubkey,
  mint,
  owner,
  lamports
) {
  if (lamports === undefined) {
    lamports = await provider.connection.getMinimumBalanceForRentExemption(165);
  }
  return [
    anchor.web3.SystemProgram.createAccount({
      fromPubkey: provider.wallet.publicKey,
      newAccountPubkey,
      space: 165,
      lamports,
      programId: TOKEN_PROGRAM_ID,
    }),
    TokenInstructions.initializeAccount({
      account: newAccountPubkey,
      mint,
      owner,
    }),
  ];
}

async function mintToAccount(
  provider,
  mint,
  destination,
  amount,
  mintAuthority
) {
  // mint authority is the provider
  const tx = new anchor.web3.Transaction();
  tx.add(
    ...(await createMintToAccountInstrs(
      mint,
      destination,
      amount,
      mintAuthority
    ))
  );
  await provider.send(tx, []);
  return;
}

async function createMintToAccountInstrs(
  mint,
  destination,
  amount,
  mintAuthority
) {
  return [
    TokenInstructions.mintTo({
      mint,
      destination: destination,
      amount: amount,
      mintAuthority: mintAuthority,
    }),
  ];
}

const findAssociatedTokenAddress = async (
  walletAddress,
  tokenMintAddress
) => {
  return (
    await anchor.web3.PublicKey.findProgramAddress(
      [walletAddress.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), tokenMintAddress.toBuffer()],
      ASSOCIATED_TOKEN_PROGRAM_ID
    )
  )[0]
};

const findOrCreateAssociatedTokenAccount = async(
  provider,
  owner,
  systemProgramId,
  clockSysvarId,
  splTokenMintAddress,
  sendTransaction=false,
  skipLookup=false,
) => {
  const associatedTokenAddress = await findAssociatedTokenAddress(
    owner,
    splTokenMintAddress
  );

  let userAssociatedTokenAddress = null;
  if (!skipLookup) {
    await provider.connection.getParsedTokenAccountsByOwner(
      owner,
      {mint: splTokenMintAddress}
    )
  }
  
  if (!userAssociatedTokenAddress || !userAssociatedTokenAddress.value.length > 0) {

    const keys = [
      {
        pubkey: provider.wallet.publicKey,
        isSigner: true,
        isWritable: true
      },
      {
        pubkey: associatedTokenAddress,
        isSigner: false,
        isWritable: true
      },
      {
        pubkey: owner,
        isSigner: false,
        isWritable: false
      },
      {
        pubkey: splTokenMintAddress,
        isSigner: false,
        isWritable: false
      },
      {
        pubkey: systemProgramId,
        isSigner: false,
        isWritable: false
      },
      {
        pubkey: TOKEN_PROGRAM_ID,
        isSigner: false,
        isWritable: false
      },
      {
        pubkey: anchor.web3.SYSVAR_RENT_PUBKEY,
        isSigner: false,
        isWritable: false
      }
    ];

    const ix = new anchor.web3.TransactionInstruction({
      keys,
      programId: ASSOCIATED_TOKEN_PROGRAM_ID,
      data: Buffer.from([])
    });

    if (sendTransaction) {
      const tx = new anchor.web3.Transaction();
      tx.add(ix);
      await provider.send(tx, []);
    }
    return [associatedTokenAddress, ix];
  } else {
    return [associatedTokenAddress, undefined];
  }
}

module.exports = {
  TOKEN_PROGRAM_ID,
  sleep,
  getTokenAccount,
  createMint,
  createMintInstructions,
  createTokenAccount,
  mintToAccount,
  findOrCreateAssociatedTokenAccount,
  bnToDecimal,
};
