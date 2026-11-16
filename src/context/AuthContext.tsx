import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, User } from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { auth, db, googleProvider, testFirestoreConnection } from '../firebase';
import {
  AcademicYear,
  SchoolClass,
  SchoolSettings,
  Subject,
  Term,
  UserAccount,
  UserInvite,
} from '../types/sims';
import {
  emailToInviteId,
  fetchSchoolSettings,
  fetchStructuralCatalog,
  getActiveAdminUids,
  initializeSchoolDefaults,
  syncClaimedAccountLinks,
} from '../services/firestoreService';

const BOOTSTRAPPED_ADMIN_EMAIL = 'enothmumbere@gmail.com';

interface AuthContextValue {
  firebaseUser: User | null;
  userAccount: UserAccount | null;
  schoolSettings: SchoolSettings | null;
  years: AcademicYear[];
  terms: Term[];
  classes: SchoolClass[];
  subjects: Subject[];
  loading: boolean;
  connectionOk: boolean;
  authError: string | null;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  refreshCatalog: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [userAccount, setUserAccount] = useState<UserAccount | null>(null);
  const [schoolSettings, setSchoolSettings] = useState<SchoolSettings | null>(null);
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [terms, setTerms] = useState<Term[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [connectionOk, setConnectionOk] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  const refreshCatalog = useCallback(async () => {
    const [settings, catalog] = await Promise.all([
      fetchSchoolSettings(),
      fetchStructuralCatalog(),
    ]);
    if (settings) setSchoolSettings(settings);
    setYears(catalog.years);
    setTerms(catalog.terms);
    setClasses(catalog.classes);
    setSubjects(catalog.subjects);
  }, []);

  const syncUserAccount = useCallback(async (user: User): Promise<UserAccount> => {
    const email = (user.email || '').toLowerCase();
    const userRef = doc(db, 'users', user.uid);
    const userSnap = await getDoc(userRef);

    const inviteId = emailToInviteId(email);
    let invite: UserInvite | null = null;
    try {
      const invSnap = await getDoc(doc(db, 'userInvites', inviteId));
      if (invSnap.exists()) {
        invite = invSnap.data() as UserInvite;
      }
    } catch {
      invite = null;
    }

    const isBootAdmin = email === BOOTSTRAPPED_ADMIN_EMAIL && user.emailVerified;

    if (!userSnap.exists()) {
      const adminUids = await getActiveAdminUids(isBootAdmin ? user.uid : undefined);
      if (isBootAdmin) {
        const account: UserAccount = {
          uid: user.uid,
          email,
          displayName: user.displayName || 'System Administrator',
          role: 'admin',
          status: 'active',
          initials: 'ADM',
          adminUids,
        };
        await setDoc(userRef, {
          ...account,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        await initializeSchoolDefaults(user.uid);
        return account;
      }

      if (invite && invite.status === 'pending') {
        const account: UserAccount = {
          uid: user.uid,
          email,
          displayName: invite.fullName || user.displayName || email,
          role: invite.role,
          status: 'active',
          linkedEntityId: invite.linkedEntityId || '',
          schoolPayCode: invite.schoolPayCode || '',
          initials: invite.initials || '',
          inviteId,
          adminUids: invite.adminUids || adminUids,
        };
        await setDoc(userRef, {
          ...account,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        await updateDoc(doc(db, 'userInvites', inviteId), {
          status: 'claimed',
          updatedAt: serverTimestamp(),
        });
        return account;
      }

      const pendingAccount: UserAccount = {
        uid: user.uid,
        email,
        displayName: user.displayName || email,
        role: 'pending',
        status: 'pending',
        adminUids,
      };
      await setDoc(userRef, {
        ...pendingAccount,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return pendingAccount;
    }

    const existing = userSnap.data() as UserAccount;

    // Claim invite if existing account was pending
    if (existing.role === 'pending' && invite && invite.status === 'pending') {
      await updateDoc(userRef, {
        role: invite.role,
        status: 'active',
        linkedEntityId: invite.linkedEntityId || '',
        schoolPayCode: invite.schoolPayCode || '',
        initials: invite.initials || '',
        inviteId,
        updatedAt: serverTimestamp(),
      });
      await updateDoc(doc(db, 'userInvites', inviteId), {
        status: 'claimed',
        updatedAt: serverTimestamp(),
      });
      return {
        ...existing,
        role: invite.role,
        status: 'active',
        linkedEntityId: invite.linkedEntityId,
        schoolPayCode: invite.schoolPayCode,
        initials: invite.initials,
      };
    }

    if (existing.role === 'admin' || isBootAdmin) {
      await initializeSchoolDefaults(user.uid);
    }

    return existing;
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!auth.currentUser) return;
    const acc = await syncUserAccount(auth.currentUser);
    setUserAccount(acc);
    if (acc.role !== 'pending' && acc.status === 'active') {
      await refreshCatalog();
    }
  }, [refreshCatalog, syncUserAccount]);

  useEffect(() => {
    testFirestoreConnection().then(setConnectionOk);

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setLoading(true);
      setAuthError(null);
      setFirebaseUser(user);

      if (!user) {
        setUserAccount(null);
        setLoading(false);
        return;
      }

      try {
        const account = await syncUserAccount(user);
        setUserAccount(account);
        if (account.role !== 'pending' && account.status === 'active') {
          await refreshCatalog();
        }
      } catch (err) {
        console.error('Auth sync error:', err);
        setAuthError(err instanceof Error ? err.message : 'Failed to load user profile.');
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [refreshCatalog, syncUserAccount]);

  useEffect(() => {
    if (userAccount?.role === 'student') {
      document.body.classList.add('student-no-print');
    } else {
      document.body.classList.remove('student-no-print');
    }
  }, [userAccount?.role]);

  const signInWithGoogle = async () => {
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Sign-in cancelled or failed.');
    }
  };

  const logout = async () => {
    await signOut(auth);
  };

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        userAccount,
        schoolSettings,
        years,
        terms,
        classes,
        subjects,
        loading,
        connectionOk,
        authError,
        signInWithGoogle,
        logout,
        refreshCatalog,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
