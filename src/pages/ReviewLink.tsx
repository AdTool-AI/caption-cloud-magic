import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { APPROVAL_READ_FIELDS, useCalendarApprovals } from '@/hooks/useCalendarApprovals';
import { approvalUuid, type ApprovalContext } from '@/lib/calendarApprovalWrite';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { SEO } from '@/components/SEO';

type Review = ApprovalContext & { status: string; token_expires_at: string | null; comment: string | null };
type Preview = { title: string; brief: string | null; caption: string | null };
export default function ReviewLink() {
  const { approvalId } = useParams();
  const { user, loading: authLoading } = useAuth();
  const { approveStage, rejectApproval, loading: submitting } = useCalendarApprovals();
  const [review, setReview] = useState<Review | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const scope = useRef(0);
  useEffect(() => {
    const current = ++scope.current;
    setReview(null); setPreview(null); setComment(''); setError('');
    // Legacy /review/:token never queries by token, even for signed-in users.
    if (!user?.id || !approvalUuid(approvalId)) return;
    setLoading(true);
    (async () => {
      try {
        const approval = await supabase.from('calendar_approvals').select(APPROVAL_READ_FIELDS).eq('id', approvalId).eq('approver_id', user.id).single();
        if (approval.error || !approval.data || approval.data.approver_id !== user.id) throw new Error();
        const event = await supabase.from('calendar_events').select('id,workspace_id,title,brief,caption').eq('id', approval.data.event_id).single();
        if (event.error || !event.data || !approvalUuid(event.data.workspace_id)) throw new Error();
        if (current !== scope.current) return;
        setReview({ approval_id: approval.data.id, event_id: approval.data.event_id, approver_id: approval.data.approver_id, workspace_id: event.data.workspace_id, status: approval.data.status, token_expires_at: approval.data.token_expires_at, comment: approval.data.comment });
        setPreview({ title: event.data.title, brief: event.data.brief, caption: event.data.caption });
      } catch { if (current === scope.current) setError('This review is unavailable for your account. Ask the requester to check your workspace membership.'); }
      finally { if (current === scope.current) setLoading(false); }
    })();
    return () => { scope.current++; };
  }, [approvalId, user?.id, refresh]);
  async function decide(decision: 'approved' | 'rejected') {
    if (!review || submitting) return;
    const current = scope.current;
    const result = decision === 'approved' ? await approveStage(review, comment.trim() || undefined) : await rejectApproval(review, comment.trim() || undefined);
    if (result && current === scope.current) setRefresh(value => value + 1);
  }
  const expired = !review?.token_expires_at || !Number.isFinite(Date.parse(review.token_expires_at)) || Date.parse(review.token_expires_at) <= Date.now();
  return <main className="min-h-screen bg-background p-4">
    <SEO title="Workspace review" description="Review content with your workspace account" />
    <div className="max-w-3xl mx-auto py-8 space-y-5">
      <Card><CardHeader><CardTitle>Workspace review</CardTitle></CardHeader><CardContent className="space-y-4">
        {!approvalUuid(approvalId) ? <p>This link format is no longer supported. Ask your team for a signed-in workspace review request.</p>
          : authLoading ? <p role="status">Checking sign-in…</p>
          : !user ? <><p>Sign in with the account designated to review this request.</p><Link className="underline" to="/auth">Sign in</Link></>
          : loading ? <p role="status">Loading review…</p>
          : error ? <><p role="alert">{error}</p><Button variant="outline" onClick={() => setRefresh(value => value + 1)}>Reload review</Button></>
          : review && preview ? <>
            <h2 className="text-xl font-semibold">{preview.title}</h2>
            {preview.brief && <p className="whitespace-pre-wrap">{preview.brief}</p>}
            {preview.caption && <p className="whitespace-pre-wrap">{preview.caption}</p>}
            <p className="text-sm text-muted-foreground">A review decision records feedback only. It does not publish, schedule or change the event status. If the content has changed since this request, the server will require a new review.</p>
            {review.status !== 'pending' ? <><p>Recorded review: {review.status === 'approved' ? 'Approved' : review.status === 'rejected' ? 'Changes requested' : review.status}</p>{review.comment && <p className="whitespace-pre-wrap">{review.comment}</p>}</>
              : expired ? <p>This request has expired or cannot be reviewed. Ask the requester for a new request.</p>
              : <>
                <label htmlFor="review-comment">Feedback (optional)</label>
                <Textarea id="review-comment" value={comment} onChange={event => setComment(event.target.value)} maxLength={4000} disabled={submitting} />
                <div className="flex flex-wrap gap-3">
                  <Button disabled={submitting} onClick={() => decide('approved')}>Record approval</Button>
                  <Button variant="outline" disabled={submitting} onClick={() => decide('rejected')}>Request changes</Button>
                </div>
              </>}
          </> : null}
      </CardContent></Card>
    </div>
  </main>;
}
