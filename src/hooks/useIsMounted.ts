import { useEffect, useRef } from "react";

/**
 * Ref that is true while the component is mounted.
 *
 * Draft-creation URL swaps (`new -> <id>` with DRAFT_CREATED_NAV_STATE) run
 * after an `await`. If the user started another new bill meanwhile, the page
 * was remounted (useBillRouteInstanceKey) and the late swap would bind the
 * scanned bill's id to the fresh, empty page. Skip the swap once unmounted.
 */
export function useIsMounted() {
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  return mounted;
}
