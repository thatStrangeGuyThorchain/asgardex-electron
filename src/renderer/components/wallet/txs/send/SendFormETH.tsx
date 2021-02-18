import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { SyncOutlined } from '@ant-design/icons'
import * as RD from '@devexperts/remote-data-ts'
import { FeeOptionKey, Fees } from '@xchainjs/xchain-client'
import { Address, FeesParams, validateAddress } from '@xchainjs/xchain-ethereum'
import {
  formatAssetAmountCurrency,
  assetAmount,
  AssetAmount,
  bn,
  baseToAsset,
  AssetETH,
  assetToBase,
  BaseAmount
} from '@xchainjs/xchain-util'
import { Row, Form, Col } from 'antd'
import { RadioChangeEvent } from 'antd/lib/radio'
import BigNumber from 'bignumber.js'
import * as FP from 'fp-ts/lib/function'
import * as O from 'fp-ts/lib/Option'
import { useIntl } from 'react-intl'
import * as Rx from 'rxjs'

import { ZERO_ASSET_AMOUNT, ZERO_BN } from '../../../../const'
import { ETH_DECIMAL, isEthAsset } from '../../../../helpers/assetHelper'
import { sequenceTOption } from '../../../../helpers/fpHelpers'
import { emptyString } from '../../../../helpers/stringHelper'
import { getEthAmountFromBalances } from '../../../../helpers/walletHelper'
import { INITIAL_SEND_STATE } from '../../../../services/chain/const'
import { SendTxParams, SendTxState, SendTxState$ } from '../../../../services/chain/types'
import { FeesRD, WalletBalances } from '../../../../services/clients'
import { ValidatePasswordHandler } from '../../../../services/wallet/types'
import { TxTypes } from '../../../../types/asgardex'
import { WalletBalance } from '../../../../types/wallet'
import { PasswordModal } from '../../../modal/password'
import { ErrorView } from '../../../shared/error'
import * as StyledR from '../../../shared/form/Radio.style'
import { SuccessView } from '../../../shared/success'
import { ViewTxButton } from '../../../uielements/button'
import { Input, InputBigNumber } from '../../../uielements/input'
import { AccountSelector } from '../../account'
import * as Styled from '../TxForm.style'
import { validateTxAmountInput } from '../TxForm.util'
import { DEFAULT_FEE_OPTION_KEY } from './Send.const'
import { useChangeAssetHandler } from './Send.hooks'
import * as StyledForm from './SendForm.style'

export type FormValues = {
  recipient: Address
  amount: string
  memo?: string
}

export type Props = {
  balances: WalletBalances
  balance: WalletBalance
  fees: FeesRD
  reloadFeesHandler: (params: FeesParams) => void
  reloadBalancesHandler: FP.Lazy<void>
  validatePassword$: ValidatePasswordHandler
  transfer$: (_: SendTxParams) => SendTxState$
  successActionHandler: (txHash: string) => Promise<void>
}

export const SendFormETH: React.FC<Props> = (props): JSX.Element => {
  const {
    balances,
    balance,
    fees: feesRD,
    reloadFeesHandler,
    reloadBalancesHandler,
    validatePassword$,
    transfer$,
    successActionHandler
  } = props
  const intl = useIntl()

  // State for visibility of Modal to confirm upgrade
  const [showConfirmSendModal, setShowConfirmSendModal] = useState(false)

  // (Possible) subscription of upgrade tx
  const [sendTxSub, _setSendTxSub] = useState<O.Option<Rx.Subscription>>(O.none)

  // unsubscribe upgrade$ subscription
  const unsubscribeSendTxSub = useCallback(() => {
    FP.pipe(
      sendTxSub,
      O.map((sub) => sub.unsubscribe())
    )
  }, [sendTxSub])

  const setSendTxSub = useCallback(
    (state) => {
      unsubscribeSendTxSub()
      _setSendTxSub(state)
    },
    [unsubscribeSendTxSub]
  )

  useEffect(() => {
    // Unsubscribe of (possible) previous subscription of `send$`
    return () => {
      unsubscribeSendTxSub()
    }
  }, [unsubscribeSendTxSub])

  // State of upgrade tx
  const [sendTxState, setSendTxState] = useState<SendTxState>(INITIAL_SEND_STATE)

  const resetTxState = useCallback(() => {
    setSendTxState(INITIAL_SEND_STATE)
    setSendTxSub(O.none)
  }, [setSendTxSub])

  const changeAssetHandler = useChangeAssetHandler()

  const [selectedFeeOptionKey, setSelectedFeeOptionKey] = useState<FeeOptionKey>(DEFAULT_FEE_OPTION_KEY)

  const [sendAmount, setSendAmount] = useState<O.Option<AssetAmount>>(O.none)
  const [sendAddress, setSendAddress] = useState<O.Option<Address>>(O.none)

  const [form] = Form.useForm<FormValues>()

  const prevFeesRef = useRef<O.Option<Fees>>(O.none)

  const oFees: O.Option<Fees> = useMemo(() => FP.pipe(feesRD, RD.toOption), [feesRD])

  const feesAvailable = useMemo(() => O.isSome(oFees), [oFees])

  // Store latest fees as `ref`
  // needed to display previous fee while reloading
  useEffect(() => {
    FP.pipe(
      oFees,
      O.map((fees) => (prevFeesRef.current = O.some(fees)))
    )
  }, [oFees])

  const selectedFee: O.Option<BaseAmount> = useMemo(
    () =>
      FP.pipe(
        oFees,
        O.map((fees) => fees[selectedFeeOptionKey])
      ),
    [oFees, selectedFeeOptionKey]
  )

  const oEthAmount: O.Option<AssetAmount> = useMemo(() => {
    // return balance of current asset (if ETH)
    if (isEthAsset(balance.asset)) {
      return O.some(baseToAsset(balance.amount))
    }
    // or check list of other assets to get eth balance
    return FP.pipe(balances, getEthAmountFromBalances)
  }, [balance, balances])

  const isFeeError = useMemo(() => {
    return FP.pipe(
      sequenceTOption(selectedFee, oEthAmount),
      O.fold(
        // Missing (or loading) fees does not mean we can't sent something. No error then.
        () => false,
        ([fee, ethAmount]) => ethAmount.amount().isLessThan(baseToAsset(fee).amount())
      )
    )
  }, [oEthAmount, selectedFee])

  const selectedFeeLabel = useMemo(
    () =>
      FP.pipe(
        feesRD,
        RD.fold(
          () => '...',
          () =>
            // show previous fees while re-loading
            FP.pipe(
              prevFeesRef.current,
              O.map((fees) =>
                formatAssetAmountCurrency({
                  amount: baseToAsset(fees[selectedFeeOptionKey]),
                  asset: AssetETH,
                  trimZeros: true
                })
              ),
              O.getOrElse(() => '...')
            ),
          (error) => `${intl.formatMessage({ id: 'common.error' })} ${error || ''}`,
          (fees) =>
            formatAssetAmountCurrency({
              amount: baseToAsset(fees[selectedFeeOptionKey]),
              asset: AssetETH,
              trimZeros: true
            })
        )
      ),
    [feesRD, intl, selectedFeeOptionKey]
  )

  const renderFeeError = useMemo(() => {
    if (!isFeeError) return <></>

    const amount = FP.pipe(
      oEthAmount,
      // no eth asset == zero amount
      O.getOrElse(() => ZERO_ASSET_AMOUNT)
    )

    const msg = intl.formatMessage(
      { id: 'wallet.errors.fee.notCovered' },
      {
        balance: formatAssetAmountCurrency({
          amount,
          asset: AssetETH,
          trimZeros: true
        })
      }
    )

    return (
      <Styled.Label size="big" color="error">
        {msg}
      </Styled.Label>
    )
  }, [oEthAmount, intl, isFeeError])

  const feeOptionsLabel: Record<FeeOptionKey, string> = useMemo(
    () => ({
      fast: intl.formatMessage({ id: 'wallet.send.fast' }),
      fastest: intl.formatMessage({ id: 'wallet.send.fastest' }),
      average: intl.formatMessage({ id: 'wallet.send.average' })
    }),
    [intl]
  )

  const isLoading = useMemo(() => RD.isPending(sendTxState.status), [sendTxState.status])

  const renderFeeOptions = useMemo(() => {
    const onChangeHandler = (e: RadioChangeEvent) => setSelectedFeeOptionKey(e.target.value)
    const disabled = !feesAvailable || isLoading

    return (
      <StyledR.Radio.Group onChange={onChangeHandler} value={selectedFeeOptionKey} disabled={disabled}>
        <StyledR.Radio value="fastest" key="fastest">
          <StyledR.RadioLabel disabled={disabled}>{feeOptionsLabel['fastest']}</StyledR.RadioLabel>
        </StyledR.Radio>
        <StyledR.Radio value="fast" key="fast">
          <StyledR.RadioLabel disabled={disabled}>{feeOptionsLabel['fast']}</StyledR.RadioLabel>
        </StyledR.Radio>
        <StyledR.Radio value="average" key="average">
          <StyledR.RadioLabel disabled={disabled}>{feeOptionsLabel['average']}</StyledR.RadioLabel>
        </StyledR.Radio>
      </StyledR.Radio.Group>
    )
  }, [feeOptionsLabel, feesAvailable, isLoading, selectedFeeOptionKey])

  const addressValidator = useCallback(
    async (_: unknown, value: string) => {
      if (!value) {
        return Promise.reject(intl.formatMessage({ id: 'wallet.errors.address.empty' }))
      }
      if (!validateAddress(value.toLowerCase())) {
        return Promise.reject(intl.formatMessage({ id: 'wallet.errors.address.invalid' }))
      }
    },
    [intl]
  )

  // max amount for eth
  const maxAmount = useMemo(() => {
    const maxEthAmount = FP.pipe(
      sequenceTOption(selectedFee, oEthAmount),
      O.fold(
        // Set maxAmount to zero if we dont know anything about eth and fee amounts
        () => ZERO_BN,
        ([fee, ethAmount]) => {
          const max = ethAmount.amount().minus(baseToAsset(fee).amount())
          return max.isGreaterThan(0) ? max : ZERO_BN
        }
      ),
      assetAmount
    )
    return isEthAsset(balance.asset) ? maxEthAmount : baseToAsset(balance.amount)
  }, [selectedFee, oEthAmount, balance])

  const amountValidator = useCallback(
    async (_: unknown, value: BigNumber) => {
      // error messages
      const errors = {
        msg1: intl.formatMessage({ id: 'wallet.errors.amount.shouldBeNumber' }),
        msg2: intl.formatMessage({ id: 'wallet.errors.amount.shouldBeGreaterThan' }, { amount: '0' }),
        msg3: isEthAsset(balance.asset)
          ? intl.formatMessage({ id: 'wallet.errors.amount.shouldBeLessThanBalanceAndFee' })
          : intl.formatMessage({ id: 'wallet.errors.amount.shouldBeLessThanBalance' })
      }
      return validateTxAmountInput({ input: value, maxAmount, errors })
    },
    [balance, intl, maxAmount]
  )

  const onSubmit = useCallback(() => setShowConfirmSendModal(true), [])

  const send = useCallback(() => {
    FP.pipe(
      sequenceTOption(sendAmount, sendAddress),
      O.map(([amount, recipient]) => {
        const subscription = transfer$({
          recipient,
          amount: assetToBase(amount),
          asset: balance.asset,
          feeOptionKey: selectedFeeOptionKey,
          memo: form.getFieldValue('memo'),
          txType: TxTypes.CREATE
        }).subscribe(setSendTxState)

        // store subscription
        return setSendTxSub(O.some(subscription))
      })
    )
  }, [balance.asset, form, selectedFeeOptionKey, transfer$, sendAddress, sendAmount, setSendTxSub])

  const onFinishHandler = useCallback(() => {
    reloadBalancesHandler()
    resetTxState()
  }, [reloadBalancesHandler, resetTxState])

  const onChangeAmount = useCallback(
    async (value: BigNumber) => {
      // we have to validate input before storing into the state
      amountValidator(undefined, value)
        .then(() => {
          setSendAmount(O.some(assetAmount(value, ETH_DECIMAL)))
        })
        .catch(() => setSendAmount(O.none))
    },
    [amountValidator, setSendAmount]
  )

  const onChangeAddress = useCallback(
    async ({ target }: React.ChangeEvent<HTMLInputElement>) => {
      const address = target.value
      // we have to validate input before storing into the state
      addressValidator(undefined, address)
        .then(() => {
          setSendAddress(O.some(address))
        })
        .catch(() => setSendAddress(O.none))
    },
    [setSendAddress, addressValidator]
  )

  const reloadFees = useCallback(() => {
    FP.pipe(
      sequenceTOption(sendAmount, sendAddress),
      O.map(([amount, recipient]) => {
        return reloadFeesHandler({ asset: balance.asset, amount: assetToBase(amount), recipient })
      })
    )

    return false
  }, [balance.asset, reloadFeesHandler, sendAddress, sendAmount])

  const txStatusMsg = useMemo(() => {
    const stepDescriptions = [
      intl.formatMessage({ id: 'common.tx.sendingAsset' }, { assetSymbol: balance.asset.symbol }),
      intl.formatMessage({ id: 'common.tx.checkResult' })
    ]
    const { steps, status } = sendTxState

    return FP.pipe(
      status,
      RD.fold(
        () => emptyString,
        () =>
          `${stepDescriptions[steps.current - 1]} (${intl.formatMessage(
            { id: 'common.step' },
            { current: steps.current, total: steps.total }
          )})`,
        () => emptyString,
        () => emptyString
      )
    )
  }, [balance.asset.symbol, intl, sendTxState])

  const renderSendForm = useMemo(
    () => (
      <Row>
        <Styled.Col span={24}>
          <AccountSelector onChange={changeAssetHandler} selectedAsset={balance.asset} walletBalances={balances} />
          <Styled.Form
            form={form}
            initialValues={{
              // default value for BigNumberInput
              amount: bn(0),
              // Default value for RadioGroup of feeOptions
              fee: DEFAULT_FEE_OPTION_KEY
            }}
            onFinish={onSubmit}
            labelCol={{ span: 24 }}>
            <Styled.SubForm>
              <Styled.CustomLabel size="big">{intl.formatMessage({ id: 'common.address' })}</Styled.CustomLabel>
              <Form.Item rules={[{ required: true, validator: addressValidator }]} name="recipient">
                <Input
                  color="primary"
                  size="large"
                  disabled={isLoading}
                  onBlur={reloadFees}
                  onChange={onChangeAddress}
                />
              </Form.Item>
              <Styled.CustomLabel size="big">{intl.formatMessage({ id: 'common.amount' })}</Styled.CustomLabel>
              <Styled.FormItem rules={[{ required: true, validator: amountValidator }]} name="amount">
                <InputBigNumber
                  min={0}
                  size="large"
                  disabled={isLoading}
                  decimal={balance.amount.decimal}
                  onBlur={reloadFees}
                  onChange={onChangeAmount}
                />
              </Styled.FormItem>
              <Styled.Label size="big" style={{ marginBottom: 0, paddingBottom: 0 }}>
                {intl.formatMessage({ id: 'common.max' })}:{' '}
                {formatAssetAmountCurrency({
                  amount: maxAmount,
                  asset: balance.asset,
                  trimZeros: true
                })}
              </Styled.Label>
              <Row align="middle">
                <Col>
                  <StyledForm.FeeLabel
                    size="big"
                    color={RD.isFailure(feesRD) ? 'error' : 'primary'}
                    style={{ paddingTop: 0 }}
                    disabled={RD.isPending(feesRD)}>
                    {intl.formatMessage({ id: 'common.fees' })}: {selectedFeeLabel}
                  </StyledForm.FeeLabel>
                </Col>
                <Col>
                  <StyledForm.FeeButton onClick={reloadFees} disabled={RD.isPending(feesRD)}>
                    <SyncOutlined />
                  </StyledForm.FeeButton>
                </Col>
              </Row>
              {renderFeeError}
              <Styled.CustomLabel size="big">{intl.formatMessage({ id: 'common.memo' })}</Styled.CustomLabel>
              <Form.Item name="memo">
                <Input size="large" disabled={isLoading} />
              </Form.Item>
              <Form.Item name="fee">{renderFeeOptions}</Form.Item>
            </Styled.SubForm>
            <Styled.SubmitContainer>
              <Styled.SubmitStatus>{txStatusMsg}</Styled.SubmitStatus>
              <Styled.Button loading={isLoading} disabled={!feesAvailable || isLoading} htmlType="submit">
                {intl.formatMessage({ id: 'wallet.action.send' })}
              </Styled.Button>
            </Styled.SubmitContainer>
          </Styled.Form>
        </Styled.Col>
      </Row>
    ),
    [
      addressValidator,
      amountValidator,
      balance.amount.decimal,
      balance.asset,
      balances,
      changeAssetHandler,
      feesAvailable,
      feesRD,
      form,
      intl,
      isLoading,
      maxAmount,
      onChangeAddress,
      onChangeAmount,
      onSubmit,
      reloadFees,
      renderFeeError,
      renderFeeOptions,
      selectedFeeLabel,
      txStatusMsg
    ]
  )

  const renderErrorBtn = useMemo(
    () => <Styled.Button onClick={resetTxState}>{intl.formatMessage({ id: 'common.back' })}</Styled.Button>,
    [intl, resetTxState]
  )

  const renderSuccessExtra = useCallback(
    (txHash: string) => {
      const onClickHandler = () => successActionHandler(txHash)
      return (
        <Styled.SuccessExtraContainer>
          <Styled.SuccessExtraButton onClick={onFinishHandler}>
            {intl.formatMessage({ id: 'common.back' })}
          </Styled.SuccessExtraButton>
          <ViewTxButton txHash={O.some(txHash)} onClick={onClickHandler} />
        </Styled.SuccessExtraContainer>
      )
    },
    [intl, onFinishHandler, successActionHandler]
  )

  const sendConfirmationHandler = useCallback(() => {
    // close confirmation modal
    setShowConfirmSendModal(false)
    send()
  }, [send])

  const renderConfirmSendModal = useMemo(
    () =>
      showConfirmSendModal ? (
        <PasswordModal
          onSuccess={sendConfirmationHandler}
          onClose={() => setShowConfirmSendModal(false)}
          validatePassword$={validatePassword$}
        />
      ) : (
        <></>
      ),
    [sendConfirmationHandler, showConfirmSendModal, validatePassword$]
  )

  const renderSendStatus = useMemo(
    () =>
      FP.pipe(
        sendTxState.status,
        RD.fold(
          () => renderSendForm,
          () => renderSendForm,
          (error) => (
            <ErrorView
              title={intl.formatMessage({ id: 'wallet.send.error' })}
              subTitle={error.msg}
              extra={renderErrorBtn}
            />
          ),
          (hash) => (
            <SuccessView title={intl.formatMessage({ id: 'common.success' })} extra={renderSuccessExtra(hash)} />
          )
        )
      ),
    [intl, renderErrorBtn, renderSendForm, renderSuccessExtra, sendTxState.status]
  )

  return (
    <>
      {renderConfirmSendModal}
      {renderSendStatus}
    </>
  )
}
