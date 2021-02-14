import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import * as FP from 'fp-ts/function'
import * as O from 'fp-ts/Option'
import * as Rx from 'rxjs'

export function useManualSubscription<T, P>(
  getData$: (param: P) => Rx.Observable<T>,
  initialState: T,
  deps: any[]
): {
  data: T
  subscribe: (params: P) => void
  setData: (val: T) => void
}
export function useManualSubscription<T>(
  data$: Rx.Observable<T>,
  initialState: T
): {
  data: T
  subscribe: () => void
  setData: (val: T) => void
}
export function useManualSubscription<T, P = void>(
  data$: ((param: P) => Rx.Observable<T>) | Rx.Observable<T>,
  initialValue: T,
  deps?: any[]
) {
  const [data, setDataState] = useState(initialValue)

  // (Possible) subscription
  const subRef = useRef<O.Option<Rx.Subscription>>(O.none)

  const unsubscribe = useCallback(() => {
    FP.pipe(
      subRef.current,
      O.map((sub) => {
        return sub.unsubscribe()
      })
    )
  }, [])

  const d = useMemo(() => deps || data$, [deps, data$])

  useEffect(() => {
    // Unsubscribe of possible subscription in case source data$ stream changed
    // unsubscribe()
    return () => {
      // Unsubscribe of possible subscription in case of unmount
      unsubscribe()
    }
  }, [d, unsubscribe])

  const subscribe = useCallback(
    <Params>(params: Params extends P ? P : void) => {
      // Unsubscribe of possible subscription in case of new subscription
      unsubscribe()

      if (Rx.isObservable(data$)) {
        subRef.current = O.some(data$.subscribe(setDataState))
      } else {
        subRef.current = O.some(data$(params as P).subscribe(setDataState))
      }
    },
    [data$, unsubscribe]
  )

  const setData = useCallback(
    (value: T) => {
      // Unsubscribe of possible subscription in case of new subscription
      unsubscribe()
      /**
       * Replace saved subscription with a single emitted value to avoid
       * saving subscription in case of manual setting inner-state's data
       */
      subRef.current = O.some(Rx.of(value).subscribe(setDataState))
    },
    [unsubscribe]
  )

  return {
    data,
    subscribe,
    setData
  }
}
