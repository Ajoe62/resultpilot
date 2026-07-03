import { useAuth as useAuthFromContext } from "../context/AuthContext";
import type { Role } from "./types";

// Typed view over the (untyped .jsx) AuthContext so the new TypeScript hooks and
// components get proper types. The runtime value is unchanged.
export interface AuthValue {
  currentUser: { uid: string; email: string | null } | null;
  role: Role | null;
  schoolId: string | null;
  assignedClasses: string[];
  isAdmin: boolean;
  loading: boolean;
  error: Error | null;
  logout: () => Promise<void>;
}

export function useAuth(): AuthValue {
  return useAuthFromContext() as unknown as AuthValue;
}
