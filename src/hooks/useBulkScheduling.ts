import { tx } from "@/lib/i18nText";
import { useRef, useState } from 'react';
import { bulkScheduleRequestId } from '@/lib/bulkScheduleRequest';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface BulkScheduleEvent {
  title: string;
  caption?: string;
  channels: string[];
  brand_kit_id?: string;
}

export interface BulkScheduleConfig {
  workspace_id: string;
  start_date: string;
  end_date: string;
  events: BulkScheduleEvent[];
  distribution_strategy: 'even' | 'optimal' | 'manual';
  posting_slots?: string[];
  use_posting_times?: boolean;
}

export function useBulkScheduling() {
  const [loading, setLoading] = useState(false);
  const inFlight = useRef(false);
  const { toast } = useToast();

  const bulkSchedule = async (config: BulkScheduleConfig) => {
    if (inFlight.current) return null;
    inFlight.current = true;
    setLoading(true);
    try {
      const payload = JSON.parse(JSON.stringify(config)) as BulkScheduleConfig;
      const { data: identity, error: authError } = await supabase.auth.getUser();
      if (authError || !identity.user) throw new Error('Sign in before bulk scheduling.');
      const request_id = await bulkScheduleRequestId(identity.user.id, payload, window.sessionStorage);
      const { data, error } = await supabase.functions.invoke('calendar-bulk-schedule', {
        body: { ...payload, request_id }
      });

      if (error) throw error;

      toast({
        title: tx({ de: '🎉 Bulk Scheduling erfolgreich', en: '🎉 Bulk scheduling successful', es: '🎉 Programación masiva exitosa' }),
        description: tx({ de: `${data.events_created} Events geplant`, en: `${data.events_created} events scheduled`, es: `${data.events_created} eventos programados` }),
      });

      return data;
    } catch (error: any) {
      console.error('Bulk schedule error:', error);
      toast({
        title: tx({ de: 'Fehler', en: 'Mistake', es: 'Error' }),
        description: error.message,
        variant: 'destructive',
      });
      return null;
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  };

  const getBulkScheduleJobs = async (workspace_id: string) => {
    try {
      const { data, error } = await supabase
        .from('bulk_schedule_jobs')
        .select('*')
        .eq('workspace_id', workspace_id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Get bulk schedule jobs error:', error);
      return [];
    }
  };

  return {
    loading,
    bulkSchedule,
    getBulkScheduleJobs,
  };
}
