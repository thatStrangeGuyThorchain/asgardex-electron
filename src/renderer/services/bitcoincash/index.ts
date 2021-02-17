import { balances$, reloadBalances, getBalanceByAddress$ } from './balances'
import { client$, clientViewState$, address$, explorerUrl$, getExplorerTxUrl$, getExplorerAddressUrl$ } from './common'
import { createFeesService } from './fees'
import { createTransactionService } from './transaction'

const { subscribeTx, txRD$, resetTx, sendTx, txs$, tx$, txStatus$ } = createTransactionService(client$)
const { fees$, reloadFees, memoFees$ } = createFeesService(client$)

export {
  client$,
  explorerUrl$,
  getExplorerTxUrl$,
  getExplorerAddressUrl$,
  clientViewState$,
  address$,
  reloadBalances,
  balances$,
  getBalanceByAddress$,
  fees$,
  memoFees$,
  subscribeTx,
  sendTx,
  reloadFees,
  txRD$,
  resetTx,
  txs$,
  tx$,
  txStatus$
}
