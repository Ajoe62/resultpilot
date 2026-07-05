import { onIdTokenChanged, signOut } from "firebase/auth";
import { doc, enableNetwork, getDoc } from "firebase/firestore";
import { createContext, useContext, useEffect, useState } from "react";
import { auth, db } from "../lib/firebase";

const AuthContext = createContext(null);

const DEFAULT_SCHOOL_ID = import.meta.env.VITE_DEFAULT_SCHOOL_ID || null;
// Which of the caller's manageable schools is currently active (owner switcher).
const ACTIVE_KEY = "resultpilot.activeSchool";

const EMPTY_PROFILE = {
  role: null,
  schoolId: null,
  schoolIds: [],
  assignedClasses: [],
};

// Resolves the caller's role from custom claims (zero extra reads), falling back
// to the legacy root /admins/{uid} doc. `schoolIds` is the set of schools the
// caller may manage — a multi-school owner has more than one.
async function resolveProfile(user) {
  const tokenResult = await user.getIdTokenResult();
  const claims = tokenResult.claims || {};

  if (claims.active === true && claims.role === "schooladmin" && claims.schoolId) {
    const schoolId = String(claims.schoolId);
    const schoolIds =
      Array.isArray(claims.schoolIds) && claims.schoolIds.length
        ? claims.schoolIds.map(String)
        : [schoolId];
    return { role: "schooladmin", schoolId, schoolIds, assignedClasses: [] };
  }

  if (claims.active === true && claims.role === "tutor" && claims.schoolId) {
    const schoolId = String(claims.schoolId);
    let assignedClasses = [];
    try {
      const tutorSnap = await getDoc(doc(db, "schools", schoolId, "tutors", user.uid));
      if (tutorSnap.exists()) {
        const data = tutorSnap.data();
        assignedClasses = Array.isArray(data.assignedClasses) ? data.assignedClasses : [];
      }
    } catch {
      assignedClasses = [];
    }
    return { role: "tutor", schoolId, schoolIds: [schoolId], assignedClasses };
  }

  // Legacy fallback: root admins collection (transition only).
  const adminSnapshot = await getDoc(doc(db, "admins", user.uid));
  if (adminSnapshot.exists()) {
    return {
      role: "schooladmin",
      schoolId: DEFAULT_SCHOOL_ID,
      schoolIds: DEFAULT_SCHOOL_ID ? [DEFAULT_SCHOOL_ID] : [],
      assignedClasses: [],
    };
  }

  return { ...EMPTY_PROFILE };
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [profile, setProfile] = useState(EMPTY_PROFILE);
  const [activeSchoolId, setActiveSchoolId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;

    // onIdTokenChanged fires on sign-in, sign-out AND token refresh, so updated
    // custom claims (e.g. a newly-added school) are picked up without logout.
    const unsubscribe = onIdTokenChanged(auth, async (user) => {
      if (!active) return;

      setCurrentUser(user);
      setLoading(true);
      setError(null);

      if (!user) {
        setProfile(EMPTY_PROFILE);
        setLoading(false);
        return;
      }

      try {
        await enableNetwork(db);
        const nextProfile = await resolveProfile(user);
        if (!active) return;
        setProfile(nextProfile);
      } catch (resolveError) {
        if (!active) return;
        console.error("Failed to resolve auth profile", resolveError);
        setError(resolveError);
        setProfile(EMPTY_PROFILE);
      } finally {
        if (active) setLoading(false);
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  // Pick the active school from the persisted choice (if still manageable),
  // else the primary school. Recomputed whenever the profile changes.
  useEffect(() => {
    let stored = null;
    try {
      stored = window.localStorage.getItem(ACTIVE_KEY);
    } catch {
      stored = null;
    }
    const next = stored && profile.schoolIds.includes(stored) ? stored : profile.schoolId;
    setActiveSchoolId(next);
  }, [profile]);

  const switchSchool = (id) => {
    if (!profile.schoolIds.includes(id)) return;
    try {
      window.localStorage.setItem(ACTIVE_KEY, id);
    } catch {
      /* ignore */
    }
    setActiveSchoolId(id);
  };

  const value = {
    currentUser,
    role: profile.role,
    // The active school scopes all data queries.
    schoolId: activeSchoolId ?? profile.schoolId,
    manageableSchools: profile.schoolIds,
    switchSchool,
    assignedClasses: profile.assignedClasses,
    // Back-compat: existing admin routes/components read `isAdmin`.
    isAdmin: profile.role === "schooladmin",
    loading,
    error,
    logout: () => signOut(auth),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }

  return context;
}
