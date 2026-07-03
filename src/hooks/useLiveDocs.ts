import { useEffect, useState } from "react";
import { onSnapshot } from "firebase/firestore";
import type { DocumentData, Query } from "firebase/firestore";
import type { QueryState, WithId } from "./types";

// Subscribes to a scoped Firestore query and cleans up on unmount / dep change.
// `makeQuery` returns null while the scope (schoolId/role) is not ready yet, or
// when the caller has nothing to fetch (e.g. a tutor with no assigned classes) —
// both resolve to an empty, non-loading result rather than a hanging spinner.
export function useLiveDocs<T extends WithId>(
  makeQuery: () => Query<DocumentData> | null,
  deps: ReadonlyArray<unknown>,
): QueryState<T[]> {
  const [state, setState] = useState<QueryState<T[]>>({
    loading: true,
    error: null,
    data: [],
  });

  useEffect(() => {
    let firestoreQuery: Query<DocumentData> | null;
    try {
      firestoreQuery = makeQuery();
    } catch (buildError) {
      console.error("Failed to build Firestore query", buildError);
      setState({ loading: false, error: buildError as Error, data: [] });
      return;
    }

    if (!firestoreQuery) {
      setState({ loading: false, error: null, data: [] });
      return;
    }

    setState((current) => ({ ...current, loading: true, error: null }));

    const unsubscribe = onSnapshot(
      firestoreQuery,
      (snapshot) => {
        const data = snapshot.docs.map(
          (docSnap) => ({ id: docSnap.id, ...(docSnap.data() as object) }) as T,
        );
        setState({ loading: false, error: null, data });
      },
      (error) => {
        console.error("Firestore subscription failed", error);
        setState({ loading: false, error, data: [] });
      },
    );

    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return state;
}
