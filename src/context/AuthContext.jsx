import { onIdTokenChanged, signOut } from "firebase/auth";
import { doc, enableNetwork, getDoc } from "firebase/firestore";
import { createContext, useContext, useEffect, useState } from "react";
import { auth, db } from "../lib/firebase";

const AuthContext = createContext(null);

const DEFAULT_SCHOOL_ID = import.meta.env.VITE_DEFAULT_SCHOOL_ID || null;

const EMPTY_PROFILE = {
  role: null,
  schoolId: null,
  assignedClasses: [],
};

// Resolves the caller's role from custom claims (zero extra reads), falling back
// to the legacy root /admins/{uid} doc so existing single-tenant admins keep
// working before claims are bootstrapped. Tutors additionally load their
// assignedClasses from their profile doc.
async function resolveProfile(user) {
  const tokenResult = await user.getIdTokenResult();
  const claims = tokenResult.claims || {};

  if (claims.active === true && claims.role === "schooladmin" && claims.schoolId) {
    return { role: "schooladmin", schoolId: String(claims.schoolId), assignedClasses: [] };
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
    return { role: "tutor", schoolId, assignedClasses };
  }

  // Legacy fallback: root admins collection (transition only).
  const adminSnapshot = await getDoc(doc(db, "admins", user.uid));
  if (adminSnapshot.exists()) {
    return { role: "schooladmin", schoolId: DEFAULT_SCHOOL_ID, assignedClasses: [] };
  }

  return { ...EMPTY_PROFILE };
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [profile, setProfile] = useState(EMPTY_PROFILE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;

    // onIdTokenChanged fires on sign-in, sign-out AND token refresh, so updated
    // custom claims are picked up without forcing the user to log out.
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

  const value = {
    currentUser,
    role: profile.role,
    schoolId: profile.schoolId,
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
