import {isAwsTestBackend} from '@/lib/backendTarget';
export function AwsTestBanner() {
  if (!isAwsTestBackend) return null;
  return <div role="status" className="bg-amber-100 px-3 py-1 text-center text-xs text-amber-950">
    {import.meta.env.VITE_LOCAL_REAL_AWS==='true'?'LOCAL FRONTEND - REAL AWS BACKEND - saves change AWS data':'AWS backend - migration validation - selected features only'}
  </div>;
}
