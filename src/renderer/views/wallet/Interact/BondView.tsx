import React, { useCallback, useMemo } from 'react'

import * as RD from '@devexperts/remote-data-ts'
import { AssetRuneNative, BaseAmount, baseToAsset } from '@xchainjs/xchain-util'
import * as A from 'fp-ts/Array'
import * as FP from 'fp-ts/function'
import * as O from 'fp-ts/Option'
import { useObservableState } from 'observable-hooks'
import { useIntl } from 'react-intl'
import * as RxOp from 'rxjs/operators'

import { Bond } from '../../../components/interact/forms'
import { Button } from '../../../components/uielements/button'
import { ZERO_ASSET_AMOUNT } from '../../../const'
import { useThorchainContext } from '../../../contexts/ThorchainContext'
import { useWalletContext } from '../../../contexts/WalletContext'
import { eqAsset } from '../../../helpers/fp/eq'
import { useManualSubscription } from '../../../hooks/useManualSubscription'
import { INITIAL_INTERACT_STATE } from '../../../services/thorchain/const'
import { AddressValidation } from '../../../services/thorchain/types'
import { InteractState } from '../../../services/thorchain/types'
import * as Styled from './InteractView.styles'

type Props = {
  walletAddress: string
  goToTransaction: (txHash: string) => void
}

type InteractParams = { amount: BaseAmount; memo: string }

export const BondView: React.FC<Props> = ({ walletAddress, goToTransaction }) => {
  const { balancesState$ } = useWalletContext()
  const { interact$: getInteract$, client$ } = useThorchainContext()
  const intl = useIntl()

  const oClient = useObservableState(client$, O.none)

  const addressValidation = useMemo(
    () =>
      FP.pipe(
        oClient,
        O.map((c) => c.validateAddress),
        O.getOrElse((): AddressValidation => (_: string) => true)
      ),
    [oClient]
  )

  const [runeBalance] = useObservableState(
    () =>
      FP.pipe(
        balancesState$,
        RxOp.map(({ balances }) => balances),
        RxOp.map(
          FP.flow(
            O.chain(
              A.findFirst(
                ({ walletAddress: balanceWalletAddress, asset }) =>
                  balanceWalletAddress === walletAddress && eqAsset.equals(asset, AssetRuneNative)
              )
            ),
            O.map(({ amount }) => amount),
            O.map(baseToAsset),
            O.getOrElse(() => ZERO_ASSET_AMOUNT)
          )
        )
      ),
    ZERO_ASSET_AMOUNT
  )

  const { subscribe: interact, data: interactState, setData: setInteractState } = useManualSubscription<
    InteractState,
    InteractParams
  >(
    ({ amount, memo }) => {
      console.log('get new stream')
      return getInteract$({ amount, memo })
    },
    INITIAL_INTERACT_STATE,
    [getInteract$]
  )

  const bondTx = useCallback(
    ({ amount, memo }: { amount: BaseAmount; memo: string }) => {
      interact({ amount, memo })
    },
    [interact]
  )
  const resetResults = useCallback(() => {
    setInteractState(INITIAL_INTERACT_STATE)
  }, [setInteractState])

  const stepLabels = useMemo(
    () => [intl.formatMessage({ id: 'common.tx.sending' }), intl.formatMessage({ id: 'common.tx.checkResult' })],
    [intl]
  )
  const stepLabel = useMemo(
    () =>
      `${intl.formatMessage(
        { id: 'common.step' },
        { total: interactState.stepsTotal, current: interactState.step }
      )}: ${stepLabels[interactState.step - 1]}...`,
    [interactState, stepLabels, intl]
  )

  return FP.pipe(
    interactState.txRD,
    RD.fold(
      () => <Bond addressValidation={addressValidation} max={runeBalance} onFinish={bondTx} />,
      () => (
        <Bond
          addressValidation={addressValidation}
          isLoading={true}
          max={runeBalance}
          onFinish={FP.identity}
          loadingProgress={stepLabel}
        />
      ),
      ({ msg }) => (
        <Styled.ErrorView title={intl.formatMessage({ id: 'deposit.bond.state.error' })} subTitle={msg}>
          <Button onClick={resetResults}>{intl.formatMessage({ id: 'common.back' })}</Button>
        </Styled.ErrorView>
      ),
      (txHash) => (
        <Styled.SuccessView title={intl.formatMessage({ id: 'common.success' })}>
          <Styled.ViewTxButton txHash={O.some(txHash)} onClick={goToTransaction} />
          <Button onClick={resetResults}>{intl.formatMessage({ id: 'common.back' })}</Button>
        </Styled.SuccessView>
      )
    )
  )
}
