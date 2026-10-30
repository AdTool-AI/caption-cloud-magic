import { plannerDraftBlock, type DraftBlock } from './plannerBlockWrite.ts';
export type Preview = { contract_version: 'planner-preview-v1'; persisted: false; workspace_id: string; weekplan_id: string; suggestions: DraftBlock[] };
export function validatePreview(value: unknown, workspaceId: string, weekplanId: string): Preview {
  const data = value as any;
  if (!data || data.contract_version !== 'planner-preview-v1' || data.persisted !== false || data.mode !== 'new' ||
      data.workspace_id !== workspaceId || data.weekplan_id !== weekplanId || !Array.isArray(data.suggestions) || data.suggestions.length > 100) throw new Error('INVALID_RECOMMENDATION_PREVIEW');
  const content = new Set<string>();
  const suggestions = data.suggestions.map((row: any) => {
    if (!row || row.id !== undefined || row.expected_updated_at !== undefined || typeof row.content_id !== 'string' || content.has(row.content_id.toLowerCase())) throw new Error('INVALID_RECOMMENDATION_PREVIEW');
    content.add(row.content_id.toLowerCase());
    return plannerDraftBlock(row, workspaceId, weekplanId);
  });
  return { contract_version: 'planner-preview-v1', persisted: false, workspace_id: workspaceId, weekplan_id: weekplanId, suggestions };
}
