CREATE TABLE IF NOT EXISTS public.staff_wallet_accounts (
  user_id uuid PRIMARY KEY,
  label text NOT NULL DEFAULT 'staff',
  top_up_to numeric(10,2) NOT NULL DEFAULT 5000.00,
  min_balance numeric(10,2) NOT NULL DEFAULT 1000.00,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.staff_wallet_accounts TO service_role;
ALTER TABLE public.staff_wallet_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role manages staff wallet accounts" ON public.staff_wallet_accounts;
CREATE POLICY "Service role manages staff wallet accounts"
ON public.staff_wallet_accounts FOR ALL
USING ((auth.jwt() ->> 'role') = 'service_role')
WITH CHECK ((auth.jwt() ->> 'role') = 'service_role');


-- SOURCE EXPORT: historical customer-specific statement omitted; no schema or reusable function removed.


CREATE OR REPLACE FUNCTION public.staff_wallet_topup()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec record;
  topped integer := 0;
  new_balance numeric(10,2);
  granted numeric(10,2);
BEGIN
  FOR rec IN
    SELECT s.user_id, s.top_up_to, s.min_balance, s.label, w.balance_euros, w.currency
    FROM public.staff_wallet_accounts s
    JOIN public.ai_video_wallets w ON w.user_id = s.user_id
    WHERE s.active = true AND w.balance_euros < s.min_balance
  LOOP
    granted := rec.top_up_to - rec.balance_euros;

    UPDATE public.ai_video_wallets
       SET balance_euros = rec.top_up_to,
           updated_at = now()
     WHERE user_id = rec.user_id
    RETURNING balance_euros INTO new_balance;

    INSERT INTO public.ai_video_transactions
      (user_id, type, amount_euros, balance_after, description, currency, metadata)
    VALUES
      (rec.user_id, 'bonus', granted, new_balance,
       'Internal staff wallet top-up (' || rec.label || ')',
       rec.currency,
       jsonb_build_object('source', 'staff_wallet_topup', 'staff_label', rec.label, 'revenue_excluded', true));

    topped := topped + 1;
  END LOOP;

  RETURN topped;
END;
$$;

REVOKE ALL ON FUNCTION public.staff_wallet_topup() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.staff_wallet_topup() TO service_role;

SELECT public.staff_wallet_topup();

SELECT cron.schedule('staff-wallet-topup-daily', '17 3 * * *', $$SELECT public.staff_wallet_topup();$$);