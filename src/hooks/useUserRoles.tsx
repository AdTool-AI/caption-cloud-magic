import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { isAwsTestBackend } from '@/lib/backendTarget';

export type AppRole = 'admin' | 'moderator' | 'user';

export const useUserRoles = () => {
  const { user } = useAuth();
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const fetchRoles = async () => {
      if (isAwsTestBackend) {
        // Workspace role rows are not a source of global admin authority.
        setRoles([]);
        setError(null);
        setLoading(false);
        return;
      }
      if (!user) {
        setRoles([]);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const { data, error } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id);

        if (error) throw error;

        setRoles(data?.map(r => r.role as AppRole) || []);
      } catch (err) {
        console.error('Error fetching user roles:', err);
        setError(err as Error);
        setRoles([]);
      } finally {
        setLoading(false);
      }
    };

    fetchRoles();
  }, [user]);

  const hasRole = (role: AppRole): boolean => {
    return !isAwsTestBackend && roles.includes(role);
  };

  const isAdmin = hasRole('admin');
  const isModerator = hasRole('moderator');

  return {
    roles: isAwsTestBackend ? [] : roles,
    globalRoleStatus: isAwsTestBackend ? 'unavailable' as const : 'legacy' as const,
    loading,
    error,
    hasRole,
    isAdmin,
    isModerator,
  };
};
