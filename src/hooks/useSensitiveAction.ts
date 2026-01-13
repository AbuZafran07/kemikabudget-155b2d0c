import { useState, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';

interface SensitiveActionState {
  isDialogOpen: boolean;
  actionName: string;
  actionDescription: string;
  pendingCallback: (() => void) | null;
}

export function useSensitiveAction() {
  const { role, profile } = useAuth();
  const [state, setState] = useState<SensitiveActionState>({
    isDialogOpen: false,
    actionName: '',
    actionDescription: '',
    pendingCallback: null,
  });

  // Check if user requires OTP for sensitive actions
  const requiresReauth = role === 'super_admin' && profile?.requires_otp;

  const executeSensitiveAction = useCallback(
    (
      actionName: string,
      actionDescription: string,
      callback: () => void
    ) => {
      if (requiresReauth) {
        // Show reauth dialog
        setState({
          isDialogOpen: true,
          actionName,
          actionDescription,
          pendingCallback: callback,
        });
      } else {
        // Execute directly for non-super_admin users
        callback();
      }
    },
    [requiresReauth]
  );

  const handleReauthSuccess = useCallback(() => {
    if (state.pendingCallback) {
      state.pendingCallback();
    }
    setState({
      isDialogOpen: false,
      actionName: '',
      actionDescription: '',
      pendingCallback: null,
    });
  }, [state.pendingCallback]);

  const handleDialogClose = useCallback((open: boolean) => {
    if (!open) {
      setState({
        isDialogOpen: false,
        actionName: '',
        actionDescription: '',
        pendingCallback: null,
      });
    }
  }, []);

  return {
    requiresReauth,
    isDialogOpen: state.isDialogOpen,
    actionName: state.actionName,
    actionDescription: state.actionDescription,
    executeSensitiveAction,
    handleReauthSuccess,
    handleDialogClose,
  };
}
