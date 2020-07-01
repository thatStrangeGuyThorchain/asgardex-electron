import { bnOrZero, baseAmount, PoolData, getAssetFromString } from '@thorchain/asgardex-util'
import * as O from 'fp-ts/lib/Option'
import { none, Option, some } from 'fp-ts/lib/Option'

import { PoolDetails } from '../services/midgard/types'
import { PoolDetailStatusEnum, PoolDetail } from '../types/generated/midgard'
import { PoolTableRowData, PoolTableRowsData } from '../views/pools/types'
import { getPoolTableRowData } from '../views/pools/utils'

export const getPoolTableRowsData = (
  poolDetails: PoolDetails,
  pricePool: PoolData,
  poolStatus: PoolDetailStatusEnum
): PoolTableRowsData => {
  const poolDetailsFiltered = poolDetails.filter((detail) => detail?.status === poolStatus)
  const deepestPool = O.toNullable(getDeepestPool(poolDetailsFiltered))
  const { symbol: deepestPoolSymbol } = getAssetFromString(deepestPool?.asset)
  // Transform `PoolDetails` -> PoolRowType
  return poolDetailsFiltered.map((poolDetail, index) => {
    const { symbol = '' } = getAssetFromString(poolDetail.asset)
    const deepest = symbol && deepestPoolSymbol && symbol === deepestPoolSymbol
    return {
      ...getPoolTableRowData(poolDetail, pricePool),
      deepest,
      key: poolDetail?.asset || index
    } as PoolTableRowData
  })
}

export const filterPendingPools = (pools: PoolDetails) =>
  pools.filter((pool: PoolDetail) => pool.status === PoolDetailStatusEnum.Bootstrapped)

export const hasPendingPools = (pools: PoolDetails) => filterPendingPools(pools).length > 0

/**
 * Filters a pool out with hightest value of run
 */
export const getDeepestPool = (pools: PoolDetails): Option<PoolDetail> =>
  pools.reduce((acc: Option<PoolDetail>, pool: PoolDetail) => {
    const runeDepth = bnOrZero(pool.runeDepth)
    const prev = O.toNullable(acc)
    return runeDepth.isGreaterThanOrEqualTo(bnOrZero(prev?.runeDepth)) ? some(pool) : acc
  }, none)

/**
 * Transforms `PoolDetail` into `PoolData`
 * Needed for misc. pool calculations using `asgardex-util`
 */
export const toPoolData = (detail: PoolDetail) => {
  const assetDepth = bnOrZero(detail.assetDepth)
  const runeDepth = bnOrZero(detail.runeDepth)
  return {
    assetBalance: baseAmount(assetDepth),
    runeBalance: baseAmount(runeDepth)
  } as PoolData
}