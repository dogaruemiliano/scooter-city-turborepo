import type { Prisma, Wallet } from "../generated/prisma/client";
import { WalletBalanceBucket, WalletType } from "../generated/prisma/client";

const USER_WALLET_NAME = "Personal wallet";
const DEFAULT_CURRENCY = "RON";

export function userWalletCreateInput(): Prisma.WalletCreateNestedOneWithoutOwnerInput {
  return {
    create: {
      type: WalletType.USER,
      name: USER_WALLET_NAME,
      balances: {
        create: {
          bucket: WalletBalanceBucket.USER_SETTLEMENT,
          currency: DEFAULT_CURRENCY,
          balance: 0,
        },
      },
    },
  };
}

export async function ensureUserWallet(
  tx: Prisma.TransactionClient,
  userId: string,
): Promise<Wallet> {
  return tx.wallet.upsert({
    where: { ownerUserId: userId },
    create: {
      type: WalletType.USER,
      ownerUserId: userId,
      name: USER_WALLET_NAME,
      balances: {
        create: {
          bucket: WalletBalanceBucket.USER_SETTLEMENT,
          currency: DEFAULT_CURRENCY,
          balance: 0,
        },
      },
    },
    update: {},
  });
}
