import { useAuth } from '@/hooks/useAuth';
import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useCalendarApprovals } from '@/hooks/useCalendarApprovals';
import { approvalEvent, type ApprovalEvent, type ApprovalReceipt } from '@/lib/calendarApprovalWrite';
import { Link } from 'react-router-dom';

type Reviewer = { id: string; label: string };
export function ApprovalDialog(props: { eventId: string; open: boolean; onClose: () => void }) {
  const { user } = useAuth();
  if (!user) return null;
  return <ApprovalDialogContent key={JSON.stringify([user?.id, props.eventId, props.open])} {...props} />;
}

function ApprovalDialogContent({ eventId, open, onClose }: { eventId: string; open: boolean; onClose: () => void }) {
  const { requestApproval, loading: submitting } = useCalendarApprovals();
  const [event, setEvent] = useState<ApprovalEvent | null>(null);
  const [members, setMembers] = useState<Reviewer[]>([]);
  const [selected, setSelected] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [receipt, setReceipt] = useState<ApprovalReceipt | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const scope = useRef(0);
  useEffect(() => {
    const current = ++scope.current;
    setEvent(null); setMembers([]); setSelected(''); setReceipt(null); setError('');
    if (!open) return;
    setLoading(true);
    (async () => {
      try {
        const result = await supabase.from('calendar_events').select('id,workspace_id,updated_at,version').eq('id', eventId).single();
        if (current !== scope.current) return;
        if (result.error) throw new Error();
        const snapshot = approvalEvent(result.data);
        const [team, workspace] = await Promise.all([
          supabase.from('workspace_members').select('user_id,profiles(email)').eq('workspace_id', snapshot.workspace_id),
          supabase.from('workspaces').select('owner_id').eq('id', snapshot.workspace_id).single(),
        ]);
        if (team.error || workspace.error || !workspace.data?.owner_id) throw new Error();
        const choices = new Map<string, Reviewer>();
        choices.set(workspace.data.owner_id, { id: workspace.data.owner_id, label: 'Workspace owner' });
        for (const row of team.data ?? []) {
          const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
          choices.set(row.user_id, { id: row.user_id, label: profile?.email || `Workspace member (${row.user_id.slice(-6)})` });
        }
        if (current !== scope.current) return;
        setEvent(snapshot); setMembers([...choices.values()]);
        setExpiresAt(new Date(Date.now() + 3 * 86400000).toISOString());
      } catch { if (current === scope.current) setError('Could not load the event and its workspace reviewers. Close and reopen to reload.'); }
      finally { if (current === scope.current) setLoading(false); }
    })();
    return () => { scope.current++; };
  }, [open, eventId]);
  async function submit() {
    if (!event || !selected || submitting) return;
    const current = scope.current;
    const result = await requestApproval(event, [{ user_id: selected, email: members.find(row => row.id === selected)?.label ?? '' }], expiresAt);
    if (result && current === scope.current) setReceipt(result);
  }
  return <Dialog open={open} onOpenChange={value => { if (!value && !submitting) onClose(); }}>
    <DialogContent className="max-w-lg">
      <DialogHeader><DialogTitle>Request a workspace review</DialogTitle></DialogHeader>
      <p className="text-sm text-muted-foreground">The selected member must sign in to review. Requests expire after three days. Recording an approval does not publish or schedule content.</p>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {receipt ? <div className="space-y-3">
        <p>Review request recorded. No email has been sent.</p>
        {receipt.approvals.map(row => <Link key={row.approval_id} className="block underline" to={`/review/request/${row.approval_id}`}>Open signed-in review</Link>)}
        <p className="text-xs text-muted-foreground">Only the designated reviewer can submit a decision.</p>
      </div> : <div className="space-y-2">
        <Label>Workspace reviewer</Label>
        <Select value={selected} onValueChange={setSelected} disabled={loading || submitting || !event}>
          <SelectTrigger><SelectValue placeholder={loading ? 'Loading reviewers…' : 'Choose a member'} /></SelectTrigger>
          <SelectContent>{members.map(row => <SelectItem key={row.id} value={row.id}>{row.label}</SelectItem>)}</SelectContent>
        </Select>
      </div>}
      <DialogFooter>
        <Button variant="outline" disabled={submitting} onClick={onClose}>Close</Button>
        {!receipt && <Button disabled={loading || submitting || !event || !selected} onClick={submit}>{submitting ? 'Requesting…' : 'Request review'}</Button>}
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
