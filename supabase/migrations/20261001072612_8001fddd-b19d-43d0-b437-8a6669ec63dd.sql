REVOKE EXECUTE ON FUNCTION public.increment_model_qa_stats(text, text, text, boolean, numeric, jsonb) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_model_qa_stats(text, text, text, boolean, numeric, jsonb) TO service_role;
REVOKE EXECUTE ON FUNCTION public.campaign_ledger_entry(uuid, uuid, uuid, text, numeric, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.campaign_ledger_entry(uuid, uuid, uuid, text, numeric, text) TO service_role;
REVOKE EXECUTE ON FUNCTION public.reserve_campaign_spend(uuid, uuid, numeric, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_campaign_spend(uuid, uuid, numeric, text) TO service_role;